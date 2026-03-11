import request from 'supertest'
import { Express } from 'express'
import { createServer } from '../../src/api/server'

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
    let offerId: string
    let preAuthorizedCode: string
    let accessToken: string

    it('should create a credential offer', async () => {
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

      offerId = response.body.offerId

      // Extract pre-authorized code from offer
      const offer = response.body.credentialOffer
      preAuthorizedCode =
        offer.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code'][
          'pre-authorized_code'
        ]
      expect(preAuthorizedCode).toBeDefined()
    })

    it('should retrieve credential offer by ID', async () => {
      const response = await request(app)
        .get(`/credential-offer/${offerId}`)
        .expect(200)

      expect(response.body).toHaveProperty('offer')
      expect(response.body.expired).toBe(false)
      expect(response.body.claimed).toBe(false)
    })

    it('should exchange pre-authorized code for access token', async () => {
      const response = await request(app)
        .post('/token')
        .send({
          grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
          'pre-authorized_code': preAuthorizedCode,
        })
        .expect(200)

      expect(response.body).toHaveProperty('access_token')
      expect(response.body).toHaveProperty('token_type', 'Bearer')
      expect(response.body).toHaveProperty('expires_in')
      expect(response.body).toHaveProperty('c_nonce')

      accessToken = response.body.access_token
    })

    it('should reject reused pre-authorized code', async () => {
      const response = await request(app)
        .post('/token')
        .send({
          grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
          'pre-authorized_code': preAuthorizedCode,
        })
        .expect(400)

      expect(response.body).toHaveProperty('error', 'invalid_grant')
    })

    it('should issue credential with access token', async () => {
      const response = await request(app)
        .post('/credential')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          format: 'jwt_vc_json',
          credential_definition: {
            type: ['VerifiableCredential', 'AIAgentIdentityCredential'],
          },
        })
        .expect(200)

      expect(response.body).toHaveProperty('format', 'jwt_vc_json')
      // Credential or acceptance_token should be present
      expect(
        response.body.credential || response.body.acceptance_token
      ).toBeDefined()
    })

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

      const offer = response.body.credentialOffer
      expect(offer.credential_configuration_ids).toHaveLength(2)
      // backward compat field should also be present
      expect(offer.credentials).toHaveLength(2)
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
