import request from 'supertest';
import { Express } from 'express';
import {
  createSecurityTestServer,
  authedRequest,
  apiKeyReq,
} from '../security/security-helpers';

// Mock multi-tenant service
vi.mock('../../src/services/multiTenant.service', () => ({
  createTenant: vi.fn(),
  getTenant: vi.fn(),
  listTenants: vi.fn(),
  updateTenant: vi.fn(),
  suspendTenant: vi.fn(),
  activateTenant: vi.fn(),
  deleteTenant: vi.fn(),
  getUsage: vi.fn(),
  getStats: vi.fn(),
}));

import * as tenantService from '../../src/services/multiTenant.service';

const mockedService = tenantService as anyed<typeof tenantService>;

const mockTenant = {
  id: 'tenant-001',
  name: 'Acme Corp',
  slug: 'acme-corp',
  status: 'active' as const,
  config: {
    maxCredentials: 1000,
    maxIssuers: 10,
    maxHolders: 100,
  },
  createdAt: new Date().toISOString(),
};

const validCreateBody = {
  name: 'Acme Corp',
  slug: 'acme-corp',
  config: {
    maxCredentials: 1000,
  },
};

describe('Tenant Routes', () => {
  let app: Express;

  beforeAll(() => {
    app = createSecurityTestServer();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── POST /api/v1/tenants ──────────────────────────────────────────────

  describe('POST /api/v1/tenants', () => {
    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/v1/tenants')
        .send(validCreateBody);
      expect(res.status).toBe(401);
    });

    it('should create a tenant with valid body', async () => {
      mockedService.createTenant.mockResolvedValue(mockTenant as any);

      const res = await authedRequest(app)
        .post('/api/v1/tenants')
        .send(validCreateBody);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.tenant).toBeDefined();
      expect(mockedService.createTenant).toHaveBeenCalledWith(
        'Acme Corp',
        'acme-corp',
        expect.objectContaining({ maxCredentials: 1000 }),
      );
    });

    it('should accept API key authentication', async () => {
      mockedService.createTenant.mockResolvedValue(mockTenant as any);

      const res = await apiKeyReq(app)
        .post('/api/v1/tenants')
        .send(validCreateBody);

      expect(res.status).not.toBe(401);
    });

    it('should return 400 when name is missing', async () => {
      const { name, ...body } = validCreateBody;

      const res = await authedRequest(app)
        .post('/api/v1/tenants')
        .send(body);

      expect(res.status).toBe(400);
    });

    it('should return 400 when slug is missing', async () => {
      const { slug, ...body } = validCreateBody;

      const res = await authedRequest(app)
        .post('/api/v1/tenants')
        .send(body);

      expect(res.status).toBe(400);
    });

    it('should return 400 when slug has invalid characters', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/tenants')
        .send({ ...validCreateBody, slug: 'INVALID SLUG!' });

      expect(res.status).toBe(400);
    });

    it('should return 400 when slug contains uppercase', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/tenants')
        .send({ ...validCreateBody, slug: 'AcmeCorp' });

      expect(res.status).toBe(400);
    });

    it('should accept slug with hyphens and numbers', async () => {
      mockedService.createTenant.mockResolvedValue(mockTenant as any);

      const res = await authedRequest(app)
        .post('/api/v1/tenants')
        .send({ ...validCreateBody, slug: 'acme-corp-123' });

      expect(res.status).toBe(201);
    });
  });

  // ── GET /api/v1/tenants ───────────────────────────────────────────────

  describe('GET /api/v1/tenants', () => {
    it('should require authentication', async () => {
      const res = await request(app).get('/api/v1/tenants');
      expect(res.status).toBe(401);
    });

    it('should list all tenants', async () => {
      mockedService.listTenants.mockResolvedValue([mockTenant] as any);

      const res = await authedRequest(app).get('/api/v1/tenants');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.tenants).toHaveLength(1);
      expect(res.body.total).toBe(1);
    });

    it('should filter tenants by status', async () => {
      mockedService.listTenants.mockResolvedValue([mockTenant] as any);

      const res = await authedRequest(app).get('/api/v1/tenants?status=active');

      expect(res.status).toBe(200);
      expect(mockedService.listTenants).toHaveBeenCalledWith('active');
    });

    it('should ignore invalid status filter', async () => {
      mockedService.listTenants.mockResolvedValue([mockTenant] as any);

      const res = await authedRequest(app).get('/api/v1/tenants?status=invalid');

      expect(res.status).toBe(200);
      expect(mockedService.listTenants).toHaveBeenCalledWith(undefined);
    });

    it('should return empty array when no tenants', async () => {
      mockedService.listTenants.mockResolvedValue([]);

      const res = await authedRequest(app).get('/api/v1/tenants');

      expect(res.status).toBe(200);
      expect(res.body.tenants).toHaveLength(0);
      expect(res.body.total).toBe(0);
    });
  });

  // ── GET /api/v1/tenants/stats ─────────────────────────────────────────

  describe('GET /api/v1/tenants/stats', () => {
    it('should require authentication', async () => {
      const res = await request(app).get('/api/v1/tenants/stats');
      expect(res.status).toBe(401);
    });

    it('should return aggregated stats', async () => {
      mockedService.getStats.mockResolvedValue({
        totalTenants: 5,
        activeTenants: 4,
        suspendedTenants: 1,
      } as any);

      const res = await authedRequest(app).get('/api/v1/tenants/stats');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.totalTenants).toBe(5);
    });
  });

  // ── GET /api/v1/tenants/:id ───────────────────────────────────────────

  describe('GET /api/v1/tenants/:id', () => {
    it('should require authentication', async () => {
      const res = await request(app).get('/api/v1/tenants/tenant-001');
      expect(res.status).toBe(401);
    });

    it('should return tenant by ID for admin user', async () => {
      mockedService.getTenant.mockResolvedValue(mockTenant as any);

      const res = await authedRequest(app).get('/api/v1/tenants/tenant-001');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.tenant.id).toBe('tenant-001');
    });

    it('should return 404 when tenant not found', async () => {
      mockedService.getTenant.mockResolvedValue(null as any);

      const res = await authedRequest(app).get('/api/v1/tenants/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // ── PUT /api/v1/tenants/:id ───────────────────────────────────────────

  describe('PUT /api/v1/tenants/:id', () => {
    it('should require authentication', async () => {
      const res = await request(app)
        .put('/api/v1/tenants/tenant-001')
        .send({ name: 'Updated Name' });
      expect(res.status).toBe(401);
    });

    it('should update tenant details', async () => {
      const updatedTenant = { ...mockTenant, name: 'Updated Acme' };
      mockedService.updateTenant.mockResolvedValue(updatedTenant as any);

      const res = await authedRequest(app)
        .put('/api/v1/tenants/tenant-001')
        .send({ name: 'Updated Acme' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockedService.updateTenant).toHaveBeenCalledWith(
        'tenant-001',
        expect.objectContaining({ name: 'Updated Acme' }),
      );
    });

    it('should update tenant config', async () => {
      mockedService.updateTenant.mockResolvedValue(mockTenant as any);

      const res = await authedRequest(app)
        .put('/api/v1/tenants/tenant-001')
        .send({ config: { maxCredentials: 2000 } });

      expect(res.status).toBe(200);
    });

    it('should return 400 when name is empty string', async () => {
      const res = await authedRequest(app)
        .put('/api/v1/tenants/tenant-001')
        .send({ name: '' });

      expect(res.status).toBe(400);
    });
  });

  // ── POST /api/v1/tenants/:id/suspend ──────────────────────────────────

  describe('POST /api/v1/tenants/:id/suspend', () => {
    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/v1/tenants/tenant-001/suspend')
        .send({});
      expect(res.status).toBe(401);
    });

    it('should suspend a tenant', async () => {
      mockedService.suspendTenant.mockResolvedValue(undefined as any);

      const res = await authedRequest(app)
        .post('/api/v1/tenants/tenant-001/suspend')
        .send({ reason: 'Policy violation' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Tenant suspended');
      expect(mockedService.suspendTenant).toHaveBeenCalledWith(
        'tenant-001',
        'Policy violation',
      );
    });

    it('should suspend without reason', async () => {
      mockedService.suspendTenant.mockResolvedValue(undefined as any);

      const res = await authedRequest(app)
        .post('/api/v1/tenants/tenant-001/suspend')
        .send({});

      expect(res.status).toBe(200);
      expect(mockedService.suspendTenant).toHaveBeenCalledWith(
        'tenant-001',
        undefined,
      );
    });
  });

  // ── POST /api/v1/tenants/:id/activate ─────────────────────────────────

  describe('POST /api/v1/tenants/:id/activate', () => {
    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/v1/tenants/tenant-001/activate')
        .send({});
      expect(res.status).toBe(401);
    });

    it('should activate a suspended tenant', async () => {
      mockedService.activateTenant.mockResolvedValue(undefined as any);

      const res = await authedRequest(app)
        .post('/api/v1/tenants/tenant-001/activate')
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Tenant activated');
      expect(mockedService.activateTenant).toHaveBeenCalledWith('tenant-001');
    });
  });

  // ── DELETE /api/v1/tenants/:id ────────────────────────────────────────

  describe('DELETE /api/v1/tenants/:id', () => {
    it('should require authentication', async () => {
      const res = await request(app).delete('/api/v1/tenants/tenant-001');
      expect(res.status).toBe(401);
    });

    it('should delete a tenant', async () => {
      mockedService.deleteTenant.mockResolvedValue(true as any);

      const res = await authedRequest(app).delete('/api/v1/tenants/tenant-001');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Tenant deleted');
    });

    it('should return 404 when tenant not found', async () => {
      mockedService.deleteTenant.mockResolvedValue(false as any);

      const res = await authedRequest(app).delete('/api/v1/tenants/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // ── GET /api/v1/tenants/:id/usage ─────────────────────────────────────

  describe('GET /api/v1/tenants/:id/usage', () => {
    it('should require authentication', async () => {
      const res = await request(app).get('/api/v1/tenants/tenant-001/usage');
      expect(res.status).toBe(401);
    });

    it('should return tenant usage metrics for admin', async () => {
      mockedService.getUsage.mockResolvedValue({
        credentials: 42,
        issuers: 3,
        holders: 15,
      } as any);

      const res = await authedRequest(app).get('/api/v1/tenants/tenant-001/usage');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.usage).toBeDefined();
      expect(res.body.usage.credentials).toBe(42);
    });

    it('should return 404 when usage data not found', async () => {
      mockedService.getUsage.mockResolvedValue(null as any);

      const res = await authedRequest(app).get('/api/v1/tenants/tenant-001/usage');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
});
