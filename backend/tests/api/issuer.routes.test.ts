import request from 'supertest';
import { createTestServer, testData, getTestToken } from '../helpers';
import { Express } from 'express';

describe('Issuer Routes', () => {
  let app: Express;
  let authToken: string;

  beforeAll(() => {
    app = createTestServer();
    authToken = getTestToken();
  });

  describe('GET /api/v1/issuer/did', () => {
    it('should require authentication', async () => {
      const response = await request(app).get('/api/v1/issuer/did');
      expect(response.status).toBe(401);
    });

    it('should accept API key authentication', async () => {
      const response = await request(app)
        .get('/api/v1/issuer/did')
        .set('X-API-Key', 'dev-api-key-12345');

      // Note: May fail if agent not initialized, but should not be 401
      expect(response.status).not.toBe(401);
    });

    it('should accept JWT authentication', async () => {
      const response = await request(app)
        .get('/api/v1/issuer/did')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).not.toBe(401);
    });
  });

  describe('POST /api/v1/issuer/credentials/agent-identity', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/issuer/credentials/agent-identity')
        .send(testData.agentIdentityCredential);

      expect(response.status).toBe(401);
    });

    it('should validate request body', async () => {
      const response = await request(app)
        .post('/api/v1/issuer/credentials/agent-identity')
        .set('X-API-Key', 'dev-api-key-12345')
        .send({
          // Missing required fields
          agentName: 'Test',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('type');
      expect(response.body).toHaveProperty('errors');
    });

    it('should validate DID format', async () => {
      const response = await request(app)
        .post('/api/v1/issuer/credentials/agent-identity')
        .set('X-API-Key', 'dev-api-key-12345')
        .send({
          ...testData.agentIdentityCredential,
          holderDid: 'invalid-did-format',
        });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContainEqual(
        expect.objectContaining({
          path: 'holderDid',
        })
      );
    });

    it('should validate agent type enum', async () => {
      const response = await request(app)
        .post('/api/v1/issuer/credentials/agent-identity')
        .set('X-API-Key', 'dev-api-key-12345')
        .send({
          ...testData.agentIdentityCredential,
          agentType: 'invalid-type',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/v1/issuer/credentials/delegation', () => {
    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/v1/issuer/credentials/delegation')
        .set('X-API-Key', 'dev-api-key-12345')
        .send({
          holderDid: testData.validDid,
          // Missing other required fields
        });

      expect(response.status).toBe(400);
    });

    it('should require at least one scope', async () => {
      const response = await request(app)
        .post('/api/v1/issuer/credentials/delegation')
        .set('X-API-Key', 'dev-api-key-12345')
        .send({
          ...testData.delegationCredential,
          scope: [],
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/v1/issuer/credentials/capability', () => {
    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/v1/issuer/credentials/capability')
        .set('X-API-Key', 'dev-api-key-12345')
        .send({
          holderDid: testData.validDid,
          // Missing other required fields
        });

      expect(response.status).toBe(400);
    });

    it('should require at least one action', async () => {
      const response = await request(app)
        .post('/api/v1/issuer/credentials/capability')
        .set('X-API-Key', 'dev-api-key-12345')
        .send({
          ...testData.capabilityCredential,
          actions: [],
        });

      expect(response.status).toBe(400);
    });
  });

  describe('Rate Limiting', () => {
    it('should include rate limit headers', async () => {
      const response = await request(app)
        .post('/api/v1/issuer/credentials/agent-identity')
        .set('X-API-Key', 'dev-api-key-12345')
        .send(testData.agentIdentityCredential);

      // Rate limit headers should be present
      expect(response.headers).toHaveProperty('ratelimit-limit');
      expect(response.headers).toHaveProperty('ratelimit-remaining');
    });
  });
});
