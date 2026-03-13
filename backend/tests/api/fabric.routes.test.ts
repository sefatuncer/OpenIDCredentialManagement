/**
 * Fabric Anchor Routes Tests
 */

import request from 'supertest'
import {
  createSecurityTestServer,
  authedRequest,
} from '../security/security-helpers'

const API = '/api/v1/fabric'

describe('Fabric Routes', () => {
  const app = createSecurityTestServer()

  describe('Feature flag gating', () => {
    it('GET /status should return 404 when HLF disabled', async () => {
      const res = await authedRequest(app).get(`${API}/status`)
      expect(res.status).toBe(404)
      expect(res.body.error).toMatch(/not enabled/i)
    })

    it('GET /anchors should return 404 when disabled', async () => {
      const res = await authedRequest(app).get(`${API}/anchors`)
      expect(res.status).toBe(404)
    })

    it('GET /anchors/:id should return 404 when disabled', async () => {
      const res = await authedRequest(app).get(`${API}/anchors/anchor-123`)
      expect(res.status).toBe(404)
    })

    it('POST /anchors/:id/verify should return 404 when disabled', async () => {
      const res = await authedRequest(app)
        .post(`${API}/anchors/anchor-123/verify`)
        .send({})
      expect(res.status).toBe(404)
    })
  })

  describe('Authentication', () => {
    it('GET /status should require auth', async () => {
      const res = await request(app).get(`${API}/status`)
      expect(res.status).toBe(401)
    })

    it('GET /anchors should require auth', async () => {
      const res = await request(app).get(`${API}/anchors`)
      expect(res.status).toBe(401)
    })
  })
})
