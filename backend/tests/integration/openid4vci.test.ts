import request from 'supertest'
import { Express } from 'express'
import { createServer } from '../../src/api/server'
import { v4 as uuidv4 } from 'uuid'

// Mock Credo service — Credo agent not available in test environment
vi.mock('../../src/services/credo.service', () => ({
  isUsingCredo: vi.fn().mockReturnValue(true),
  isServiceReady: vi.fn().mockReturnValue(true),
  getCredoIssuerMetadata: vi.fn().mockResolvedValue(null),
  createCredentialOffer: vi.fn().mockImplementation(async (types: string[]) => {
    const offerId = uuidv4()
    const preAuthorizedCode = uuidv4()
    return {
      credentialOffer: {
        credential_issuer: 'http://localhost:3000',
        credential_configuration_ids: types,
        credentials: types,
        grants: {
          'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
            'pre-authorized_code': preAuthorizedCode,
          },
        },
      },
      credentialOfferUri: `openid-credential-offer://?credential_offer=mock`,
      issuanceSession: { id: offerId },
    }
  }),
  getVerifierDid: vi.fn().mockResolvedValue('did:key:mock-verifier'),
  getIssuerDid: vi.fn().mockResolvedValue('did:key:mock-issuer'),
  getHolderDid: vi.fn().mockResolvedValue('did:key:mock-holder'),
  healthCheck: vi.fn().mockResolvedValue({ status: 'healthy', mode: 'credo', details: {} }),
  initializeCredoService: vi.fn().mockResolvedValue(true),
  shutdownCredoService: vi.fn().mockResolvedValue(undefined),
  getAgent: vi.fn().mockReturnValue(null),
  createVerificationRequest: vi.fn().mockResolvedValue(null),
  getVerificationSession: vi.fn().mockResolvedValue(null),
  verifyPresentation: vi.fn().mockResolvedValue(null),
  acceptCredentialOffer: vi.fn().mockResolvedValue(null),
  presentCredential: vi.fn().mockResolvedValue(null),
}))

describe('OpenID4VCI Integration Tests', () => {
  let app: Express

  beforeAll(() => {
    app = createServer()
  })

  describe('Well-known Endpoints', () => {
    it('should return issuer metadata', async () => {
      const response = await request(app)
        .get('/.well-known/openid-credential-issuer')
        .expect(200)

      expect(response.body).toHaveProperty('credential_issuer')
      expect(response.body).toHaveProperty('credential_endpoint')
      expect(response.body).toHaveProperty('credential_configurations_supported')

      // Check supported credential types
      const configs = response.body.credential_configurations_supported
      expect(configs).toHaveProperty('AIAgentIdentityCredential')
      expect(configs).toHaveProperty('DelegationCredential')
      expect(configs).toHaveProperty('CapabilityCredential')
    })

    it('should return authorization server metadata', async () => {
      const response = await request(app)
        .get('/.well-known/oauth-authorization-server')
        .expect(200)

      expect(response.body).toHaveProperty('issuer')
      expect(response.body).toHaveProperty('token_endpoint')
      expect(response.body.grant_types_supported).toContain(
        'urn:ietf:params:oauth:grant-type:pre-authorized_code'
      )
    })
  })

  describe('Credential Offer Flow', () => {
    it('should create a credential offer via Credo', async () => {
      const response = await request(app)
        .post('/credential-offer')
        .send({
          credentialTypes: ['AIAgentIdentityCredential'],
          expiresInSeconds: 300,
        })
        .expect(200)

      expect(response.body).toHaveProperty('offerId')
      expect(response.body).toHaveProperty('credentialOffer')
      expect(response.body).toHaveProperty('credentialOfferUri')

      const offer = response.body.credentialOffer
      const preAuthorizedCode =
        offer.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code'][
          'pre-authorized_code'
        ]
      expect(preAuthorizedCode).toBeDefined()
    })

    // Token exchange and credential issuance are handled by Credo's
    // own /oid4vci/* endpoints, not the Jose-based /token and /credential.
    // These tests require a running Credo agent and are covered by
    // the interop test suite.

    it('should reject credential request without token', async () => {
      const response = await request(app)
        .post('/credential')
        .send({
          format: 'jwt_vc_json',
        })
        .expect(401)

      expect(response.body).toHaveProperty('error', 'invalid_token')
    })
  })

  describe('Error Handling', () => {
    it('should reject invalid grant type', async () => {
      const response = await request(app)
        .post('/token')
        .send({
          grant_type: 'invalid_grant_type',
          'pre-authorized_code': 'some-code',
        })
        .expect(400)

      expect(response.body).toHaveProperty('error', 'unsupported_grant_type')
    })

    it('should reject missing pre-authorized code', async () => {
      const response = await request(app)
        .post('/token')
        .send({
          grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
        })
        .expect(400)

      expect(response.body).toHaveProperty('error', 'invalid_request')
    })

    it('should return 404 for non-existent offer', async () => {
      const response = await request(app)
        .get('/credential-offer/non-existent-id')
        .expect(404)

      expect(response.body).toHaveProperty('error', 'not_found')
    })
  })

  describe('Batch Credential Issuance', () => {
    it('should create multiple credential offers', async () => {
      const response = await request(app)
        .post('/credential-offer')
        .send({
          credentialTypes: [
            'AIAgentIdentityCredential',
            'DelegationCredential',
          ],
        })
        .expect(200)

      expect(response.body).toHaveProperty('credentialOffer')
      expect(response.body).toHaveProperty('credentialOfferUri')
    })

    it('should list all credential offers', async () => {
      const response = await request(app)
        .get('/credential-offers')
        .expect(200)

      expect(response.body).toHaveProperty('offers')
      expect(Array.isArray(response.body.offers)).toBe(true)
    })
  })
})
