import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import {
  authenticateJwt,
  authenticateApiKey,
  authenticateAny,
  requirePermission,
  generateToken,
  AuthenticatedRequest,
} from '../../src/api/middleware/auth.middleware';

describe('Auth Middleware', () => {
  let mockRequest: Partial<AuthenticatedRequest>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  const testSecret = 'test-jwt-secret-for-testing-only';

  beforeEach(() => {
    mockRequest = {
      headers: {},
      originalUrl: '/test',
    };
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
  });

  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const token = generateToken(
        { sub: 'test-user', permissions: ['read'] },
        { jwtSecret: testSecret, apiKeys: new Map() }
      );

      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3);

      const decoded = jwt.verify(token, testSecret) as any;
      expect(decoded.sub).toBe('test-user');
      expect(decoded.permissions).toEqual(['read']);
    });

    it('should generate token with expiration', () => {
      const token = generateToken(
        { sub: 'test-user' },
        { jwtSecret: testSecret, apiKeys: new Map() },
        '1h'
      );

      const decoded = jwt.verify(token, testSecret) as any;
      expect(decoded.exp).toBeDefined();
    });
  });

  describe('authenticateJwt', () => {
    const config = {
      jwtSecret: testSecret,
      apiKeys: new Map(),
    };

    it('should reject request without Authorization header', () => {
      const middleware = authenticateJwt(config);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject request with invalid token format', () => {
      mockRequest.headers = { authorization: 'InvalidFormat token' };

      const middleware = authenticateJwt(config);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
    });

    it('should reject request with invalid token', () => {
      mockRequest.headers = { authorization: 'Bearer invalid.token.here' };

      const middleware = authenticateJwt(config);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
    });

    it('should accept valid token and set user', () => {
      const token = generateToken(
        { sub: 'test-user', permissions: ['read'] },
        config
      );
      mockRequest.headers = { authorization: `Bearer ${token}` };

      const middleware = authenticateJwt(config);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRequest.user).toBeDefined();
      expect(mockRequest.user?.sub).toBe('test-user');
    });

    it('should reject expired token', () => {
      // Create an expired token
      const expiredToken = jwt.sign(
        { sub: 'test-user', exp: Math.floor(Date.now() / 1000) - 3600 },
        testSecret
      );
      mockRequest.headers = { authorization: `Bearer ${expiredToken}` };

      const middleware = authenticateJwt(config);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      const errorResponse = (mockResponse.json as any).mock.calls[0][0];
      expect(errorResponse.detail).toContain('expired');
    });
  });

  describe('authenticateApiKey', () => {
    const config = {
      jwtSecret: testSecret,
      apiKeys: new Map([
        ['valid-api-key', { id: 'test', name: 'Test Key', permissions: ['*'] }],
      ]),
    };

    it('should reject request without X-API-Key header', () => {
      const middleware = authenticateApiKey(config);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
    });

    it('should reject request with invalid API key', () => {
      mockRequest.headers = { 'x-api-key': 'invalid-key' };

      const middleware = authenticateApiKey(config);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
    });

    it('should accept valid API key and set user', () => {
      mockRequest.headers = { 'x-api-key': 'valid-api-key' };

      const middleware = authenticateApiKey(config);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRequest.apiKeyId).toBe('test');
      expect(mockRequest.user?.permissions).toEqual(['*']);
    });
  });

  describe('authenticateAny', () => {
    const config = {
      jwtSecret: testSecret,
      apiKeys: new Map([
        ['valid-api-key', { id: 'test', name: 'Test Key', permissions: ['*'] }],
      ]),
    };

    it('should accept JWT token', () => {
      const token = generateToken({ sub: 'jwt-user' }, config);
      mockRequest.headers = { authorization: `Bearer ${token}` };

      const middleware = authenticateAny(config);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRequest.user?.sub).toBe('jwt-user');
    });

    it('should accept API key when no JWT', () => {
      mockRequest.headers = { 'x-api-key': 'valid-api-key' };

      const middleware = authenticateAny(config);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should prefer JWT over API key', () => {
      const token = generateToken({ sub: 'jwt-user' }, config);
      mockRequest.headers = {
        authorization: `Bearer ${token}`,
        'x-api-key': 'valid-api-key',
      };

      const middleware = authenticateAny(config);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.user?.sub).toBe('jwt-user');
    });

    it('should reject when neither JWT nor API key provided', () => {
      const middleware = authenticateAny(config);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
    });
  });

  describe('requirePermission', () => {
    it('should pass when user has wildcard permission', () => {
      mockRequest.user = { sub: 'test', permissions: ['*'] };

      const middleware = requirePermission('any:permission');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should pass when user has specific permission', () => {
      mockRequest.user = { sub: 'test', permissions: ['read:docs'] };

      const middleware = requirePermission('read:docs');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject when user lacks permission', () => {
      mockRequest.user = { sub: 'test', permissions: ['read:docs'] };

      const middleware = requirePermission('write:docs');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
    });

    it('should reject when not authenticated', () => {
      const middleware = requirePermission('any:permission');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
    });
  });
});
