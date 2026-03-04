import { Request, Response, NextFunction } from 'express';
import {
  requestIdMiddleware,
  errorMiddleware,
  notFoundMiddleware,
  createApiError,
  asyncHandler,
} from '../../src/api/middleware/error.middleware';

describe('Error Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      headers: {},
      originalUrl: '/test',
      path: '/test',
      method: 'GET',
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
    };
    mockNext = jest.fn();
  });

  describe('requestIdMiddleware', () => {
    it('should generate request ID if not provided', () => {
      requestIdMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect((mockRequest as any).requestId).toBeDefined();
      expect(typeof (mockRequest as any).requestId).toBe('string');
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-Request-ID',
        expect.any(String)
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it('should use provided request ID', () => {
      const providedId = 'custom-request-id-123';
      mockRequest.headers = { 'x-request-id': providedId };

      requestIdMiddleware(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect((mockRequest as any).requestId).toBe(providedId);
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-Request-ID',
        providedId
      );
    });
  });

  describe('errorMiddleware', () => {
    it('should return RFC 7807 format for errors', () => {
      const error = createApiError('Test error', 400);

      errorMiddleware(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      const errorResponse = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(errorResponse).toHaveProperty('type');
      expect(errorResponse).toHaveProperty('title', 'Bad Request');
      expect(errorResponse).toHaveProperty('status', 400);
      expect(errorResponse).toHaveProperty('detail', 'Test error');
      expect(errorResponse).toHaveProperty('instance', '/test');
      expect(errorResponse).toHaveProperty('requestId');
    });

    it('should use 500 as default status code', () => {
      const error = new Error('Unknown error');

      errorMiddleware(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(500);
    });

    it('should include error code if provided', () => {
      const error = createApiError('Test error', 400, 'VALIDATION_ERROR');

      errorMiddleware(
        error,
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      const errorResponse = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(errorResponse.code).toBe('VALIDATION_ERROR');
    });

    it('should map common status codes to problem types', () => {
      const testCases = [
        { status: 401, title: 'Unauthorized' },
        { status: 403, title: 'Forbidden' },
        { status: 404, title: 'Not Found' },
        { status: 429, title: 'Too Many Requests' },
      ];

      testCases.forEach(({ status, title }) => {
        const error = createApiError('Test', status);
        errorMiddleware(
          error,
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        const errorResponse = (mockResponse.json as jest.Mock).mock.calls.pop()[0];
        expect(errorResponse.title).toBe(title);
      });
    });
  });

  describe('notFoundMiddleware', () => {
    it('should return 404 with RFC 7807 format', () => {
      notFoundMiddleware(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      const errorResponse = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(errorResponse.type).toContain('not-found');
      expect(errorResponse.title).toBe('Not Found');
      expect(errorResponse.status).toBe(404);
      expect(errorResponse.detail).toContain('/test');
    });
  });

  describe('createApiError', () => {
    it('should create error with all properties', () => {
      const error = createApiError('Message', 422, 'CODE', 'https://type.url');

      expect(error.message).toBe('Message');
      expect(error.statusCode).toBe(422);
      expect(error.code).toBe('CODE');
      expect(error.type).toBe('https://type.url');
    });
  });

  describe('asyncHandler', () => {
    it('should call next on async error', async () => {
      const asyncFn = async () => {
        throw new Error('Async error');
      };

      const handler = asyncHandler(asyncFn);
      await handler(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should not call next on success', async () => {
      const asyncFn = async (req: Request, res: Response) => {
        res.json({ success: true });
      };

      const handler = asyncHandler(asyncFn);
      await handler(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith({ success: true });
    });
  });
});
