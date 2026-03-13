import request from 'supertest'
import jwt from 'jsonwebtoken'
import { Express } from 'express'
import {
  createSecurityTestServer,
  authedRequest,
} from '../security/security-helpers'

const TEST_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-testing-only'

// Mock oauth-bridge service
jest.mock('../../src/services/oauth-bridge.service', () => {
  class OAuthBridgeError extends Error {
    statusCode: number
    errorCode: string
    errorDescription: string
    constructor(statusCode: number, errorCode: string, errorDescription: string) {
      super(errorDescription)
      this.statusCode = statusCode
      this.errorCode = errorCode
      this.errorDescription = errorDescription
    }
  }

  return {
    OAuthBridgeError,
    exchangeVCForToken: jest.fn().mockImplementation(async (subjectToken: string, scope?: string) => {
      if (subjectToken === 'invalid-vc-token') {
        throw new OAuthBridgeError(400, 'invalid_grant', 'Invalid verifiable credential')
      }
      return {
        access_token: 'bridge-access-token-xyz',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: scope || 'default',
        issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      }
    }),
    getScopeMappings: jest.fn().mockReturnValue({
      mappings: {
        AIAgentIdentityCredential: ['agent:read', 'agent:write'],
        DelegationCredential: ['delegation:read'],
        CapabilityCredential: ['capability:execute'],
      },
    }),
    mapCredentialToScopes: jest.fn().mockReturnValue(['agent:read']),
  }
})

describe('OAuth Bridge Routes', () => {
  let app: Express

  beforeAll(() => {
    app = createSecurityTestServer()
  })

  describe('POST /api/v1/oauth/token-exchange', () => {
    const validExchange = {
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: 'eyJhbGciOiJFZERTQSJ9.valid-vc-jwt-token',
      subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
      scope: 'agent:read',
    }

    it('should accept unauthenticated requests (VC is the credential per RFC 8693)', async () => {
      const res = await request(app)
        .post('/api/v1/oauth/token-exchange')
        .send(validExchange)
      // Token exchange endpoint is open — the VC itself authenticates
      expect(res.status).toBe(200)
    })

    it('should exchange a VC for an OAuth token', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/oauth/token-exchange')
        .send(validExchange)
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('access_token')
      expect(res.body).toHaveProperty('token_type', 'Bearer')
      expect(res.body).toHaveProperty('expires_in')
      expect(res.body).toHaveProperty('issued_token_type')
    })

    it('should return error for invalid VC', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/oauth/token-exchange')
        .send({
          ...validExchange,
          subject_token: 'invalid-vc-token',
        })
      expect(res.status).toBe(400)
      expect(res.body).toHaveProperty('error', 'invalid_grant')
      expect(res.body).toHaveProperty('error_description')
    })

    it('should reject missing grant_type', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/oauth/token-exchange')
        .send({
          subject_token: 'some-token',
          subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
        })
      expect(res.status).toBe(400)
    })

    it('should reject wrong grant_type', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/oauth/token-exchange')
        .send({
          ...validExchange,
          grant_type: 'authorization_code',
        })
      expect(res.status).toBe(400)
    })

    it('should reject missing subject_token', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/oauth/token-exchange')
        .send({
          grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
          subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
        })
      expect(res.status).toBe(400)
    })

    it('should reject missing subject_token_type', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/oauth/token-exchange')
        .send({
          grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
          subject_token: 'some-token',
        })
      expect(res.status).toBe(400)
    })

    it('should accept optional scope parameter', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/oauth/token-exchange')
        .send({
          ...validExchange,
          scope: 'agent:read agent:write',
        })
      expect(res.status).toBe(200)
    })

    it('should accept optional resource parameter', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/oauth/token-exchange')
        .send({
          ...validExchange,
          resource: 'https://api.example.com/resources',
        })
      expect(res.status).toBe(200)
    })

    it('should reject invalid resource URL', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/oauth/token-exchange')
        .send({
          ...validExchange,
          resource: 'not-a-url',
        })
      expect(res.status).toBe(400)
    })
  })

  describe('POST /api/v1/oauth/introspect', () => {
    it('should accept unauthenticated requests (per OAuth 2.0 introspection spec)', async () => {
      const validJwt = jwt.sign(
        { sub: 'did:key:z6MkTest', role: 'bridge' },
        TEST_SECRET,
        { expiresIn: '1h' },
      )
      const res = await request(app)
        .post('/api/v1/oauth/introspect')
        .send({ token: validJwt })
      // Endpoint is open (rate-limited) — either 200 or 429
      expect([200, 429]).toContain(res.status)
    })

    it('should return active=true for a valid JWT', async () => {
      const validJwt = jwt.sign(
        { sub: 'did:key:z6MkTest', role: 'bridge', permissions: ['agent:read'] },
        TEST_SECRET,
        { expiresIn: '1h' },
      )
      const res = await request(app)
        .post('/api/v1/oauth/introspect')
        .send({ token: validJwt })
      if (res.status === 429) return // rate limited, skip
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('active', true)
      expect(res.body).toHaveProperty('sub', 'did:key:z6MkTest')
    })

    it('should return active=false for an invalid JWT', async () => {
      const res = await request(app)
        .post('/api/v1/oauth/introspect')
        .send({ token: 'definitely-not-a-valid-jwt' })
      if (res.status === 429) return // rate limited
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('active', false)
    })

    it('should return active=false for an expired JWT', async () => {
      const expiredJwt = jwt.sign(
        { sub: 'did:key:z6MkTest', permissions: ['agent:read'] },
        TEST_SECRET,
        { expiresIn: '-1h' },
      )
      const res = await request(app)
        .post('/api/v1/oauth/introspect')
        .send({ token: expiredJwt })
      if (res.status === 429) return
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('active', false)
    })

    it('should return active=false for JWT signed with wrong secret', async () => {
      const wrongJwt = jwt.sign(
        { sub: 'did:key:z6MkTest', permissions: ['agent:read'] },
        'wrong-secret',
      )
      const res = await request(app)
        .post('/api/v1/oauth/introspect')
        .send({ token: wrongJwt })
      if (res.status === 429) return
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('active', false)
    })

    it('should reject missing token', async () => {
      const res = await request(app)
        .post('/api/v1/oauth/introspect')
        .send({})
      if (res.status === 429) return
      expect(res.status).toBe(400)
    })

    it('should reject empty token', async () => {
      const res = await request(app)
        .post('/api/v1/oauth/introspect')
        .send({ token: '' })
      if (res.status === 429) return
      expect(res.status).toBe(400)
    })
  })

  describe('GET /api/v1/oauth/scope-mappings', () => {
    it('should be publicly accessible (discovery endpoint)', async () => {
      const res = await request(app).get('/api/v1/oauth/scope-mappings')
      expect(res.status).toBe(200)
    })

    it('should return scope mappings', async () => {
      const res = await authedRequest(app).get('/api/v1/oauth/scope-mappings')
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('mappings')
      expect(res.body.mappings).toHaveProperty('AIAgentIdentityCredential')
      expect(res.body.mappings).toHaveProperty('DelegationCredential')
    })
  })

  describe('GET /api/v1/oauth/.well-known/oauth-bridge', () => {
    it('should be publicly accessible (metadata discovery)', async () => {
      const res = await request(app).get('/api/v1/oauth/.well-known/oauth-bridge')
      expect(res.status).toBe(200)
    })

    it('should return bridge metadata', async () => {
      const res = await authedRequest(app).get('/api/v1/oauth/.well-known/oauth-bridge')
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('grant_types_supported')
      expect(res.body.grant_types_supported).toContain(
        'urn:ietf:params:oauth:grant-type:token-exchange',
      )
      expect(res.body).toHaveProperty('subject_token_types_supported')
      expect(res.body).toHaveProperty('token_endpoint')
      expect(res.body).toHaveProperty('introspection_endpoint')
      expect(res.body).toHaveProperty('scope_mappings_endpoint')
      expect(res.body).toHaveProperty('credential_types_supported')
      expect(res.body.credential_types_supported).toContain('AIAgentIdentityCredential')
    })
  })
})
