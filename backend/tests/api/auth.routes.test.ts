import request from 'supertest';
import { createTestServer } from '../helpers';
import { Express } from 'express';

describe('Auth Routes', () => {
  let app: Express;

  beforeAll(() => {
    app = createTestServer();
  });

  describe('POST /api/v1/auth/token', () => {
    it('should return token for valid credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/token')
        .send({
          clientId: 'demo-client',
          clientSecret: 'demo-secret-12345',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('access_token');
      expect(response.body).toHaveProperty('token_type', 'Bearer');
      expect(response.body).toHaveProperty('expires_in');
    });

    it('should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/token')
        .send({
          clientId: 'invalid-client',
          clientSecret: 'wrong-secret',
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('type');
      expect(response.body).toHaveProperty('title');
    });

    it('should reject missing fields', async () => {
      const response = await request(app)
        .post('/api/v1/auth/token')
        .send({
          clientId: 'demo-client',
          // missing clientSecret
        });

      expect(response.status).toBe(400);
    });

    it('should not require authentication', async () => {
      const response = await request(app)
        .post('/api/v1/auth/token')
        .send({
          clientId: 'demo-client',
          clientSecret: 'demo-secret-12345',
        });

      // Should not get 401 for missing auth
      expect(response.status).not.toBe(401);
    });
  });

  describe('POST /api/v1/auth/introspect', () => {
    it('should return active=true for valid token', async () => {
      // First get a token
      const tokenResponse = await request(app)
        .post('/api/v1/auth/token')
        .send({
          clientId: 'demo-client',
          clientSecret: 'demo-secret-12345',
        });

      const token = tokenResponse.body.access_token;

      // Then introspect it
      const response = await request(app)
        .post('/api/v1/auth/introspect')
        .set('X-API-Key', 'dev-api-key-12345')
        .send({ token });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('active', true);
      expect(response.body).toHaveProperty('sub', 'demo-client');
    });

    it('should return active=false for invalid token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/introspect')
        .set('X-API-Key', 'dev-api-key-12345')
        .send({ token: 'invalid.token.here' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('active', false);
    });

    it('should return active=false for missing token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/introspect')
        .set('X-API-Key', 'dev-api-key-12345')
        .send({});

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('active', false);
    });
  });
});
