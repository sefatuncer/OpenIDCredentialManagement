import request from 'supertest';
import { createTestServer, getTestToken } from '../helpers';
import { Express } from 'express';

describe('Holder Routes', () => {
  let app: Express;
  let authToken: string;

  beforeAll(() => {
    app = createTestServer();
    authToken = getTestToken();
  });

  describe('GET /api/v1/holder/did', () => {
    it('should require authentication', async () => {
      const response = await request(app).get('/api/v1/holder/did');
      expect(response.status).toBe(401);
    });

    it('should accept API key authentication', async () => {
      const response = await request(app)
        .get('/api/v1/holder/did')
        .set('X-API-Key', 'test-api-key-12345');

      expect(response.status).not.toBe(401);
    });
  });

  describe('POST /api/v1/holder/credentials/receive', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/holder/credentials/receive')
        .send({ credentialOfferUri: 'https://example.com/offer' });

      expect(response.status).toBe(401);
    });

    it('should validate credentialOfferUri is required', async () => {
      const response = await request(app)
        .post('/api/v1/holder/credentials/receive')
        .set('X-API-Key', 'test-api-key-12345')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.errors).toContainEqual(
        expect.objectContaining({
          path: 'credentialOfferUri',
        })
      );
    });

    it('should validate credentialOfferUri is a valid URL', async () => {
      const response = await request(app)
        .post('/api/v1/holder/credentials/receive')
        .set('X-API-Key', 'test-api-key-12345')
        .send({ credentialOfferUri: 'not-a-valid-url' });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/v1/holder/credentials/present', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/holder/credentials/present')
        .send({ verificationRequestUri: 'https://example.com/verify' });

      expect(response.status).toBe(401);
    });

    it('should validate verificationRequestUri is required', async () => {
      const response = await request(app)
        .post('/api/v1/holder/credentials/present')
        .set('X-API-Key', 'test-api-key-12345')
        .send({});

      expect(response.status).toBe(400);
    });

    it('should validate verificationRequestUri is a valid URL', async () => {
      const response = await request(app)
        .post('/api/v1/holder/credentials/present')
        .set('X-API-Key', 'test-api-key-12345')
        .send({ verificationRequestUri: 'not-a-valid-url' });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/v1/holder/credentials', () => {
    it('should require authentication', async () => {
      const response = await request(app).get('/api/v1/holder/credentials');
      expect(response.status).toBe(401);
    });

    it('should accept authentication', async () => {
      const response = await request(app)
        .get('/api/v1/holder/credentials')
        .set('X-API-Key', 'test-api-key-12345');

      expect(response.status).not.toBe(401);
    });
  });

  describe('DELETE /api/v1/holder/credentials/:credentialId', () => {
    it('should require authentication', async () => {
      const response = await request(app).delete(
        '/api/v1/holder/credentials/test-id'
      );
      expect(response.status).toBe(401);
    });
  });
});
