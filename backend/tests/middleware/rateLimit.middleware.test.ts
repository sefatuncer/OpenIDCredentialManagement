import express, { Express } from 'express';
import request from 'supertest';
import {
  createRateLimiter,
  defaultRateLimiter,
  strictRateLimiter,
  authRateLimiter,
  credentialIssuanceRateLimiter,
  verificationRateLimiter,
  batchIssuanceRateLimiter,
  directPostRateLimiter,
} from '../../src/api/middleware/rateLimit.middleware';

/**
 * Helper: create a minimal Express app with a rate limiter on a test route.
 */
function createTestApp(limiter: ReturnType<typeof createRateLimiter>, path = '/test'): Express {
  const app = express();
  // Trust proxy so req.ip is set from X-Forwarded-For in tests
  app.set('trust proxy', true);
  app.use(path, limiter);
  app.get(path, (_req, res) => res.json({ ok: true }));
  app.post(path, (_req, res) => res.json({ ok: true }));
  return app;
}

describe('Rate Limit Middleware', () => {
  describe('createRateLimiter — basic behavior', () => {
    it('should allow requests under the limit', async () => {
      const limiter = createRateLimiter({ windowMs: 60_000, max: 5 });
      const app = createTestApp(limiter);

      const res = await request(app).get('/test');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('should return 429 when limit is exceeded', async () => {
      const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
      const app = createTestApp(limiter);

      // Exhaust the limit
      for (let i = 0; i < 3; i++) {
        await request(app).get('/test');
      }

      // Next request should be rate limited
      const res = await request(app).get('/test');
      expect(res.status).toBe(429);
    });

    it('should return RFC 7807 error body on 429', async () => {
      const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
      const app = createTestApp(limiter);

      await request(app).get('/test');
      const res = await request(app).get('/test');

      expect(res.status).toBe(429);
      expect(res.body.type).toContain('rate-limit-exceeded');
      expect(res.body.title).toBe('Too Many Requests');
      expect(res.body.status).toBe(429);
      expect(res.body.detail).toContain('Rate limit exceeded');
      expect(res.body.instance).toBe('/test');
      expect(res.body.requestId).toBeDefined();
    });

    it('should include standard rate limit headers', async () => {
      const limiter = createRateLimiter({ windowMs: 60_000, max: 5 });
      const app = createTestApp(limiter);

      const res = await request(app).get('/test');

      // standardHeaders: true enables RateLimit-* headers (draft-6)
      expect(res.headers).toHaveProperty('ratelimit-limit');
      expect(res.headers).toHaveProperty('ratelimit-remaining');
    });
  });

  describe('key generator — API key vs IP', () => {
    it('should rate limit by API key when X-API-Key is present', async () => {
      const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
      const app = createTestApp(limiter);

      // Two requests with API key A → exhaust
      await request(app).get('/test').set('X-API-Key', 'key-a');
      await request(app).get('/test').set('X-API-Key', 'key-a');
      const resA = await request(app).get('/test').set('X-API-Key', 'key-a');
      expect(resA.status).toBe(429);

      // API key B should still work (separate bucket)
      const resB = await request(app).get('/test').set('X-API-Key', 'key-b');
      expect(resB.status).toBe(200);
    });

    it('should fall back to IP when no API key is present', async () => {
      const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
      const app = createTestApp(limiter);

      // Two requests from same IP → exhaust
      await request(app).get('/test');
      await request(app).get('/test');
      const res = await request(app).get('/test');
      expect(res.status).toBe(429);
    });

    it('should not use client-supplied arbitrary headers for keying', async () => {
      // Ensures X-Tenant-ID or X-Forwarded-For alone doesn't bypass IP-based keying
      const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
      const app = createTestApp(limiter);

      // Same IP, different tenant headers — should still share the same bucket
      await request(app).get('/test').set('X-Tenant-ID', 'tenant-1');
      await request(app).get('/test').set('X-Tenant-ID', 'tenant-2');
      const res = await request(app).get('/test').set('X-Tenant-ID', 'tenant-3');
      expect(res.status).toBe(429);
    });
  });

  describe('pre-configured rate limiters — different limits', () => {
    it('defaultRateLimiter should allow 100 requests per minute', async () => {
      const app = createTestApp(defaultRateLimiter);

      // First request should succeed
      const res = await request(app).get('/test');
      expect(res.status).toBe(200);

      // Check header indicates limit of 100
      expect(res.headers['ratelimit-limit']).toBe('100');
    });

    it('strictRateLimiter should allow 20 requests per minute', async () => {
      const app = createTestApp(strictRateLimiter);

      const res = await request(app).get('/test');
      expect(res.status).toBe(200);
      expect(res.headers['ratelimit-limit']).toBe('20');
    });

    it('credentialIssuanceRateLimiter should allow 30 requests per minute', async () => {
      const app = createTestApp(credentialIssuanceRateLimiter);

      const res = await request(app).get('/test');
      expect(res.status).toBe(200);
      expect(res.headers['ratelimit-limit']).toBe('30');
    });

    it('verificationRateLimiter should allow 50 requests per minute', async () => {
      const app = createTestApp(verificationRateLimiter);

      const res = await request(app).get('/test');
      expect(res.status).toBe(200);
      expect(res.headers['ratelimit-limit']).toBe('50');
    });

    it('batchIssuanceRateLimiter should allow 10 requests per minute', async () => {
      const app = createTestApp(batchIssuanceRateLimiter);

      const res = await request(app).get('/test');
      expect(res.status).toBe(200);
      expect(res.headers['ratelimit-limit']).toBe('10');
    });

    it('directPostRateLimiter should allow 60 requests per minute', async () => {
      const app = createTestApp(directPostRateLimiter);

      const res = await request(app).get('/test');
      expect(res.status).toBe(200);
      expect(res.headers['ratelimit-limit']).toBe('60');
    });
  });

  describe('authRateLimiter — pre-auth endpoints', () => {
    it('should allow 10 attempts in 15-minute window', async () => {
      const app = createTestApp(authRateLimiter, '/auth/login');

      const res = await request(app).get('/auth/login');
      expect(res.status).toBe(200);
      expect(res.headers['ratelimit-limit']).toBe('10');
    });

    it('should return 429 after 10 attempts', async () => {
      const app = createTestApp(authRateLimiter, '/auth/login');

      for (let i = 0; i < 10; i++) {
        await request(app).get('/auth/login');
      }

      const res = await request(app).get('/auth/login');
      expect(res.status).toBe(429);
      expect(res.body.title).toBe('Too Many Requests');
    });

    it('should use instance field pointing to the endpoint path', async () => {
      const app = createTestApp(authRateLimiter, '/auth/login');

      // Exhaust limit
      for (let i = 0; i < 10; i++) {
        await request(app).get('/auth/login');
      }

      const res = await request(app).get('/auth/login');
      expect(res.body.instance).toBe('/auth/login');
    });
  });

  describe('requestId in 429 responses', () => {
    it('should use requestId from request object when available', async () => {
      const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
      const app = express();
      // Inject requestId via middleware
      app.use((_req, _res, next) => {
        (_req as any).requestId = 'custom-req-id';
        next();
      });
      app.use('/test', limiter);
      app.get('/test', (_req, res) => res.json({ ok: true }));

      await request(app).get('/test');
      const res = await request(app).get('/test');

      expect(res.status).toBe(429);
      expect(res.body.requestId).toBe('custom-req-id');
    });

    it('should generate a requestId if none present', async () => {
      const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
      const app = createTestApp(limiter);

      await request(app).get('/test');
      const res = await request(app).get('/test');

      expect(res.status).toBe(429);
      // Should be a UUID-like string
      expect(res.body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    });
  });
});
