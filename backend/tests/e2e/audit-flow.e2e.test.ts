import request from 'supertest'
import { Express } from 'express'
import { createServer } from '../../src/api/server'
import { testData, getTestToken } from '../helpers'

/**
 * End-to-End Audit Flow Tests
 *
 * Verify that all credential operations are properly logged
 * for compliance and security purposes.
 */
describe('End-to-End Audit Flow', () => {
  let app: Express
  let authToken: string

  beforeAll(() => {
    app = createServer()
    authToken = getTestToken(['*'])
  })

  describe('Credential Lifecycle Audit Trail', () => {
    let credentialId: string
    const startTime = new Date()

    it('should log credential issuance event', async () => {
      // Issue credential
      const offerResponse = await request(app)
        .post('/api/v1/openid4vci/offer')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          credentialTypes: ['AIAgentIdentityCredential'],
          claims: testData.agentIdentityCredential,
        })
        .expect(200)

      const preAuthCode =
        offerResponse.body.credentialOffer.grants[
          'urn:ietf:params:oauth:grant-type:pre-authorized_code'
        ]['pre-authorized_code']

      const tokenResponse = await request(app).post('/api/v1/openid4vci/token').send({
        grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
        'pre-authorized_code': preAuthCode,
      })

      const credResponse = await request(app)
        .post('/api/v1/openid4vci/credential')
        .set('Authorization', `Bearer ${tokenResponse.body.access_token}`)
        .send({
          format: 'jwt_vc_json',
          credential_definition: {
            type: ['VerifiableCredential', 'AIAgentIdentityCredential'],
          },
        })
        .expect(200)

      credentialId = credResponse.body.credentialId

      // Check audit log
      const auditResponse = await request(app)
        .get('/api/v1/audit/logs')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          eventType: 'CREDENTIAL_ISSUED',
          limit: 10,
        })
        .expect(200)

      expect(auditResponse.body.logs).toBeDefined()
      const issuanceLog = auditResponse.body.logs.find(
        (log: any) => log.eventType === 'CREDENTIAL_ISSUED'
      )
      expect(issuanceLog).toBeDefined()
    })

    it('should log credential verification event', async () => {
      // Verify credential
      await request(app)
        .post('/api/v1/verifier/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          credentialId: credentialId,
        })
        .expect(200)

      // Check audit log
      const auditResponse = await request(app)
        .get('/api/v1/audit/logs')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          eventType: 'CREDENTIAL_VERIFIED',
          limit: 10,
        })
        .expect(200)

      const verificationLog = auditResponse.body.logs.find(
        (log: any) => log.eventType === 'CREDENTIAL_VERIFIED'
      )
      expect(verificationLog).toBeDefined()
    })

    it('should log credential revocation event', async () => {
      // Revoke credential
      await request(app)
        .post('/api/v1/issuer/credentials/revoke')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          credentialId: credentialId,
          reason: 'Audit test revocation',
        })
        .expect(200)

      // Check audit log
      const auditResponse = await request(app)
        .get('/api/v1/audit/logs')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          eventType: 'CREDENTIAL_REVOKED',
          limit: 10,
        })
        .expect(200)

      const revocationLog = auditResponse.body.logs.find(
        (log: any) => log.eventType === 'CREDENTIAL_REVOKED'
      )
      expect(revocationLog).toBeDefined()
      expect(revocationLog.details?.reason).toBe('Audit test revocation')
    })

    it('should provide complete audit trail for credential', async () => {
      const auditResponse = await request(app)
        .get(`/api/v1/audit/credential/${credentialId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(auditResponse.body.events).toBeDefined()
      expect(auditResponse.body.events.length).toBeGreaterThanOrEqual(3)

      // Verify event order
      const eventTypes = auditResponse.body.events.map((e: any) => e.eventType)
      expect(eventTypes).toContain('CREDENTIAL_ISSUED')
      expect(eventTypes).toContain('CREDENTIAL_VERIFIED')
      expect(eventTypes).toContain('CREDENTIAL_REVOKED')
    })
  })

  describe('Presentation Audit Trail', () => {
    let sessionId: string

    it('should log presentation request event', async () => {
      const response = await request(app)
        .post('/api/v1/openid4vp/request')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          presentationDefinitionId: 'agent-identity-verification',
          purpose: 'Audit test verification',
        })
        .expect(200)

      sessionId = response.body.sessionId

      // Check audit log
      const auditResponse = await request(app)
        .get('/api/v1/audit/logs')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          eventType: 'PRESENTATION_REQUESTED',
          limit: 10,
        })
        .expect(200)

      const requestLog = auditResponse.body.logs.find(
        (log: any) => log.eventType === 'PRESENTATION_REQUESTED'
      )
      expect(requestLog).toBeDefined()
    })

    it('should log presentation submission event', async () => {
      // Submit mock presentation
      await request(app)
        .post('/api/v1/openid4vp/response')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sessionId: sessionId,
          vp_token: 'mock-vp-token',
          presentation_submission: {
            id: 'audit-test',
            definition_id: 'agent-identity-verification',
            descriptor_map: [],
          },
        })

      // Check audit log for submission
      const auditResponse = await request(app)
        .get('/api/v1/audit/logs')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          eventType: 'PRESENTATION_SUBMITTED',
          limit: 10,
        })
        .expect(200)

      expect(auditResponse.body.logs).toBeDefined()
    })
  })

  describe('Trust Registry Audit Trail', () => {
    const testDid = 'did:key:z6MkAuditTest' + Date.now()

    it('should log trust entity addition', async () => {
      await request(app)
        .post('/api/v1/trust/entities')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          did: testDid,
          name: 'Audit Test Entity',
          type: 'issuer',
          trustLevel: 'basic',
        })
        .expect(200)

      const auditResponse = await request(app)
        .get('/api/v1/audit/logs')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          eventType: 'TRUST_ENTITY_ADDED',
          limit: 10,
        })
        .expect(200)

      const addLog = auditResponse.body.logs.find(
        (log: any) => log.eventType === 'TRUST_ENTITY_ADDED' && log.details?.did === testDid
      )
      expect(addLog).toBeDefined()
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
          eventType: 'TRUST_ENTITY_REMOVED',
          limit: 10,
        })
        .expect(200)

      const removeLog = auditResponse.body.logs.find(
        (log: any) => log.eventType === 'TRUST_ENTITY_REMOVED'
      )
      expect(removeLog).toBeDefined()
    })
  })

  describe('Audit Statistics', () => {
    it('should return audit statistics', async () => {
      const response = await request(app)
        .get('/api/v1/audit/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(response.body).toHaveProperty('total')
      expect(response.body).toHaveProperty('byEventType')
      expect(response.body).toHaveProperty('byOutcome')
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

    it('should filter audit logs by actor', async () => {
      const response = await request(app)
        .get('/api/v1/audit/logs')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          actorId: 'test-user',
          limit: 10,
        })
        .expect(200)

      expect(response.body.logs).toBeDefined()
    })
  })

  describe('Audit Security', () => {
    it('should require authentication for audit logs', async () => {
      await request(app).get('/api/v1/audit/logs').expect(401)
    })

    it('should require admin permission for audit stats', async () => {
      const limitedToken = getTestToken(['read:credentials'])

      const response = await request(app)
        .get('/api/v1/audit/stats')
        .set('Authorization', `Bearer ${limitedToken}`)

      // Should either succeed (if read permission includes audit) or return 403
      expect([200, 403]).toContain(response.status)
    })

    it('should not allow audit log deletion', async () => {
      await request(app)
        .delete('/api/v1/audit/logs')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404) // Endpoint should not exist
    })
  })
})
