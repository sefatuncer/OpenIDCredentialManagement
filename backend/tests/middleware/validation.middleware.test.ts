import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  validateBody,
  validateQuery,
  validateParams,
} from '../../src/api/middleware/validation.middleware';

describe('Validation Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      body: {},
      query: {},
      params: {},
      originalUrl: '/test',
    };
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
  });

  describe('validateBody', () => {
    const testSchema = z.object({
      name: z.string().min(1),
      age: z.number().positive(),
    });

    it('should pass valid body and call next', () => {
      mockRequest.body = { name: 'John', age: 25 };

      const middleware = validateBody(testSchema);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should reject invalid body with 400 error', () => {
      mockRequest.body = { name: '', age: -5 };

      const middleware = validateBody(testSchema);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return RFC 7807 error format', () => {
      mockRequest.body = { name: '', age: -5 };

      const middleware = validateBody(testSchema);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      const errorResponse = (mockResponse.json as any).mock.calls[0][0];
      expect(errorResponse).toHaveProperty('type');
      expect(errorResponse).toHaveProperty('title', 'Validation Error');
      expect(errorResponse).toHaveProperty('status', 400);
      expect(errorResponse).toHaveProperty('errors');
      expect(Array.isArray(errorResponse.errors)).toBe(true);
    });

    it('should include validation error details', () => {
      mockRequest.body = { age: 'not a number' };

      const middleware = validateBody(testSchema);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      const errorResponse = (mockResponse.json as any).mock.calls[0][0];
      expect(errorResponse.errors.length).toBeGreaterThan(0);
      expect(errorResponse.errors[0]).toHaveProperty('path');
      expect(errorResponse.errors[0]).toHaveProperty('message');
    });
  });

  describe('validateQuery', () => {
    const querySchema = z.object({
      page: z.string().regex(/^\d+$/).optional(),
      limit: z.string().regex(/^\d+$/).optional(),
    });

    it('should pass valid query params', () => {
      mockRequest.query = { page: '1', limit: '10' };

      const middleware = validateQuery(querySchema);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject invalid query params', () => {
      mockRequest.query = { page: 'abc' };

      const middleware = validateQuery(querySchema);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });
  });

  describe('validateParams', () => {
    const paramsSchema = z.object({
      id: z.string().uuid(),
    });

    it('should pass valid path params', () => {
      mockRequest.params = { id: '550e8400-e29b-41d4-a716-446655440000' };

      const middleware = validateParams(paramsSchema);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject invalid path params', () => {
      mockRequest.params = { id: 'not-a-uuid' };

      const middleware = validateParams(paramsSchema);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });
  });
});
