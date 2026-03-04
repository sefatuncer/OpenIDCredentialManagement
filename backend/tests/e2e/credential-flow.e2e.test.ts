import request from 'supertest'
import { Express } from 'express'
import { createServer } from '../../src/api/server'
import { testData, getTestToken } from '../helpers'

/**
 * End-to-End Credential Flow Tests
 *
 * These tests verify the complete credential lifecycle:
 * 1. Issuer creates credential offer
 * 2. Holder exchanges code for token
 * 3. Holder receives credential
 * 4. Verifier requests presentation
 * 5. Holder presents credential
 * 6. Verifier verifies presentation
 * 7. Issuer revokes credential
 * 8. Verification fails after revocation
 */
describe('End-to-End Credential Flow', () => {
  let app: Express
  let authToken: string

  beforeAll(() => {
    app = createServer()
    authToken = getTestToken(['*'])
  })

  describe('Complete AI Agent Identity Flow', () => {
    let credentialOfferId: string
    let preAuthorizedCode: string
    let accessToken: string
    let issuedCredential: string
    let credentialId: string

    // Step 1: Create credential offer
    it('Step 1: Issuer creates credential offer for AI Agent Identity', async () => {
      const response = await request(app)
        .post('/api/v1/openid4vci/offer')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          credentialTypes: ['AIAgentIdentityCredential'],
          claims: testData.agentIdentityCredential,
          expiresInSeconds: 600,
        })
        .expect(200)

      expect(response.body).toHaveProperty('offerId')
      expect(response.body).toHaveProperty('credentialOffer')
      expect(response.body).toHaveProperty('credentialOfferUri')

      credentialOfferId = response.body.offerId

      // Extract pre-authorized code
      const grants = response.body.credentialOffer.grants
      preAuthorizedCode =
        grants['urn:ietf:params:oauth:grant-type:pre-authorized_code']['pre-authorized_code']

      expect(preAuthorizedCode).toBeDefined()
      console.log(`  ✓ Credential offer created: ${credentialOfferId}`)
    })

    // Step 2: Holder retrieves offer
    it('Step 2: Holder retrieves credential offer', async () => {
      const response = await request(app)
        .get(`/api/v1/openid4vci/offer/${credentialOfferId}`)
        .expect(200)

      expect(response.body).toHaveProperty('offer')
      expect(response.body.expired).toBe(false)
      expect(response.body.claimed).toBe(false)

      console.log(`  ✓ Credential offer retrieved`)
    })

    // Step 3: Exchange code for token
    it('Step 3: Holder exchanges pre-authorized code for access token', async () => {
      const response = await request(app)
        .post('/api/v1/openid4vci/token')
        .send({
          grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
          'pre-authorized_code': preAuthorizedCode,
        })
        .expect(200)

      expect(response.body).toHaveProperty('access_token')
      expect(response.body).toHaveProperty('token_type', 'Bearer')
      expect(response.body).toHaveProperty('c_nonce')

      accessToken = response.body.access_token
      console.log(`  ✓ Access token obtained`)
    })

    // Step 4: Request credential
    it('Step 4: Holder requests credential from issuer', async () => {
      const response = await request(app)
        .post('/api/v1/openid4vci/credential')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          format: 'jwt_vc_json',
          credential_definition: {
            type: ['VerifiableCredential', 'AIAgentIdentityCredential'],
          },
        })
        .expect(200)

      expect(response.body).toHaveProperty('format', 'jwt_vc_json')
      expect(response.body.credential || response.body.acceptance_token).toBeDefined()

      issuedCredential = response.body.credential
      credentialId = response.body.credentialId || extractCredentialId(issuedCredential)

      console.log(`  ✓ Credential issued: ${credentialId?.substring(0, 20)}...`)
    })

    // Step 5: Store credential in holder wallet
    it('Step 5: Holder stores credential in wallet', async () => {
      const response = await request(app)
        .post('/api/v1/holder/credentials')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          credential: issuedCredential,
          credentialId: credentialId,
        })
        .expect(200)

      expect(response.body.success).toBe(true)
      console.log(`  ✓ Credential stored in holder wallet`)
    })

    // Step 6: Verify credential is valid
    it('Step 6: Verify issued credential is valid', async () => {
      const response = await request(app)
        .post('/api/v1/verifier/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          credential: issuedCredential,
        })
        .expect(200)

      expect(response.body.verified).toBe(true)
      expect(response.body.revoked).toBe(false)

      console.log(`  ✓ Credential verified as valid`)
    })

    // Step 7: Verifier creates presentation request
    let authorizationRequestUri: string
    let sessionId: string

    it('Step 7: Verifier creates presentation request', async () => {
      const response = await request(app)
        .post('/api/v1/openid4vp/request')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          presentationDefinitionId: 'agent-identity-verification',
          purpose: 'Verify AI Agent Identity',
          responseMode: 'direct_post',
        })
        .expect(200)

      expect(response.body).toHaveProperty('authorizationRequestUri')
      expect(response.body).toHaveProperty('sessionId')

      authorizationRequestUri = response.body.authorizationRequestUri
      sessionId = response.body.sessionId

      console.log(`  ✓ Presentation request created: ${sessionId}`)
    })

    // Step 8: Holder presents credential
    it('Step 8: Holder submits presentation to verifier', async () => {
      const response = await request(app)
        .post('/api/v1/openid4vp/response')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sessionId: sessionId,
          vp_token: createVPToken(issuedCredential),
          presentation_submission: {
            id: 'submission-1',
            definition_id: 'agent-identity-verification',
            descriptor_map: [
              {
                id: 'agent-identity',
                format: 'jwt_vp',
                path: '$',
                path_nested: {
                  format: 'jwt_vc',
                  path: '$.vp.verifiableCredential[0]',
                },
              },
            ],
          },
        })
        .expect(200)

      expect(response.body.verified).toBe(true)
      console.log(`  ✓ Presentation verified successfully`)
    })

    // Step 9: Get verification result
    it('Step 9: Verifier retrieves verification result', async () => {
      const response = await request(app)
        .get(`/api/v1/openid4vp/result/${sessionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      expect(response.body).toHaveProperty('status')
      expect(['verified', 'completed']).toContain(response.body.status)

      console.log(`  ✓ Verification result retrieved: ${response.body.status}`)
    })

    // Step 10: Revoke credential
    it('Step 10: Issuer revokes the credential', async () => {
      const response = await request(app)
        .post('/api/v1/issuer/credentials/revoke')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          credentialId: credentialId,
          reason: 'E2E test revocation',
        })
        .expect(200)

      expect(response.body.success).toBe(true)
      console.log(`  ✓ Credential revoked`)
    })

    // Step 11: Verify credential is now revoked
    it('Step 11: Verify credential shows as revoked', async () => {
      const response = await request(app)
        .post('/api/v1/verifier/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          credential: issuedCredential,
          checkRevocation: true,
        })
        .expect(200)

      expect(response.body.revoked).toBe(true)
      console.log(`  ✓ Credential verified as revoked`)
    })
  })

  describe('Delegation Credential Flow', () => {
    let delegationCredential: string
    let delegationCredentialId: string

    it('should issue delegation credential', async () => {
      // Create offer
      const offerResponse = await request(app)
        .post('/api/v1/openid4vci/offer')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          credentialTypes: ['DelegationCredential'],
          claims: testData.delegationCredential,
        })
        .expect(200)

      const preAuthCode =
        offerResponse.body.credentialOffer.grants[
          'urn:ietf:params:oauth:grant-type:pre-authorized_code'
        ]['pre-authorized_code']

      // Exchange for token
      const tokenResponse = await request(app)
        .post('/api/v1/openid4vci/token')
        .send({
          grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
          'pre-authorized_code': preAuthCode,
        })
        .expect(200)

      // Request credential
      const credResponse = await request(app)
        .post('/api/v1/openid4vci/credential')
        .set('Authorization', `Bearer ${tokenResponse.body.access_token}`)
        .send({
          format: 'jwt_vc_json',
          credential_definition: {
            type: ['VerifiableCredential', 'DelegationCredential'],
          },
        })
        .expect(200)

      delegationCredential = credResponse.body.credential
      delegationCredentialId = credResponse.body.credentialId

      expect(delegationCredential).toBeDefined()
    })

    it('should verify delegation scope in presentation', async () => {
      // Create presentation request for delegation
      const requestResponse = await request(app)
        .post('/api/v1/openid4vp/request')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          presentationDefinitionId: 'delegation-verification',
          requiredScope: ['read:documents'],
        })
        .expect(200)

      // Submit presentation
      const verifyResponse = await request(app)
        .post('/api/v1/openid4vp/response')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sessionId: requestResponse.body.sessionId,
          vp_token: createVPToken(delegationCredential),
          presentation_submission: {
            id: 'delegation-submission',
            definition_id: 'delegation-verification',
            descriptor_map: [
              {
                id: 'delegation',
                format: 'jwt_vp',
                path: '$',
              },
            ],
          },
        })
        .expect(200)

      expect(verifyResponse.body.verified).toBe(true)
    })
  })

  describe('Multi-Credential Presentation', () => {
    let identityCredential: string
    let capabilityCredential: string

    beforeAll(async () => {
      // Issue identity credential
      const identityOffer = await request(app)
        .post('/api/v1/openid4vci/offer')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          credentialTypes: ['AIAgentIdentityCredential'],
          claims: testData.agentIdentityCredential,
        })

      const identityCode =
        identityOffer.body.credentialOffer.grants[
          'urn:ietf:params:oauth:grant-type:pre-authorized_code'
        ]['pre-authorized_code']

      const identityToken = await request(app).post('/api/v1/openid4vci/token').send({
        grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
        'pre-authorized_code': identityCode,
      })

      const identityCred = await request(app)
        .post('/api/v1/openid4vci/credential')
        .set('Authorization', `Bearer ${identityToken.body.access_token}`)
        .send({
          format: 'jwt_vc_json',
          credential_definition: {
            type: ['VerifiableCredential', 'AIAgentIdentityCredential'],
          },
        })

      identityCredential = identityCred.body.credential

      // Issue capability credential
      const capabilityOffer = await request(app)
        .post('/api/v1/openid4vci/offer')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          credentialTypes: ['CapabilityCredential'],
          claims: testData.capabilityCredential,
        })

      const capabilityCode =
        capabilityOffer.body.credentialOffer.grants[
          'urn:ietf:params:oauth:grant-type:pre-authorized_code'
        ]['pre-authorized_code']

      const capabilityToken = await request(app).post('/api/v1/openid4vci/token').send({
        grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
        'pre-authorized_code': capabilityCode,
      })

      const capabilityCred = await request(app)
        .post('/api/v1/openid4vci/credential')
        .set('Authorization', `Bearer ${capabilityToken.body.access_token}`)
        .send({
          format: 'jwt_vc_json',
          credential_definition: {
            type: ['VerifiableCredential', 'CapabilityCredential'],
          },
        })

      capabilityCredential = capabilityCred.body.credential
    })

    it('should verify multi-credential presentation', async () => {
      // Request both credentials
      const requestResponse = await request(app)
        .post('/api/v1/openid4vp/request')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          presentationDefinitionId: 'full-agent-verification',
          purpose: 'Verify agent identity and capabilities',
        })
        .expect(200)

      // Submit multi-credential presentation
      const verifyResponse = await request(app)
        .post('/api/v1/openid4vp/response')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sessionId: requestResponse.body.sessionId,
          vp_token: createMultiCredentialVPToken([identityCredential, capabilityCredential]),
          presentation_submission: {
            id: 'multi-submission',
            definition_id: 'full-agent-verification',
            descriptor_map: [
              {
                id: 'identity',
                format: 'jwt_vp',
                path: '$',
                path_nested: {
                  format: 'jwt_vc',
                  path: '$.vp.verifiableCredential[0]',
                },
              },
              {
                id: 'capability',
                format: 'jwt_vp',
                path: '$',
                path_nested: {
                  format: 'jwt_vc',
                  path: '$.vp.verifiableCredential[1]',
                },
              },
            ],
          },
        })
        .expect(200)

      expect(verifyResponse.body.verified).toBe(true)
    })
  })

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
        .expect(200)

      expect(response.body.success).toBe(true)
    })

    it('should verify credential from trusted issuer', async () => {
      // Create and issue credential from trusted issuer
      const offerResponse = await request(app)
        .post('/api/v1/openid4vci/offer')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          credentialTypes: ['AIAgentIdentityCredential'],
          claims: testData.agentIdentityCredential,
          issuerDid: trustedIssuerDid,
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

      // Verify with trust check
      const verifyResponse = await request(app)
        .post('/api/v1/verifier/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          credential: credResponse.body.credential,
          checkTrust: true,
        })
        .expect(200)

      expect(verifyResponse.body.verified).toBe(true)
      expect(verifyResponse.body.trustedIssuer).toBe(true)
    })

    it('should flag credential from untrusted issuer', async () => {
      const untrustedCredential = createMockCredential({
        issuer: 'did:key:z6MkUntrusted123456789',
        type: 'AIAgentIdentityCredential',
      })

      const response = await request(app)
        .post('/api/v1/verifier/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          credential: untrustedCredential,
          checkTrust: true,
        })
        .expect(200)

      expect(response.body.trustedIssuer).toBe(false)
    })
  })

  describe('Error Recovery Scenarios', () => {
    it('should handle expired credential offer gracefully', async () => {
      // Create offer with very short expiry
      const response = await request(app)
        .post('/api/v1/openid4vci/offer')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          credentialTypes: ['AIAgentIdentityCredential'],
          claims: testData.agentIdentityCredential,
          expiresInSeconds: 1,
        })
        .expect(200)

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 1500))

      // Try to retrieve expired offer
      const expiredResponse = await request(app)
        .get(`/api/v1/openid4vci/offer/${response.body.offerId}`)
        .expect(200)

      expect(expiredResponse.body.expired).toBe(true)
    })

    it('should reject invalid presentation submission', async () => {
      const requestResponse = await request(app)
        .post('/api/v1/openid4vp/request')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          presentationDefinitionId: 'agent-identity-verification',
        })
        .expect(200)

      // Submit invalid presentation
      const response = await request(app)
        .post('/api/v1/openid4vp/response')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sessionId: requestResponse.body.sessionId,
          vp_token: 'invalid-token',
          presentation_submission: {
            id: 'invalid',
            definition_id: 'wrong-definition',
            descriptor_map: [],
          },
        })
        .expect(400)

      expect(response.body).toHaveProperty('error')
    })

    it('should handle concurrent credential requests', async () => {
      const offerPromises = Array(5)
        .fill(null)
        .map(() =>
          request(app)
            .post('/api/v1/openid4vci/offer')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              credentialTypes: ['AIAgentIdentityCredential'],
              claims: testData.agentIdentityCredential,
            })
        )

      const responses = await Promise.all(offerPromises)

      // All should succeed
      responses.forEach((response) => {
        expect(response.status).toBe(200)
        expect(response.body).toHaveProperty('offerId')
      })

      // All offer IDs should be unique
      const offerIds = responses.map((r) => r.body.offerId)
      const uniqueIds = new Set(offerIds)
      expect(uniqueIds.size).toBe(offerIds.length)
    })
  })
})

// Helper functions

function extractCredentialId(credential: string): string {
  try {
    const parts = credential.split('.')
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())
      return payload.jti || payload.vc?.id || `cred-${Date.now()}`
    }
  } catch {
    // Ignore parsing errors
  }
  return `cred-${Date.now()}`
}

function createVPToken(credential: string): string {
  // Create a mock VP token for testing
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({
      iss: testData.validDid,
      aud: 'https://verifier.example.com',
      nonce: 'test-nonce',
      vp: {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: ['VerifiablePresentation'],
        verifiableCredential: [credential],
      },
    })
  ).toString('base64url')
  const signature = 'mock-signature'
  return `${header}.${payload}.${signature}`
}

function createMultiCredentialVPToken(credentials: string[]): string {
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({
      iss: testData.validDid,
      aud: 'https://verifier.example.com',
      nonce: 'test-nonce',
      vp: {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: ['VerifiablePresentation'],
        verifiableCredential: credentials,
      },
    })
  ).toString('base64url')
  const signature = 'mock-signature'
  return `${header}.${payload}.${signature}`
}

function createMockCredential(options: { issuer: string; type: string }): string {
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({
      iss: options.issuer,
      sub: testData.validDid,
      vc: {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: ['VerifiableCredential', options.type],
        credentialSubject: {
          id: testData.validDid,
        },
      },
    })
  ).toString('base64url')
  const signature = 'mock-signature'
  return `${header}.${payload}.${signature}`
}
