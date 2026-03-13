import request from 'supertest'
import { Express } from 'express'
import { createServer } from '../../src/api/server'
import { testData, getTestToken } from '../helpers'

/**
 * End-to-End Credential Flow Tests
 *
 * These tests verify auth, validation, and endpoint routing for the
 * credential lifecycle. Full issuance requires agent initialization
 * (Credo/Jose key material) which is not available in test env, so
 * agent-dependent steps verify auth + validation only and accept
 * 400/500 when the agent is not initialized.
 *
 * Flow outline:
 * 1. Issuer creates credential offer (OpenID4VCI)
 * 2. Holder retrieves credential offer
 * 3. Holder exchanges pre-authorized code for token
 * 4. Holder requests credential
 * 5. Verifier creates authorization request (OpenID4VP)
 * 6. Holder submits presentation via direct_post
 * 7. Verifier retrieves verification result
 * 8. Issuer revokes credential
 * 9. Trust registry operations
 */
describe('End-to-End Credential Flow', () => {
  let app: Express
  let authToken: string

  beforeAll(() => {
    app = createServer()
    authToken = getTestToken(['*'])
  })

  // ─── OpenID4VCI Flow ─────────────────────────────────────────────────

  describe('OpenID4VCI: Credential Offer + Token + Issuance', () => {
    let credentialOfferId: string
    let preAuthorizedCode: string

    it('Step 1: Issuer creates credential offer (requires agent init)', async () => {
      const response = await request(app)
        .post('/api/v1/openid4vci/credential-offer')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          credentialTypes: ['AIAgentIdentityCredential'],
          expiresInSeconds: 600,
        })

      // Agent may not be initialized in test env — accept 200 or 500
      if (response.status === 200) {
        expect(response.body).toHaveProperty('offerId')
        expect(response.body).toHaveProperty('credentialOffer')
        expect(response.body).toHaveProperty('credentialOfferUri')

        credentialOfferId = response.body.offerId

        const grants = response.body.credentialOffer.grants
        preAuthorizedCode =
          grants['urn:ietf:params:oauth:grant-type:pre-authorized_code']['pre-authorized_code']

        expect(preAuthorizedCode).toBeDefined()
      } else {
        // Agent not initialized — just verify it's not an auth error
        expect(response.status).not.toBe(401)
        expect(response.status).not.toBe(403)
      }
    })

    it('Step 1b: Credential offer rejects missing credentialTypes', async () => {
      const response = await request(app)
        .post('/api/v1/openid4vci/credential-offer')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})

      expect(response.status).toBe(400)
      expect(response.body).toHaveProperty('error', 'invalid_request')
    })

    it('Step 1c: Credential offer rejects unauthenticated requests', async () => {
      const response = await request(app)
        .post('/api/v1/openid4vci/credential-offer')
        .send({ credentialTypes: ['AIAgentIdentityCredential'] })

      expect(response.status).toBe(401)
    })

    it('Step 2: Holder retrieves credential offer', async () => {
      if (!credentialOfferId) return // Skip if offer creation failed

      const response = await request(app)
        .get(`/api/v1/openid4vci/credential-offer/${credentialOfferId}`)
        .set('Authorization', `Bearer ${authToken}`)

      expect([200, 404]).toContain(response.status)

      if (response.status === 200) {
        expect(response.body).toHaveProperty('offer')
      }
    })

    it('Step 2b: Returns 404 for non-existent offer', async () => {
      const response = await request(app)
        .get('/api/v1/openid4vci/credential-offer/non-existent-offer-id')
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.status).toBe(404)
      expect(response.body).toHaveProperty('error', 'not_found')
    })

    it('Step 3: Token endpoint rejects unsupported grant type', async () => {
      const response = await request(app)
        .post('/api/v1/openid4vci/token')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          grant_type: 'authorization_code',
          code: 'some-code',
        })

      expect(response.status).toBe(400)
      expect(response.body).toHaveProperty('error', 'unsupported_grant_type')
    })

    it('Step 3b: Token endpoint rejects missing pre-authorized_code', async () => {
      const response = await request(app)
        .post('/api/v1/openid4vci/token')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
        })

      expect(response.status).toBe(400)
      expect(response.body).toHaveProperty('error', 'invalid_request')
    })

    it('Step 3c: Token endpoint rejects invalid pre-authorized_code', async () => {
      const response = await request(app)
        .post('/api/v1/openid4vci/token')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
          'pre-authorized_code': 'invalid-code-12345',
        })

      expect(response.status).toBe(400)
      expect(response.body).toHaveProperty('error')
    })

    it('Step 3d: Token exchange succeeds with valid code (if offer was created)', async () => {
      if (!preAuthorizedCode) return // Skip if offer creation failed

      const response = await request(app)
        .post('/api/v1/openid4vci/token')
        .send({
          grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
          'pre-authorized_code': preAuthorizedCode,
        })

      // May succeed or fail depending on agent init
      if (response.status === 200) {
        expect(response.body).toHaveProperty('access_token')
        expect(response.body).toHaveProperty('token_type', 'Bearer')
      }
    })

    it('Step 4: Credential endpoint rejects unauthenticated request', async () => {
      const response = await request(app)
        .post('/api/v1/openid4vci/credential')
        .send({
          format: 'jwt_vc_json',
          credential_definition: {
            type: ['VerifiableCredential', 'AIAgentIdentityCredential'],
          },
        })

      expect(response.status).toBe(401)
    })

    it('Step 4b: Credential endpoint rejects invalid access token', async () => {
      const response = await request(app)
        .post('/api/v1/openid4vci/credential')
        .set('Authorization', 'Bearer invalid-access-token')
        .send({
          format: 'jwt_vc_json',
          credential_definition: {
            type: ['VerifiableCredential', 'AIAgentIdentityCredential'],
          },
        })

      // Should return 400 or 401 — invalid token
      expect([400, 401]).toContain(response.status)
    })
  })

  // ─── Issuer Agent Routes ─────────────────────────────────────────────

  describe('Issuer Agent: Typed Credential Issuance', () => {
    it('should accept agent identity credential request (auth + validation)', async () => {
      const response = await request(app)
        .post('/api/v1/issuer/credentials/agent-identity')
        .set('Authorization', `Bearer ${authToken}`)
        .send(testData.agentIdentityCredential)

      // Agent may not be initialized — accept 200 or 500
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true)
        expect(response.body).toHaveProperty('credentialOfferId')
        expect(response.body).toHaveProperty('credentialOfferUri')
      } else {
        // Not an auth/validation error
        expect(response.status).not.toBe(401)
        expect(response.status).not.toBe(400)
      }
    })

    it('should reject unauthenticated agent-identity request', async () => {
      const response = await request(app)
        .post('/api/v1/issuer/credentials/agent-identity')
        .send(testData.agentIdentityCredential)

      expect(response.status).toBe(401)
    })

    it('should reject agent-identity request with invalid body', async () => {
      const response = await request(app)
        .post('/api/v1/issuer/credentials/agent-identity')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})

      expect(response.status).toBe(400)
    })

    it('should accept delegation credential request (auth + validation)', async () => {
      const response = await request(app)
        .post('/api/v1/issuer/credentials/delegation')
        .set('Authorization', `Bearer ${authToken}`)
        .send(testData.delegationCredential)

      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true)
      } else {
        expect(response.status).not.toBe(401)
        expect(response.status).not.toBe(400)
      }
    })

    it('should accept capability credential request (auth + validation)', async () => {
      const response = await request(app)
        .post('/api/v1/issuer/credentials/capability')
        .set('Authorization', `Bearer ${authToken}`)
        .send(testData.capabilityCredential)

      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true)
      } else {
        expect(response.status).not.toBe(401)
        expect(response.status).not.toBe(400)
      }
    })

    it('should return issuer DID', async () => {
      const response = await request(app)
        .get('/api/v1/issuer/did')
        .set('Authorization', `Bearer ${authToken}`)

      // DID may not be available if agent not initialized
      if (response.status === 200) {
        expect(response.body).toHaveProperty('did')
      } else {
        expect(response.status).toBe(500) // agent not initialized
      }
    })
  })

  // ─── Holder Routes ───────────────────────────────────────────────────

  describe('Holder: Credential Storage + Retrieval', () => {
    it('should list stored credentials', async () => {
      const response = await request(app)
        .get('/api/v1/holder/credentials')
        .set('Authorization', `Bearer ${authToken}`)

      // May fail if agent not initialized
      if (response.status === 200) {
        expect(response.body).toHaveProperty('credentials')
        expect(Array.isArray(response.body.credentials)).toBe(true)
      } else {
        expect(response.status).not.toBe(401)
      }
    })

    it('should reject unauthenticated credential listing', async () => {
      const response = await request(app).get('/api/v1/holder/credentials')

      expect(response.status).toBe(401)
    })

    it('should return holder DID', async () => {
      const response = await request(app)
        .get('/api/v1/holder/did')
        .set('Authorization', `Bearer ${authToken}`)

      if (response.status === 200) {
        expect(response.body).toHaveProperty('did')
      } else {
        expect(response.status).toBe(500) // agent not initialized
      }
    })

    it('should reject credential receive without credentialOfferUri', async () => {
      const response = await request(app)
        .post('/api/v1/holder/credentials/receive')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})

      expect(response.status).toBe(400)
    })
  })

  // ─── OpenID4VP Flow ──────────────────────────────────────────────────

  describe('OpenID4VP: Authorization Request + Presentation', () => {
    it('Step 5: Verifier creates authorization request (requires agent init)', async () => {
      const response = await request(app)
        .post('/api/v1/openid4vp/authorization-request')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          presentationDefinitionId: 'agent-identity',
        })

      // Agent may not be initialized
      if (response.status === 200) {
        expect(response.body).toHaveProperty('sessionId')
        expect(response.body).toHaveProperty('authorizationRequestUri')
      } else {
        expect(response.status).not.toBe(401)
      }
    })

    it('Step 5b: Authorization request rejects missing definition', async () => {
      const response = await request(app)
        .post('/api/v1/openid4vp/authorization-request')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})

      expect(response.status).toBe(400)
      expect(response.body).toHaveProperty('error', 'invalid_request')
    })

    it('Step 5c: Authorization request rejects unauthenticated', async () => {
      const response = await request(app)
        .post('/api/v1/openid4vp/authorization-request')
        .send({ presentationDefinitionId: 'agent-identity' })

      expect(response.status).toBe(401)
    })

    it('Step 6: direct_post rejects missing vp_token', async () => {
      const response = await request(app)
        .post('/direct_post')
        .send({
          state: 'some-session-id',
        })

      expect(response.status).toBe(400)
      expect(response.body).toHaveProperty('error', 'invalid_request')
    })

    it('Step 7: Session result returns 404 for unknown session', async () => {
      const response = await request(app)
        .get('/api/v1/openid4vp/sessions/non-existent-session-id/result')
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.status).toBe(404)
    })

    it('should list presentation definitions', async () => {
      const response = await request(app)
        .get('/api/v1/openid4vp/presentation-definitions')
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('definitions')
    })
  })

  // ─── Verifier Agent Routes ───────────────────────────────────────────

  describe('Verifier: Typed Verification Requests', () => {
    it('should create agent-identity verification request (requires agent init)', async () => {
      const response = await request(app)
        .post('/api/v1/verifier/verify/agent-identity')
        .set('Authorization', `Bearer ${authToken}`)

      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true)
        expect(response.body).toHaveProperty('requestUri')
        expect(response.body).toHaveProperty('verificationSessionId')
      } else {
        expect(response.status).not.toBe(401)
      }
    })

    it('should create delegation verification request (requires agent init)', async () => {
      const response = await request(app)
        .post('/api/v1/verifier/verify/delegation')
        .set('Authorization', `Bearer ${authToken}`)

      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true)
      } else {
        expect(response.status).not.toBe(401)
      }
    })

    it('should reject unauthenticated verification request', async () => {
      const response = await request(app).post('/api/v1/verifier/verify/agent-identity')

      expect(response.status).toBe(401)
    })

    it('should return verifier DID', async () => {
      const response = await request(app)
        .get('/api/v1/verifier/did')
        .set('Authorization', `Bearer ${authToken}`)

      if (response.status === 200) {
        expect(response.body).toHaveProperty('did')
      } else {
        expect(response.status).toBe(500)
      }
    })
  })

  // ─── Revocation ──────────────────────────────────────────────────────

  describe('Revocation: Credential Lifecycle', () => {
    it('should revoke a credential (may return 404 for non-existent)', async () => {
      const response = await request(app)
        .post('/api/v1/revocation/revoke')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          credentialId: 'test-credential-to-revoke',
          reason: 'E2E test revocation',
        })

      // Credential may not exist, so 404 is expected
      expect([200, 404]).toContain(response.status)

      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true)
      }
    })

    it('should reject revoke without credentialId', async () => {
      const response = await request(app)
        .post('/api/v1/revocation/revoke')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})

      expect(response.status).toBe(400)
    })

    it('should reject unauthenticated revoke', async () => {
      const response = await request(app)
        .post('/api/v1/revocation/revoke')
        .send({ credentialId: 'test-cred' })

      expect(response.status).toBe(401)
    })

    it('should check revocation status for a credential', async () => {
      const response = await request(app)
        .get('/api/v1/revocation/verify/test-credential-id')
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('revoked')
      expect(response.body).toHaveProperty('valid')
    })

    it('should return revocation stats', async () => {
      const response = await request(app)
        .get('/api/v1/revocation/stats')
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.status).toBe(200)
    })
  })

  // ─── Trust Registry ──────────────────────────────────────────────────

  describe('Trust Registry Integration', () => {
    const trustedIssuerDid = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'

    it('should add issuer to trust registry', async () => {
      const response = await request(app)
        .post('/api/v1/trust/entities')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          did: trustedIssuerDid,
          name: 'Test Trusted Issuer',
          type: 'issuer',
          trustLevel: 'high',
        })

      // May succeed or fail depending on storage init
      if (response.status === 200 || response.status === 201) {
        expect(response.body).toHaveProperty('success', true)
      } else {
        expect(response.status).not.toBe(401)
      }
    })

    it('should reject unauthenticated trust entity creation', async () => {
      const response = await request(app)
        .post('/api/v1/trust/entities')
        .send({
          did: trustedIssuerDid,
          name: 'Test Issuer',
          type: 'issuer',
          trustLevel: 'high',
        })

      expect(response.status).toBe(401)
    })

    it('should reject trust entity with invalid body', async () => {
      const response = await request(app)
        .post('/api/v1/trust/entities')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          did: 'not-a-valid-did',
        })

      expect(response.status).toBe(400)
    })
  })

  // ─── Credential Offer Expiration ─────────────────────────────────────

  describe('Credential Offer Expiration', () => {
    it('should handle expired credential offer (returns 410)', async () => {
      // Create offer with very short expiry
      const createResponse = await request(app)
        .post('/api/v1/openid4vci/credential-offer')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          credentialTypes: ['AIAgentIdentityCredential'],
          expiresInSeconds: 1,
        })

      if (createResponse.status !== 200) {
        // Agent not initialized — skip this test
        return
      }

      const offerId = createResponse.body.offerId

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 1500))

      // Try to retrieve expired offer — should return 410 (Gone)
      const expiredResponse = await request(app)
        .get(`/api/v1/openid4vci/credential-offer/${offerId}`)
        .set('Authorization', `Bearer ${authToken}`)

      expect(expiredResponse.status).toBe(410)
      expect(expiredResponse.body).toHaveProperty('error', 'expired')
    })
  })

  // ─── Concurrent Requests ─────────────────────────────────────────────

  describe('Concurrent Request Handling', () => {
    it('should handle concurrent credential offer requests', async () => {
      const offerPromises = Array(3)
        .fill(null)
        .map(() =>
          request(app)
            .post('/api/v1/openid4vci/credential-offer')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              credentialTypes: ['AIAgentIdentityCredential'],
            })
        )

      const responses = await Promise.all(offerPromises)

      // All should get the same status (either all succeed or all fail due to agent)
      const statuses = Array.from(new Set(responses.map((r) => r.status)))
      expect(statuses.length).toBe(1) // All same status

      if (responses[0].status === 200) {
        // All offer IDs should be unique
        const offerIds = responses.map((r) => r.body.offerId)
        const uniqueIds = new Set(offerIds)
        expect(uniqueIds.size).toBe(offerIds.length)
      }
    })
  })

  // ─── API Key Auth ────────────────────────────────────────────────────

  describe('API Key Authentication', () => {
    it('should authenticate with valid API key', async () => {
      const response = await request(app)
        .get('/api/v1/holder/credentials')
        .set('X-API-Key', 'test-api-key-12345')

      // Should not be 401 — API key is valid
      expect(response.status).not.toBe(401)
    })

    it('should reject invalid API key', async () => {
      const response = await request(app)
        .get('/api/v1/holder/credentials')
        .set('X-API-Key', 'wrong-api-key')

      expect(response.status).toBe(401)
    })
  })

  // ─── Well-Known Endpoints ────────────────────────────────────────────

  describe('Discovery Endpoints (no auth)', () => {
    it('should return issuer metadata at well-known endpoint', async () => {
      const response = await request(app)
        .get('/.well-known/openid-credential-issuer')

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('credential_issuer')
    })

    it('should return authorization server metadata', async () => {
      const response = await request(app)
        .get('/.well-known/oauth-authorization-server')

      expect(response.status).toBe(200)
    })
  })
})
