import request from 'supertest'
import {
  createSecurityTestServer,
  validToken,
  authedRequest,
} from './security-helpers'

const API = '/api/v1'

describe('Security: Final Round — Crypto, VP & Rate Limits', () => {
  const app = createSecurityTestServer()

  // ─── VP Token Security ────────────────────────────────────────────────

  describe('VP Token Security', () => {
    it('should reject direct_post with empty vp_token', async () => {
      const res = await request(app)
        .post('/direct_post')
        .type('form')
        .send({ vp_token: '', state: 'test-state' })
      expect(res.status).toBe(400)
    })

    it('should reject direct_post with missing state', async () => {
      const res = await request(app)
        .post('/direct_post')
        .type('form')
        .send({ vp_token: 'fake.token.here' })
      expect(res.status).toBe(400)
    })

    it('should reject direct_post with invalid state (session not found)', async () => {
      const res = await request(app)
        .post('/direct_post')
        .type('form')
        .send({
          vp_token: 'eyJhbGciOiJFZERTQSJ9.eyJub25jZSI6InRlc3QifQ.fake',
          state: 'nonexistent-state-id',
        })
      expect(res.status).toBe(400)
      expect(res.body.error).toBe('invalid_request')
    })

    it('should not leak internal errors in VP processing', async () => {
      const res = await request(app)
        .post('/direct_post')
        .type('form')
        .send({
          vp_token: 'completely-invalid-token',
          state: 'test-state',
          presentation_submission: 'not-json',
        })
      // Should return structured error, not stack trace
      expect(res.status).toBeGreaterThanOrEqual(400)
      if (res.body.error_description) {
        expect(res.body.error_description).not.toContain('at Object.')
        expect(res.body.error_description).not.toContain('/home/')
      }
    })
  })

  // ─── Credential Token Security ────────────────────────────────────────

  describe('Credential Token Endpoint Security', () => {
    it('should reject credential claim without Bearer token', async () => {
      const res = await request(app)
        .post(`${API}/issuer/credential`)
        .send({ format: 'jwt_vc_json' })
      expect(res.status).toBe(401)
    })

    it('should reject token exchange with missing pre-authorized code', async () => {
      const res = await request(app)
        .post(`${API}/issuer/token`)
        .send({})
      expect(res.status).toBe(400)
      expect(res.body.error).toBe('invalid_request')
    })

    it('should reject token exchange with invalid pre-authorized code', async () => {
      const res = await request(app)
        .post(`${API}/issuer/token`)
        .send({ 'pre-authorized_code': 'invalid-code-000' })
      expect(res.status).toBe(400)
      expect(res.body.error).toBe('invalid_grant')
    })
  })

  // ─── Rate Limiting ────────────────────────────────────────────────────

  describe('Rate Limiting Enforcement', () => {
    it('should enforce rate limit on auth endpoint', async () => {
      // Auth rate limiter is 10/15min — send 12 rapid requests
      const results: number[] = []
      for (let i = 0; i < 12; i++) {
        const res = await request(app)
          .post(`${API}/auth/token`)
          .send({ clientId: 'test', clientSecret: 'wrong' })
        results.push(res.status)
      }
      // At least one should be rate-limited (429)
      expect(results).toContain(429)
    })

    it('should enforce rate limit on direct_post', async () => {
      // direct_post rate limiter is 60/min — flood with 65 requests
      const promises = Array.from({ length: 65 }, () =>
        request(app)
          .post('/direct_post')
          .type('form')
          .send({ vp_token: 'test', state: 'test' }),
      )
      const results = await Promise.all(promises)
      const statuses = results.map((r) => r.status)
      // At least one should be 429
      expect(statuses).toContain(429)
    })
  })

  // ─── DID Validation ───────────────────────────────────────────────────

  describe('DID Format Validation', () => {
    const auth = () => authedRequest(app)

    it('should reject credential issuance with invalid DID', async () => {
      const res = await auth()
        .post(`${API}/issuer/credentials/agent-identity`)
        .send({
          holderDid: 'not-a-valid-did',
          agentType: 'autonomous',
          agentName: 'Test',
          ownerDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
        })
      expect(res.status).toBe(400)
    })

    it('should reject DID with unsupported method in resolution', async () => {
      const { resolveDID } = await import('../../src/services/didResolver.service')
      const result = await resolveDID('did:unsupported:abc123')
      expect(result.didDocument).toBeNull()
      expect(result.didResolutionMetadata.error).toBe('methodNotSupported')
    })

    it('should reject malformed DID', async () => {
      const { parseDID } = await import('../../src/services/didResolver.service')
      expect(parseDID('did:')).toBeNull()
      expect(parseDID('notadid')).toBeNull()
      expect(parseDID('')).toBeNull()
    })
  })

  // ─── Security Headers ─────────────────────────────────────────────────

  describe('Security Headers', () => {
    it('should set Helmet security headers', async () => {
      const res = await request(app).get('/health')
      // Helmet sets these by default
      expect(res.headers['x-content-type-options']).toBe('nosniff')
      expect(res.headers['x-frame-options']).toBeDefined()
    })

    it('should set Content-Security-Policy', async () => {
      const res = await request(app).get('/health')
      expect(res.headers['content-security-policy']).toBeDefined()
    })

    it('should not expose server info', async () => {
      const res = await request(app).get('/health')
      // Helmet removes X-Powered-By
      expect(res.headers['x-powered-by']).toBeUndefined()
    })
  })

  // ─── Error Response Security ──────────────────────────────────────────

  describe('Error Response Security', () => {
    it('should return structured 404 for unknown routes', async () => {
      const token = validToken()
      const res = await request(app)
        .get(`${API}/nonexistent/route`)
        .set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(404)
    })

    it('should not leak stack traces in errors', async () => {
      const token = validToken()
      const res = await request(app)
        .post(`${API}/issuer/credentials/agent-identity`)
        .set('Authorization', `Bearer ${token}`)
        .send({}) // Missing required fields
      // Response should not contain file paths or stack traces
      const body = JSON.stringify(res.body)
      expect(body).not.toMatch(/at\s+\w+\s+\(/)
      expect(body).not.toContain('node_modules')
    })

    it('should return JSON for API errors, not HTML', async () => {
      const token = validToken()
      const res = await request(app)
        .post(`${API}/issuer/credentials/agent-identity`)
        .set('Authorization', `Bearer ${token}`)
        .set('Accept', 'application/json')
        .send({})
      expect(res.headers['content-type']).toMatch(/json/)
    })
  })

  // ─── Body Size Limits ─────────────────────────────────────────────────

  describe('Body Size Limits', () => {
    it('should reject oversized request body', async () => {
      const token = validToken()
      const largePayload = { data: 'x'.repeat(2 * 1024 * 1024) } // 2MB > 1MB limit
      const res = await request(app)
        .post(`${API}/issuer/credentials/agent-identity`)
        .set('Authorization', `Bearer ${token}`)
        .send(largePayload)
      expect(res.status).toBe(413) // Payload Too Large
    })
  })
})
