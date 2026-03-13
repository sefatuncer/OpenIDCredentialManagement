/**
 * DIDComm Routes Tests
 */

import request from 'supertest'
import {
  createSecurityTestServer,
  authedRequest,
} from '../security/security-helpers'

const API = '/api/v1/didcomm'

describe('DIDComm Routes', () => {
  const app = createSecurityTestServer()

  describe('Feature flag gating', () => {
    it('POST /invitations should return 404 when didcomm disabled', async () => {
      const res = await authedRequest(app).post(`${API}/invitations`).send({})
      expect(res.status).toBe(404)
      expect(res.body.error).toMatch(/not enabled/i)
    })

    it('POST /invitations/receive should return 404 when disabled', async () => {
      const res = await authedRequest(app)
        .post(`${API}/invitations/receive`)
        .send({ invitationUrl: 'https://example.com/invite' })
      expect(res.status).toBe(404)
    })

    it('GET /connections should return 404 when disabled', async () => {
      const res = await authedRequest(app).get(`${API}/connections`)
      expect(res.status).toBe(404)
    })

    it('GET /connections/:id should return 404 when disabled', async () => {
      const res = await authedRequest(app).get(`${API}/connections/conn-123`)
      expect(res.status).toBe(404)
    })

    it('POST /messages should return 404 when disabled', async () => {
      const res = await authedRequest(app)
        .post(`${API}/messages`)
        .send({ connectionId: 'conn-1', content: 'test' })
      expect(res.status).toBe(404)
    })

    it('GET /messages should return 404 when disabled', async () => {
      const res = await authedRequest(app).get(`${API}/messages`)
      expect(res.status).toBe(404)
    })
  })

  describe('Authentication', () => {
    it('POST /invitations should require auth', async () => {
      const res = await request(app).post(`${API}/invitations`).send({})
      expect(res.status).toBe(401)
    })

    it('GET /connections should require auth', async () => {
      const res = await request(app).get(`${API}/connections`)
      expect(res.status).toBe(401)
    })

    it('POST /messages should require auth', async () => {
      const res = await request(app).post(`${API}/messages`).send({})
      expect(res.status).toBe(401)
    })
  })
})
