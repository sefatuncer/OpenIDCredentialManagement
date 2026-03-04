import request from 'supertest'
import { Express } from 'express'
import { createServer } from '../../src/api/server'

describe('OpenID4VP Integration Tests', () => {
  let app: Express

  beforeAll(() => {
    app = createServer()
  })

  describe('Presentation Definitions', () => {
    it('should list available presentation definitions', async () => {
      const response = await request(app)
        .get('/api/v1/openid4vp/presentation-definitions')
        .expect(200)

      expect(response.body).toHaveProperty('definitions')
      expect(Array.isArray(response.body.definitions)).toBe(true)
      expect(response.body.definitions.length).toBeGreaterThan(0)

      // Check for known definitions
      const defIds = response.body.definitions.map((d: any) => d.id)
      expect(defIds).toContain('agent-identity')
      expect(defIds).toContain('delegation')
      expect(defIds).toContain('capability')
    })

    it('should get specific presentation definition', async () => {
      const response = await request(app)
        .get('/api/v1/openid4vp/presentation-definitions/agent-identity')
        .expect(200)

      expect(response.body).toHaveProperty('id', 'agent-identity-verification')
      expect(response.body).toHaveProperty('input_descriptors')
      expect(Array.isArray(response.body.input_descriptors)).toBe(true)
    })

    it('should return 404 for unknown presentation definition', async () => {
      const response = await request(app)
        .get('/api/v1/openid4vp/presentation-definitions/unknown')
        .expect(404)

      expect(response.body).toHaveProperty('error', 'not_found')
    })
  })

  describe('Authorization Request Flow', () => {
    let sessionId: string
    let state: string

    it('should create authorization request', async () => {
      const response = await request(app)
        .post('/api/v1/openid4vp/authorization-request')
        .send({
          presentationDefinitionId: 'agent-identity',
          expiresInSeconds: 300,
        })
        .expect(200)

      expect(response.body).toHaveProperty('sessionId')
      expect(response.body).toHaveProperty('authorizationRequest')
      expect(response.body).toHaveProperty('authorizationRequestUri')

      sessionId = response.body.sessionId
      state = response.body.authorizationRequest.state

      // Verify authorization request structure
      const authReq = response.body.authorizationRequest
      expect(authReq.response_type).toBe('vp_token')
      expect(authReq.response_mode).toBe('direct_post')
      expect(authReq).toHaveProperty('client_id')
      expect(authReq).toHaveProperty('nonce')
      expect(authReq).toHaveProperty('presentation_definition')
    })

    it('should get session status', async () => {
      const response = await request(app)
        .get(`/api/v1/openid4vp/sessions/${sessionId}`)
        .expect(200)

      expect(response.body).toHaveProperty('sessionId', sessionId)
      expect(response.body).toHaveProperty('status', 'pending')
      expect(response.body).toHaveProperty('expired', false)
    })

    it('should return pending result for unsubmitted session', async () => {
      const response = await request(app)
        .get(`/api/v1/openid4vp/sessions/${sessionId}/result`)
        .expect(200)

      expect(response.body).toHaveProperty('verified', false)
      expect(response.body.errors).toContain('Presentation not yet submitted')
    })

    it('should handle direct_post submission', async () => {
      // Note: This test uses a mock VP token since we don't have a real holder wallet
      const mockVpToken = createMockVpToken(state)

      const response = await request(app)
        .post('/api/v1/openid4vp/direct_post')
        .send({
          vp_token: mockVpToken,
          presentation_submission: JSON.stringify({
            id: 'test-submission',
            definition_id: 'agent-identity-verification',
            descriptor_map: [],
          }),
          state: state,
        })
        .expect(200)

      // Should receive success response
      expect(response.body).toHaveProperty('status', 'received')
    })

    it('should reject direct_post with invalid state', async () => {
      const response = await request(app)
        .post('/api/v1/openid4vp/direct_post')
        .send({
          vp_token: 'mock-token',
          presentation_submission: '{}',
          state: 'invalid-state',
        })
        .expect(400)

      expect(response.body).toHaveProperty('error', 'invalid_request')
    })

    it('should return 404 for non-existent session', async () => {
      const response = await request(app)
        .get('/api/v1/openid4vp/sessions/non-existent-id')
        .expect(404)

      expect(response.body).toHaveProperty('error', 'not_found')
    })
  })

  describe('Custom Presentation Definition', () => {
    it('should create authorization request with custom definition', async () => {
      const customDefinition = {
        id: 'custom-verification',
        name: 'Custom Verification',
        input_descriptors: [
          {
            id: 'custom_credential',
            name: 'Custom Credential',
            purpose: 'Verify custom credential',
            constraints: {
              fields: [
                {
                  path: ['$.credentialSubject.customField'],
                },
              ],
            },
          },
        ],
      }

      const response = await request(app)
        .post('/api/v1/openid4vp/authorization-request')
        .send({
          presentationDefinitionId: 'custom',
          customDefinition,
        })
        .expect(200)

      expect(response.body).toHaveProperty('sessionId')

      const authReq = response.body.authorizationRequest
      expect(authReq.presentation_definition.id).toBe('custom-verification')
    })
  })

  describe('Session Management', () => {
    it('should list all verification sessions', async () => {
      const response = await request(app)
        .get('/api/v1/openid4vp/sessions')
        .expect(200)

      expect(response.body).toHaveProperty('sessions')
      expect(Array.isArray(response.body.sessions)).toBe(true)
    })
  })

  describe('Client Metadata', () => {
    it('should return verifier client metadata', async () => {
      const response = await request(app)
        .get('/api/v1/openid4vp/client-metadata')
        .expect(200)

      expect(response.body).toHaveProperty('client_name')
      expect(response.body).toHaveProperty('vp_formats')
      expect(response.body.vp_formats).toHaveProperty('jwt_vp')
    })
  })
})

/**
 * Create a mock VP token for testing
 */
function createMockVpToken(nonce: string): string {
  const header = {
    alg: 'EdDSA',
    typ: 'JWT',
  }

  const payload = {
    iss: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    aud: 'http://localhost:3002',
    nonce: nonce,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    vp: {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiablePresentation'],
      holder: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      verifiableCredential: [
        {
          '@context': ['https://www.w3.org/2018/credentials/v1'],
          type: ['VerifiableCredential', 'AIAgentIdentityCredential'],
          issuer: 'did:key:z6MkqRYqQiSgvZQdnBytw86Qbs2ZWUkGv22od935YF4s8M7V',
          credentialSubject: {
            id: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
            agent_id: 'test-agent-001',
            agent_type: 'assistant',
            agent_name: 'Test Agent',
            owner_did: 'did:key:z6MkqRYqQiSgvZQdnBytw86Qbs2ZWUkGv22od935YF4s8M7V',
          },
        },
      ],
    },
  }

  // Create mock JWT (not cryptographically signed for testing)
  const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url')
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const mockSignature = 'mock-signature-for-testing'

  return `${base64Header}.${base64Payload}.${mockSignature}`
}
