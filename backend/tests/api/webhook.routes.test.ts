import request from 'supertest';
import { Express } from 'express';
import {
  createSecurityTestServer,
  authedRequest,
  apiKeyReq,
} from '../security/security-helpers';

// Mock webhook service
vi.mock('../../src/services/webhook.service', () => ({
  createSubscription: vi.fn(),
  updateSubscription: vi.fn(),
  deleteSubscription: vi.fn(),
  listSubscriptions: vi.fn(),
  getSubscription: vi.fn(),
  testSubscription: vi.fn(),
  getDeliveries: vi.fn(),
}));

import * as webhookService from '../../src/services/webhook.service';

const mockedService = webhookService as anyed<typeof webhookService>;

const mockWebhook = {
  id: 'wh-001',
  url: 'https://example.com/webhook',
  events: ['credential.issued'] as any,
  secret: 'abcdef1234567890secretkey',
  active: true,
  createdAt: new Date().toISOString(),
  metadata: { name: 'Test Webhook' },
};

const validCreateBody = {
  url: 'https://example.com/webhook',
  events: ['credential.issued'],
  name: 'Test Webhook',
  description: 'A test webhook subscription',
};

describe('Webhook Routes', () => {
  let app: Express;

  beforeAll(() => {
    app = createSecurityTestServer();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── POST /api/v1/webhooks ─────────────────────────────────────────────

  describe('POST /api/v1/webhooks', () => {
    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks')
        .send(validCreateBody);
      expect(res.status).toBe(401);
    });

    it('should create a webhook subscription', async () => {
      mockedService.createSubscription.mockResolvedValue(mockWebhook as any);

      const res = await authedRequest(app)
        .post('/api/v1/webhooks')
        .send(validCreateBody);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.webhook).toBeDefined();
      expect(mockedService.createSubscription).toHaveBeenCalledWith(
        validCreateBody.url,
        validCreateBody.events,
        expect.objectContaining({ name: 'Test Webhook' }),
      );
    });

    it('should accept API key authentication', async () => {
      mockedService.createSubscription.mockResolvedValue(mockWebhook as any);

      const res = await apiKeyReq(app)
        .post('/api/v1/webhooks')
        .send(validCreateBody);

      expect(res.status).not.toBe(401);
    });

    it('should return 400 when url is missing', async () => {
      const { url, ...body } = validCreateBody;

      const res = await authedRequest(app)
        .post('/api/v1/webhooks')
        .send(body);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 when url is invalid', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/webhooks')
        .send({ ...validCreateBody, url: 'not-a-url' });

      expect(res.status).toBe(400);
    });

    it('should return 400 when events is missing', async () => {
      const { events, ...body } = validCreateBody;

      const res = await authedRequest(app)
        .post('/api/v1/webhooks')
        .send(body);

      expect(res.status).toBe(400);
    });

    it('should return 400 when events is empty', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/webhooks')
        .send({ ...validCreateBody, events: [] });

      expect(res.status).toBe(400);
    });

    it('should return 400 when events contains invalid event type', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/webhooks')
        .send({ ...validCreateBody, events: ['invalid.event'] });

      expect(res.status).toBe(400);
    });

    it('should return 400 when service throws (e.g., max subscriptions)', async () => {
      mockedService.createSubscription.mockRejectedValue(
        new Error('Maximum subscriptions reached'),
      );

      const res = await authedRequest(app)
        .post('/api/v1/webhooks')
        .send(validCreateBody);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Maximum subscriptions');
    });
  });

  // ── GET /api/v1/webhooks ──────────────────────────────────────────────

  describe('GET /api/v1/webhooks', () => {
    it('should require authentication', async () => {
      const res = await request(app).get('/api/v1/webhooks');
      expect(res.status).toBe(401);
    });

    it('should list webhook subscriptions with masked secrets', async () => {
      mockedService.listSubscriptions.mockResolvedValue([mockWebhook] as any);

      const res = await authedRequest(app).get('/api/v1/webhooks');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.webhooks).toHaveLength(1);
      // Secret should be masked
      expect(res.body.webhooks[0].secret).toMatch(/^.{8}\.\.\.$/);
      expect(res.body.webhooks[0].secret).not.toBe(mockWebhook.secret);
    });

    it('should return empty array when no subscriptions', async () => {
      mockedService.listSubscriptions.mockResolvedValue([]);

      const res = await authedRequest(app).get('/api/v1/webhooks');

      expect(res.status).toBe(200);
      expect(res.body.webhooks).toHaveLength(0);
    });
  });

  // ── GET /api/v1/webhooks/:id ──────────────────────────────────────────

  describe('GET /api/v1/webhooks/:id', () => {
    it('should require authentication', async () => {
      const res = await request(app).get('/api/v1/webhooks/wh-001');
      expect(res.status).toBe(401);
    });

    it('should return webhook detail with masked secret', async () => {
      mockedService.getSubscription.mockResolvedValue(mockWebhook as any);

      const res = await authedRequest(app).get('/api/v1/webhooks/wh-001');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.webhook.id).toBe('wh-001');
      expect(res.body.webhook.secret).toMatch(/^.{8}\.\.\.$/);
    });

    it('should return 404 when webhook not found', async () => {
      mockedService.getSubscription.mockResolvedValue(null as any);

      const res = await authedRequest(app).get('/api/v1/webhooks/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // ── PUT /api/v1/webhooks/:id ──────────────────────────────────────────

  describe('PUT /api/v1/webhooks/:id', () => {
    it('should require authentication', async () => {
      const res = await request(app)
        .put('/api/v1/webhooks/wh-001')
        .send({ url: 'https://example.com/new-webhook' });
      expect(res.status).toBe(401);
    });

    it('should update a webhook subscription', async () => {
      const updatedWebhook = { ...mockWebhook, url: 'https://example.com/new-webhook' };
      mockedService.updateSubscription.mockResolvedValue(updatedWebhook as any);

      const res = await authedRequest(app)
        .put('/api/v1/webhooks/wh-001')
        .send({ url: 'https://example.com/new-webhook' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.webhook.secret).toMatch(/^.{8}\.\.\.$/);
    });

    it('should update enabled status', async () => {
      const updatedWebhook = { ...mockWebhook, active: false };
      mockedService.updateSubscription.mockResolvedValue(updatedWebhook as any);

      const res = await authedRequest(app)
        .put('/api/v1/webhooks/wh-001')
        .send({ active: false });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 when webhook not found', async () => {
      mockedService.updateSubscription.mockResolvedValue(null as any);

      const res = await authedRequest(app)
        .put('/api/v1/webhooks/nonexistent')
        .send({ url: 'https://example.com/new-webhook' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 when url is invalid', async () => {
      const res = await authedRequest(app)
        .put('/api/v1/webhooks/wh-001')
        .send({ url: 'not-a-url' });

      expect(res.status).toBe(400);
    });

    it('should return 400 when events contains invalid type', async () => {
      const res = await authedRequest(app)
        .put('/api/v1/webhooks/wh-001')
        .send({ events: ['invalid.event'] });

      expect(res.status).toBe(400);
    });
  });

  // ── DELETE /api/v1/webhooks/:id ───────────────────────────────────────

  describe('DELETE /api/v1/webhooks/:id', () => {
    it('should require authentication', async () => {
      const res = await request(app).delete('/api/v1/webhooks/wh-001');
      expect(res.status).toBe(401);
    });

    it('should delete a webhook subscription', async () => {
      mockedService.deleteSubscription.mockResolvedValue(true as any);

      const res = await authedRequest(app).delete('/api/v1/webhooks/wh-001');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Webhook deleted');
    });

    it('should return 404 when webhook not found', async () => {
      mockedService.deleteSubscription.mockResolvedValue(false as any);

      const res = await authedRequest(app).delete('/api/v1/webhooks/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // ── POST /api/v1/webhooks/:id/test ────────────────────────────────────

  describe('POST /api/v1/webhooks/:id/test', () => {
    it('should require authentication', async () => {
      const res = await request(app).post('/api/v1/webhooks/wh-001/test');
      expect(res.status).toBe(401);
    });

    it('should send a test delivery', async () => {
      mockedService.testSubscription.mockResolvedValue({
        success: true,
        responseStatus: 200,
        latencyMs: 42,
      } as any);

      const res = await authedRequest(app).post('/api/v1/webhooks/wh-001/test');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.responseStatus).toBe(200);
      expect(res.body.latencyMs).toBeDefined();
    });

    it('should return 404 when webhook not found', async () => {
      mockedService.testSubscription.mockRejectedValue(
        new Error('Webhook not found'),
      );

      const res = await authedRequest(app).post('/api/v1/webhooks/nonexistent/test');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // ── GET /api/v1/webhooks/:id/deliveries ───────────────────────────────

  describe('GET /api/v1/webhooks/:id/deliveries', () => {
    it('should require authentication', async () => {
      const res = await request(app).get('/api/v1/webhooks/wh-001/deliveries');
      expect(res.status).toBe(401);
    });

    it('should list delivery history', async () => {
      mockedService.getSubscription.mockResolvedValue(mockWebhook as any);
      mockedService.getDeliveries.mockResolvedValue([
        {
          id: 'del-001',
          webhookId: 'wh-001',
          event: 'credential.issued',
          status: 'success',
          responseStatus: 200,
          latencyMs: 35,
          createdAt: new Date().toISOString(),
        },
      ] as any);

      const res = await authedRequest(app).get('/api/v1/webhooks/wh-001/deliveries');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.deliveries).toHaveLength(1);
    });

    it('should return 404 when webhook not found', async () => {
      mockedService.getSubscription.mockResolvedValue(null as any);

      const res = await authedRequest(app).get('/api/v1/webhooks/nonexistent/deliveries');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should return empty deliveries array for new webhook', async () => {
      mockedService.getSubscription.mockResolvedValue(mockWebhook as any);
      mockedService.getDeliveries.mockResolvedValue([]);

      const res = await authedRequest(app).get('/api/v1/webhooks/wh-001/deliveries');

      expect(res.status).toBe(200);
      expect(res.body.deliveries).toHaveLength(0);
    });
  });
});
