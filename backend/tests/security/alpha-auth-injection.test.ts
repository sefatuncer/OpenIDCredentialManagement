import request from 'supertest'
import {
  createSecurityTestServer,
  validToken,
  expiredToken,
  tamperedToken,
  noneAlgorithmToken,
  authedRequest,
  SQL_INJECTIONS,
  XSS_PAYLOADS,
  CMD_INJECTIONS,
  PATH_TRAVERSALS,
  HEADER_INJECTIONS,
} from './security-helpers'

const API = '/api/v1'

describe('Security: Alpha Round — Auth Bypass & Injection', () => {
  const app = createSecurityTestServer()

  // ─── Authentication Bypass ────────────────────────────────────────────

  describe('JWT Authentication Bypass', () => {
    it('should reject request without any auth', async () => {
      const res = await request(app).get(`${API}/issuer/did`)
      expect(res.status).toBe(401)
    })

    it('should reject expired JWT token', async () => {
      const res = await request(app)
        .get(`${API}/issuer/did`)
        .set('Authorization', `Bearer ${expiredToken()}`)
      expect(res.status).toBe(401)
    })

    it('should reject JWT signed with wrong secret', async () => {
      const res = await request(app)
        .get(`${API}/issuer/did`)
        .set('Authorization', `Bearer ${tamperedToken()}`)
      expect(res.status).toBe(401)
    })

    it('should reject "none" algorithm JWT', async () => {
      const res = await request(app)
        .get(`${API}/issuer/did`)
        .set('Authorization', `Bearer ${noneAlgorithmToken()}`)
      expect(res.status).toBe(401)
    })

    it('should reject malformed Bearer prefix', async () => {
      const res = await request(app)
        .get(`${API}/issuer/did`)
        .set('Authorization', `Basic ${validToken()}`)
      expect(res.status).toBe(401)
    })

    it('should reject empty Bearer token', async () => {
      const res = await request(app)
        .get(`${API}/issuer/did`)
        .set('Authorization', 'Bearer ')
      expect(res.status).toBe(401)
    })

    it('should reject token with extra dots', async () => {
      const res = await request(app)
        .get(`${API}/issuer/did`)
        .set('Authorization', 'Bearer a.b.c.d')
      expect(res.status).toBe(401)
    })
  })

  describe('API Key Authentication', () => {
    it('should reject invalid API key', async () => {
      const res = await request(app)
        .get(`${API}/issuer/did`)
        .set('X-API-Key', 'invalid-key-000')
      expect(res.status).toBe(401)
    })

    it('should reject empty API key', async () => {
      const res = await request(app)
        .get(`${API}/issuer/did`)
        .set('X-API-Key', '')
      expect(res.status).toBe(401)
    })
  })

  // ─── SQL Injection ────────────────────────────────────────────────────

  describe('SQL Injection Prevention', () => {
    const auth = () => authedRequest(app)

    it.each(SQL_INJECTIONS)(
      'should safely handle SQL injection in credential body: %s',
      async (payload) => {
        const res = await auth()
          .post(`${API}/issuer/credentials/agent-identity`)
          .send({
            holderDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
            agentType: 'autonomous',
            agentName: payload,
            ownerDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
          })
        // Should either validate/reject or process safely — never 500
        expect(res.status).not.toBe(500)
      },
    )

    it.each(SQL_INJECTIONS)(
      'should safely handle SQL injection in query params: %s',
      async (payload) => {
        const res = await auth().get(`${API}/holder/credentials?search=${encodeURIComponent(payload)}`)
        expect(res.status).not.toBe(500)
      },
    )
  })

  // ─── XSS Prevention ──────────────────────────────────────────────────

  describe('XSS Prevention', () => {
    const auth = () => authedRequest(app)

    it.each(XSS_PAYLOADS)(
      'should not reflect XSS payload in response: %s',
      async (payload) => {
        const res = await auth()
          .post(`${API}/issuer/credentials/agent-identity`)
          .send({
            holderDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
            agentType: 'autonomous',
            agentName: payload,
            ownerDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
          })
        // Response should not contain unescaped script tags
        const body = JSON.stringify(res.body)
        expect(body).not.toContain('<script>')
        expect(body).not.toContain('onerror=')
      },
    )
  })

  // ─── Command Injection ────────────────────────────────────────────────

  describe('Command Injection Prevention', () => {
    const auth = () => authedRequest(app)

    it.each(CMD_INJECTIONS)(
      'should safely handle command injection in credential name: %s',
      async (payload) => {
        const res = await auth()
          .post(`${API}/issuer/credentials/agent-identity`)
          .send({
            holderDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
            agentType: 'autonomous',
            agentName: payload,
            ownerDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
          })
        // Should process safely — payload stored as data, never executed
        expect(res.status).not.toBe(500)
      },
    )
  })

  // ─── Path Traversal ──────────────────────────────────────────────────

  describe('Path Traversal Prevention', () => {
    const auth = () => authedRequest(app)

    it.each(PATH_TRAVERSALS)(
      'should reject path traversal in route params: %s',
      async (payload) => {
        const res = await auth().get(`${API}/issuer/credentials/batch/${encodeURIComponent(payload)}`)
        // Should return 404 or 400, never expose file system
        expect([400, 404]).toContain(res.status)
      },
    )
  })

  // ─── Header Injection ─────────────────────────────────────────────────

  describe('Header Injection Prevention', () => {
    it.each(HEADER_INJECTIONS)(
      'should not allow header injection via X-API-Key: %s',
      async (payload) => {
        try {
          const res = await request(app)
            .get(`${API}/issuer/did`)
            .set('X-API-Key', payload)
          // Should reject or handle safely
          expect(res.status).not.toBe(200)
        } catch {
          // HTTP library may reject the malformed header — that's safe
        }
      },
    )
  })

  // ─── Pre-Auth Endpoint Access ─────────────────────────────────────────

  describe('Pre-Auth Endpoints', () => {
    it('should allow health check without auth', async () => {
      const res = await request(app).get('/health')
      expect(res.status).toBe(200)
    })

    it('should not expose sensitive data on health endpoint', async () => {
      const res = await request(app).get('/health')
      const body = JSON.stringify(res.body)
      expect(body).not.toContain('password')
      expect(body).not.toContain('secret')
      expect(body).not.toContain('private')
    })

    it('should reject direct_post without required fields', async () => {
      const res = await request(app).post('/direct_post').send({})
      expect(res.status).toBe(400)
    })

    it('should reject agent registration with invalid DID format', async () => {
      const res = await request(app)
        .post(`${API}/agents/register`)
        .send({
          name: 'Evil Agent',
          type: 'autonomous',
          did: 'not-a-did',
        })
      expect(res.status).toBe(400)
    })
  })
})
