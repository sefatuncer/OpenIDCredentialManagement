import { Request, Response, NextFunction } from 'express';
import { requireTenant, optionalTenant } from '../../src/api/middleware/tenant.middleware';
import { AuthenticatedRequest } from '../../src/api/middleware/auth.middleware';

// Mock dependencies
vi.mock('../../src/core/feature-flags', () => ({
  isFeatureEnabled: vi.fn(),
}));

vi.mock('../../src/services/multiTenant.service', () => ({
  extractTenantFromRequest: vi.fn(),
}));

import { isFeatureEnabled } from '../../src/core/feature-flags';
import { extractTenantFromRequest } from '../../src/services/multiTenant.service';

const mockIsFeatureEnabled = isFeatureEnabled as anyedFunction<typeof isFeatureEnabled>;
const mockExtractTenant = extractTenantFromRequest as anyedFunction<typeof extractTenantFromRequest>;

const activeTenant = {
  id: 'tenant-001',
  name: 'Acme Corp',
  slug: 'acme',
  status: 'active' as const,
  config: {
    allowedCredentialTypes: ['VerifiableCredential'],
    features: { sdjwt: true, revocation: true, batchIssuance: false, webhooks: true },
  },
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

const suspendedTenant = {
  ...activeTenant,
  id: 'tenant-002',
  name: 'Suspended Corp',
  slug: 'suspended',
  status: 'suspended' as const,
};

describe('Tenant Middleware', () => {
  let mockRequest: Partial<AuthenticatedRequest>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      headers: {},
      originalUrl: '/api/v1/credentials',
    };
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();

    vi.clearAllMocks();
  });

  // ----------------------------------------------------------------
  // requireTenant()
  // ----------------------------------------------------------------
  describe('requireTenant', () => {
    describe('feature flag disabled', () => {
      beforeEach(() => {
        mockIsFeatureEnabled.mockReturnValue(false);
      });

      it('should call next() without extracting tenant', async () => {
        const middleware = requireTenant();
        await middleware(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(mockExtractTenant).not.toHaveBeenCalled();
        expect(mockResponse.status).not.toHaveBeenCalled();
      });

      it('should not set tenantId on request', async () => {
        const middleware = requireTenant();
        await middleware(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockRequest.tenantId).toBeUndefined();
      });
    });

    describe('feature flag enabled — no tenant header', () => {
      beforeEach(() => {
        mockIsFeatureEnabled.mockReturnValue(true);
        mockExtractTenant.mockResolvedValue(null);
      });

      it('should return 403 when no tenant can be extracted', async () => {
        const middleware = requireTenant();
        await middleware(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockResponse.status).toHaveBeenCalledWith(403);
        expect(mockNext).not.toHaveBeenCalled();
      });

      it('should return RFC 7807 error with tenant-required type', async () => {
        const middleware = requireTenant();
        await middleware(mockRequest as Request, mockResponse as Response, mockNext);

        const body = (mockResponse.json as any).mock.calls[0][0];
        expect(body.type).toContain('tenant-required');
        expect(body.title).toBe('Tenant Required');
        expect(body.status).toBe(403);
        expect(body.detail).toContain('X-Tenant-ID');
        expect(body.instance).toBe('/api/v1/credentials');
        expect(body.requestId).toBeDefined();
      });
    });

    describe('feature flag enabled — active tenant', () => {
      beforeEach(() => {
        mockIsFeatureEnabled.mockReturnValue(true);
        mockExtractTenant.mockResolvedValue(activeTenant as any);
      });

      it('should set tenantId on request and call next', async () => {
        const middleware = requireTenant();
        await middleware(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(mockRequest.tenantId).toBe('tenant-001');
        expect(mockRequest.tenant).toBe(activeTenant);
        expect(mockResponse.status).not.toHaveBeenCalled();
      });
    });

    describe('feature flag enabled — suspended tenant', () => {
      beforeEach(() => {
        mockIsFeatureEnabled.mockReturnValue(true);
        mockExtractTenant.mockResolvedValue(suspendedTenant as any);
      });

      it('should return 403 for suspended tenant', async () => {
        const middleware = requireTenant();
        await middleware(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockResponse.status).toHaveBeenCalledWith(403);
        expect(mockNext).not.toHaveBeenCalled();
      });

      it('should include tenant name and status in error', async () => {
        const middleware = requireTenant();
        await middleware(mockRequest as Request, mockResponse as Response, mockNext);

        const body = (mockResponse.json as any).mock.calls[0][0];
        expect(body.type).toContain('tenant-suspended');
        expect(body.title).toBe('Tenant Suspended');
        expect(body.detail).toContain('Suspended Corp');
        expect(body.detail).toContain('suspended');
      });
    });

    it('should use requestId from request object if available', async () => {
      mockIsFeatureEnabled.mockReturnValue(true);
      mockExtractTenant.mockResolvedValue(null);
      (mockRequest as any).requestId = 'req-abc';

      const middleware = requireTenant();
      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      const body = (mockResponse.json as any).mock.calls[0][0];
      expect(body.requestId).toBe('req-abc');
    });
  });

  // ----------------------------------------------------------------
  // optionalTenant()
  // ----------------------------------------------------------------
  describe('optionalTenant', () => {
    describe('feature flag disabled', () => {
      beforeEach(() => {
        mockIsFeatureEnabled.mockReturnValue(false);
      });

      it('should call next() without extracting tenant', async () => {
        const middleware = optionalTenant();
        await middleware(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(mockExtractTenant).not.toHaveBeenCalled();
      });
    });

    describe('feature flag enabled — no tenant header', () => {
      beforeEach(() => {
        mockIsFeatureEnabled.mockReturnValue(true);
        mockExtractTenant.mockResolvedValue(null);
      });

      it('should call next() without setting tenantId (non-breaking)', async () => {
        const middleware = optionalTenant();
        await middleware(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(mockRequest.tenantId).toBeUndefined();
        expect(mockResponse.status).not.toHaveBeenCalled();
      });
    });

    describe('feature flag enabled — active tenant present', () => {
      beforeEach(() => {
        mockIsFeatureEnabled.mockReturnValue(true);
        mockExtractTenant.mockResolvedValue(activeTenant as any);
      });

      it('should set tenantId and tenant on request', async () => {
        const middleware = optionalTenant();
        await middleware(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(mockRequest.tenantId).toBe('tenant-001');
        expect(mockRequest.tenant).toBe(activeTenant);
      });
    });

    describe('feature flag enabled — suspended tenant', () => {
      beforeEach(() => {
        mockIsFeatureEnabled.mockReturnValue(true);
        mockExtractTenant.mockResolvedValue(suspendedTenant as any);
      });

      it('should NOT set tenantId for non-active tenant', async () => {
        const middleware = optionalTenant();
        await middleware(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(mockRequest.tenantId).toBeUndefined();
      });
    });

    describe('error handling', () => {
      beforeEach(() => {
        mockIsFeatureEnabled.mockReturnValue(true);
      });

      it('should call next() even if extractTenantFromRequest throws', async () => {
        mockExtractTenant.mockRejectedValue(new Error('DB connection failed'));

        const middleware = optionalTenant();
        await middleware(mockRequest as Request, mockResponse as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(mockRequest.tenantId).toBeUndefined();
        expect(mockResponse.status).not.toHaveBeenCalled();
      });
    });
  });
});
