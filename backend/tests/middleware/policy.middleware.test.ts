import { Request, Response, NextFunction } from 'express';
import { enforcePolicy } from '../../src/api/middleware/policy.middleware';
import { AuthenticatedRequest } from '../../src/api/middleware/auth.middleware';

// Mock dependencies
jest.mock('../../src/core/feature-flags', () => ({
  isFeatureEnabled: jest.fn(),
}));

jest.mock('../../src/services/policy.service', () => ({
  evaluatePolicy: jest.fn(),
}));

import { isFeatureEnabled } from '../../src/core/feature-flags';
import { evaluatePolicy } from '../../src/services/policy.service';

const mockIsFeatureEnabled = isFeatureEnabled as jest.MockedFunction<typeof isFeatureEnabled>;
const mockEvaluatePolicy = evaluatePolicy as jest.MockedFunction<typeof evaluatePolicy>;

describe('Policy Middleware — enforcePolicy', () => {
  let mockRequest: Partial<AuthenticatedRequest>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      headers: {},
      originalUrl: '/api/v1/credentials',
      method: 'POST',
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();

    jest.clearAllMocks();
  });

  describe('feature flag disabled (pass-through)', () => {
    beforeEach(() => {
      mockIsFeatureEnabled.mockReturnValue(false);
    });

    it('should call next() without checking policy', () => {
      const middleware = enforcePolicy('credential:issue', 'credentials');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockEvaluatePolicy).not.toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should pass through even without user on request', () => {
      // No user set
      const middleware = enforcePolicy('credential:issue', 'credentials');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('feature flag enabled — unauthenticated', () => {
    beforeEach(() => {
      mockIsFeatureEnabled.mockReturnValue(true);
    });

    it('should return 401 when user is not set', () => {
      const middleware = enforcePolicy('credential:issue', 'credentials');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();

      const body = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(body.error).toBe('Not authenticated');
      expect(body.requestId).toBeDefined();
    });

    it('should use requestId from request object if available', () => {
      (mockRequest as any).requestId = 'req-123';

      const middleware = enforcePolicy('credential:issue', 'credentials');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      const body = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(body.requestId).toBe('req-123');
    });
  });

  describe('feature flag enabled — policy allows', () => {
    beforeEach(() => {
      mockIsFeatureEnabled.mockReturnValue(true);
      mockRequest.user = { sub: 'issuer-1', role: 'issuer', permissions: ['credential:issue'] };
      mockRequest.authMethod = 'jwt';
    });

    it('should call next() when policy evaluates to allow', () => {
      mockEvaluatePolicy.mockReturnValue({
        allowed: true,
        reason: 'Allowed by policy: issuer-credential-ops',
      });

      const middleware = enforcePolicy('credential:issue', 'credentials');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should pass correct context to evaluatePolicy', () => {
      mockEvaluatePolicy.mockReturnValue({ allowed: true, reason: 'ok' });

      const middleware = enforcePolicy('credential:issue', 'credentials');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockEvaluatePolicy).toHaveBeenCalledWith({
        principal: {
          sub: 'issuer-1',
          role: 'issuer',
          permissions: ['credential:issue'],
        },
        action: 'credential:issue',
        resource: 'credentials',
        metadata: {
          method: 'POST',
          path: '/api/v1/credentials',
          authMethod: 'jwt',
        },
      });
    });
  });

  describe('feature flag enabled — policy denies', () => {
    beforeEach(() => {
      mockIsFeatureEnabled.mockReturnValue(true);
      mockRequest.user = { sub: 'holder-1', role: 'holder', permissions: ['wallet:read'] };
      mockRequest.authMethod = 'jwt';
    });

    it('should return 403 when policy denies', () => {
      mockEvaluatePolicy.mockReturnValue({
        allowed: false,
        reason: 'No matching policy found — default deny',
      });

      const middleware = enforcePolicy('credential:issue', 'credentials');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should include action, resource, and reason in 403 response', () => {
      mockEvaluatePolicy.mockReturnValue({
        allowed: false,
        reason: 'Denied by policy: restricted-access',
      });

      const middleware = enforcePolicy('credential:issue', 'credentials');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      const body = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(body.error).toBe('Policy denied');
      expect(body.detail).toBe('Denied by policy: restricted-access');
      expect(body.action).toBe('credential:issue');
      expect(body.resource).toBe('credentials');
      expect(body.requestId).toBeDefined();
    });
  });

  describe('wildcard permission bypass', () => {
    beforeEach(() => {
      mockIsFeatureEnabled.mockReturnValue(true);
      mockRequest.user = { sub: 'api-key-user', permissions: ['*'] };
      mockRequest.authMethod = 'apikey';
    });

    it('should pass through when evaluatePolicy returns allow for wildcard', () => {
      mockEvaluatePolicy.mockReturnValue({
        allowed: true,
        reason: 'Wildcard permission',
        matchedRule: 'wildcard-permission-bypass',
      });

      const middleware = enforcePolicy('anything', 'any-resource');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should pass wildcard permissions in context', () => {
      mockEvaluatePolicy.mockReturnValue({ allowed: true, reason: 'Wildcard permission' });

      const middleware = enforcePolicy('admin:action', 'admin-resource');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      const ctx = mockEvaluatePolicy.mock.calls[0][0];
      expect(ctx.principal.permissions).toContain('*');
    });
  });

  describe('context extraction', () => {
    beforeEach(() => {
      mockIsFeatureEnabled.mockReturnValue(true);
      mockEvaluatePolicy.mockReturnValue({ allowed: true, reason: 'ok' });
    });

    it('should extract method and originalUrl into metadata', () => {
      mockRequest.user = { sub: 'u1', role: 'admin' };
      mockRequest.method = 'DELETE';
      mockRequest.originalUrl = '/api/v1/tenants/123';
      mockRequest.authMethod = 'apikey';

      const middleware = enforcePolicy('tenant:delete', 'tenants');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      const ctx = mockEvaluatePolicy.mock.calls[0][0];
      expect(ctx.metadata).toEqual({
        method: 'DELETE',
        path: '/api/v1/tenants/123',
        authMethod: 'apikey',
      });
    });

    it('should handle user with no role', () => {
      mockRequest.user = { sub: 'anon-user' };

      const middleware = enforcePolicy('read', 'docs');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      const ctx = mockEvaluatePolicy.mock.calls[0][0];
      expect(ctx.principal.role).toBeUndefined();
      expect(ctx.principal.sub).toBe('anon-user');
    });

    it('should handle user with no permissions', () => {
      mockRequest.user = { sub: 'no-perms-user', role: 'viewer' };

      const middleware = enforcePolicy('read', 'docs');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      const ctx = mockEvaluatePolicy.mock.calls[0][0];
      expect(ctx.principal.permissions).toBeUndefined();
    });
  });

  describe('different action/resource combinations', () => {
    beforeEach(() => {
      mockIsFeatureEnabled.mockReturnValue(true);
      mockRequest.user = { sub: 'verifier-1', role: 'verifier', permissions: ['verification:create'] };
    });

    it('should pass different action/resource to evaluatePolicy', () => {
      mockEvaluatePolicy.mockReturnValue({ allowed: true, reason: 'ok' });

      const middleware = enforcePolicy('verification:create', 'verifications');
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      const ctx = mockEvaluatePolicy.mock.calls[0][0];
      expect(ctx.action).toBe('verification:create');
      expect(ctx.resource).toBe('verifications');
    });
  });
});
