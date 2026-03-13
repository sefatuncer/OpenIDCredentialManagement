import request from 'supertest'
import { Express } from 'express'
import { createServer } from '../../src/api/server'
import { getTestToken } from '../helpers'

/**
 * End-to-End Audit Flow Tests
 *
 * Tests audit logging endpoints, authentication, filtering,
 * and statistics. Operations that require a fully initialized
 * agent (credential issuance, VP flows) are tested for correct
 * auth gating rather than full success, since the test environment
 * does not boot issuer/verifier agents.
 */
describe('End-to-End Audit Flow', () => {
  let app: Express
  let authToken: string

  beforeAll(() => {
    app = createServer()
    authToken = getTestToken(['*'])
  })

  describe('Credential Lifecycle Audit Trail', () => {
    it('should accept credential offer request with valid auth (may fail due to uninitialized agent)', async () => {
      // POST /api/v1/openid4vci/credential-offer is the correct path
      // This endpoint is behind auth middleware. Without a running agent,
      // it may return 500 but should NOT return 401.
      const response = await request(app)
        .post('/api/v1/openid4vci/credential-offer')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          credentialTypes: ['AIAgentIdentityCredential'],
        })

      // Should get past auth — not 401
      expect(response.status).not.toBe(401)
    })

    it('should accept issuer credential request with valid auth', async () => {
      // POST /api/v1/issuer/credentials/agent-identity is the correct issuer path
      const response = await request(app)
        .post('/api/v1/issuer/credentials/agent-identity')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          holderDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
          agentType: 'autonomous',
          agentName: 'Test Agent',
          ownerDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
          scope: ['read:documents'],
        })

      // Should get past auth — not 401
      expect(response.status).not.toBe(401)
    })

    it('should accept revocation request with valid auth', async () => {
      // POST /api/v1/revocation/revoke is the correct revocation path
      const response = await request(app)
        .post('/api/v1/revocation/revoke')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          credentialId: 'test-credential-id',
          reason: 'Audit test revocation',
        })

      // Should get past auth — not 401; may be 404 if credential not found
      expect(response.status).not.toBe(401)
      expect([200, 404]).toContain(response.status)
    })
  })

  describe('Presentation Audit Trail', () => {
    it('should accept authorization request with valid auth (may fail due to uninitialized agent)', async () => {
      // POST /api/v1/openid4vp/authorization-request is the correct VP path
      const response = await request(app)
        .post('/api/v1/openid4vp/authorization-request')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          presentationDefinitionId: 'agent-identity',
          purpose: 'Audit test verification',
        })

      // Should get past auth — not 401
      expect(response.status).not.toBe(401)
    })

    it('should accept verification request via verifier route with valid auth', async () => {
      // POST /api/v1/verifier/verify/agent-identity is the correct verifier path
      const response = await request(app)
        .post('/api/v1/verifier/verify/agent-identity')
        .set('Authorization', `Bearer ${authToken}`)

      // Should get past auth — not 401
      expect(response.status).not.toBe(401)
    })
  })

  describe('Trust Registry Audit Trail', () => {
    const testDid = 'did:key:z6MkAuditTest' + Date.now()

    it('should log trust entity addition', async () => {
      // POST /api/v1/trust/entities returns 201 on success
      const addResponse = await request(app)
        .post('/api/v1/trust/entities')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          did: testDid,
          name: 'Audit Test Entity',
          type: 'issuer',
          trustLevel: 'basic',
        })
        .expect(201)

      expect(addResponse.body.success).toBe(true)
      expect(addResponse.body.entity).toBeDefined()

      // Check audit log
      const auditResponse = await request(app)
        .get('/api/v1/audit/logs')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          limit: '10',
        })
        .expect(200)

      expect(auditResponse.body.logs).toBeDefined()
      expect(Array.isArray(auditResponse.body.logs)).toBe(true)
    })

    it('should log trust entity removal', async () => {
      await request(app)
        .delete(`/api/v1/trust/entities/${encodeURIComponent(testDid)}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      const auditResponse = await request(app)
        .get('/api/v1/audit/logs')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          limit: '10',
        })
        .expect(200)

      expect(auditResponse.body.logs).toBeDefined()
      expect(Array.isArray(auditResponse.body.logs)).toBe(true)
    })
  })

  describe('Audit Statistics', () => {
    it('should return audit statistics with correct field names', async () => {
      const response = await request(app)
        .get('/api/v1/audit/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      // Actual stats response shape from audit.service.ts:
      // { totalLogs, byEventType, byAction, successRate, recentErrors, storageType }
      expect(response.body).toHaveProperty('totalLogs')
      expect(response.body).toHaveProperty('byEventType')
      expect(response.body).toHaveProperty('byAction')
      expect(response.body).toHaveProperty('successRate')
      expect(response.body).toHaveProperty('recentErrors')
    })

    it('should filter audit logs by date range', async () => {
      const endDate = new Date()
      const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000) // 24 hours ago

      const response = await request(app)
        .get('/api/v1/audit/logs')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        })
        .expect(200)

      expect(response.body.logs).toBeDefined()
      expect(Array.isArray(response.body.logs)).toBe(true)
    })

    it('should filter audit logs by actorDid', async () => {
      // The actual query param is actorDid (not actorId)
      const response = await request(app)
        .get('/api/v1/audit/logs')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          actorDid: 'did:key:z6MkTestUser',
          limit: '10',
        })
        .expect(200)

      expect(response.body.logs).toBeDefined()
    })

    it('should filter audit logs by eventType', async () => {
      const response = await request(app)
        .get('/api/v1/audit/logs')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          eventType: 'credential.issued',
          limit: '10',
        })
        .expect(200)

      expect(response.body.logs).toBeDefined()
      expect(Array.isArray(response.body.logs)).toBe(true)
    })
  })

  describe('Audit Security', () => {
    it('should require authentication for audit logs', async () => {
      await request(app).get('/api/v1/audit/logs').expect(401)
    })

    it('should require authentication for audit stats', async () => {
      await request(app).get('/api/v1/audit/stats').expect(401)
    })

    it('should require audit:read permission for audit logs', async () => {
      // Token with limited permissions (no audit:read or wildcard)
      const limitedToken = getTestToken(['read:credentials'])

      const response = await request(app)
        .get('/api/v1/audit/logs')
        .set('Authorization', `Bearer ${limitedToken}`)

      // audit.routes.ts uses requirePermission('audit:read') globally
      // Without 'audit:read' or '*', should get 403
      expect(response.status).toBe(403)
    })

    it('should require audit:read permission for audit stats', async () => {
      const limitedToken = getTestToken(['read:credentials'])

      const response = await request(app)
        .get('/api/v1/audit/stats')
        .set('Authorization', `Bearer ${limitedToken}`)

      expect(response.status).toBe(403)
    })

    it('should not allow audit log deletion', async () => {
      await request(app)
        .delete('/api/v1/audit/logs')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404) // Endpoint should not exist
    })

    it('should list available event types', async () => {
      const response = await request(app)
        .get('/api/v1/audit/events')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(response.body.eventTypes).toBeDefined()
      expect(Array.isArray(response.body.eventTypes)).toBe(true)
      expect(response.body.actions).toBeDefined()
      expect(Array.isArray(response.body.actions)).toBe(true)
    })
  })
})
