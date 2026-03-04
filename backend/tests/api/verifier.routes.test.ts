import request from 'supertest';
import { createTestServer, getTestToken } from '../helpers';
import { Express } from 'express';

describe('Verifier Routes', () => {
  let app: Express;
  let authToken: string;

  beforeAll(() => {
    app = createTestServer();
    authToken = getTestToken();
  });

  describe('GET /api/v1/verifier/did', () => {
    it('should require authentication', async () => {
      const response = await request(app).get('/api/v1/verifier/did');
      expect(response.status).toBe(401);
    });

    it('should accept API key authentication', async () => {
      const response = await request(app)
        .get('/api/v1/verifier/did')
        .set('X-API-Key', 'dev-api-key-12345');

      expect(response.status).not.toBe(401);
    });
  });

  describe('POST /api/v1/verifier/verify/agent-identity', () => {
    it('should require authentication', async () => {
      const response = await request(app).post(
        '/api/v1/verifier/verify/agent-identity'
      );
      expect(response.status).toBe(401);
    });

    it('should accept authentication', async () => {
      const response = await request(app)
        .post('/api/v1/verifier/verify/agent-identity')
        .set('X-API-Key', 'dev-api-key-12345');

      // Should not be 401, may fail for other reasons
      expect(response.status).not.toBe(401);
    });
  });

  describe('POST /api/v1/verifier/verify/delegation', () => {
    it('should require authentication', async () => {
      const response = await request(app).post(
        '/api/v1/verifier/verify/delegation'
      );
      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/v1/verifier/verify/combined', () => {
    it('should require authentication', async () => {
      const response = await request(app).post(
        '/api/v1/verifier/verify/combined'
      );
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/v1/verifier/verify/:sessionId/result', () => {
    it('should require authentication', async () => {
      const response = await request(app).get(
        '/api/v1/verifier/verify/550e8400-e29b-41d4-a716-446655440000/result'
      );
      expect(response.status).toBe(401);
    });

    it('should accept session ID parameter', async () => {
      const response = await request(app)
        .get('/api/v1/verifier/verify/550e8400-e29b-41d4-a716-446655440000/result')
        .set('X-API-Key', 'dev-api-key-12345');

      expect(response.status).not.toBe(401);
    });
  });
});
