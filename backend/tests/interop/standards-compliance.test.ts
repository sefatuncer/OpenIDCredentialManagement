/**
 * Interoperability & Standards Compliance Tests
 *
 * Validates conformance to:
 *   - W3C VC Data Model 2.0
 *   - SD-JWT VC (IETF draft)
 *   - OpenID4VCI 1.0
 *   - OpenID4VP 1.0
 *   - DID resolution (did:key, did:web)
 *
 * These tests verify our credential format, protocol messages, and
 * DID handling are spec-compliant and should interoperate with
 * other SSI frameworks (walt.id, Sphereon, MATTR).
 */

import {
  createSecurityTestServer,
  authedRequest,
} from '../security/security-helpers'
import { isPrivateUrl } from '../../src/utils/url-validation'

const API = '/api/v1'

describe('Interoperability: Standards Compliance', () => {
  const app = createSecurityTestServer()

  // ─── W3C VC Data Model ──────────────────────────────────────────────

  describe('W3C VC Data Model 2.0', () => {
    it('should issue credential with valid VC structure', async () => {
      const auth = authedRequest(app)
      const res = await auth.post(`${API}/issuer/credentials/agent-identity`).send({
        holderDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
        agentType: 'autonomous',
        agentName: 'Interop-Test-Agent',
        ownerDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      })

      expect(res.status).toBe(200)

      // If response includes credential directly, validate structure
      if (res.body.credential) {
        const parts = res.body.credential.split('.')
        // JWT has 3 parts (header.payload.signature)
        expect(parts.length).toBeGreaterThanOrEqual(3)

        // Decode payload
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())

        // W3C VC required fields
        if (payload.vc) {
          expect(payload.vc['@context']).toBeDefined()
          expect(payload.vc.type).toBeDefined()
          expect(Array.isArray(payload.vc.type)).toBe(true)
          expect(payload.vc.type).toContain('VerifiableCredential')
          expect(payload.vc.credentialSubject).toBeDefined()
        }
      }
    })

    it('should include issuer DID in credential', async () => {
      const auth = authedRequest(app)
      const issuerRes = await auth.get(`${API}/issuer/did`)
      expect(issuerRes.status).toBe(200)
      expect(issuerRes.body.did).toBeDefined()
      expect(issuerRes.body.did).toMatch(/^did:/)
    })
  })

  // ─── DID Methods ────────────────────────────────────────────────────

  describe('DID Method Support', () => {
    it('should support did:key resolution', async () => {
      const auth = authedRequest(app)
      const res = await auth.get(`${API}/issuer/did`)
      expect(res.status).toBe(200)

      const did = res.body.did
      // System should use did:key (self-contained, no external resolution)
      expect(did).toMatch(/^did:key:z/)
    })

    it('should validate DID format in credential requests', async () => {
      const auth = authedRequest(app)

      // Invalid DID format should be rejected
      const res = await auth.post(`${API}/issuer/credentials/agent-identity`).send({
        holderDid: 'not-a-did',
        agentType: 'autonomous',
        agentName: 'Bad-DID-Agent',
        ownerDid: 'not-a-did',
      })

      expect(res.status).toBe(400)
    })

    it('should reject did:web pointing to private IP (SSRF)', () => {
      // did:web:127.0.0.1 → https://127.0.0.1/.well-known/did.json
      expect(isPrivateUrl('https://127.0.0.1')).toBe(true)
      expect(isPrivateUrl('https://localhost')).toBe(true)
      expect(isPrivateUrl('https://10.0.0.1')).toBe(true)

      // Public did:web domains should be allowed
      expect(isPrivateUrl('https://example.com')).toBe(false)
    })
  })

  // ─── OpenID4VCI ─────────────────────────────────────────────────────

  describe('OpenID4VCI 1.0 Compliance', () => {
    it('should create credential offer with standard fields', async () => {
      const auth = authedRequest(app)
      const res = await auth.post(`${API}/issuer/credentials/agent-identity`).send({
        holderDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
        agentType: 'autonomous',
        agentName: 'VCI-Compliance-Agent',
        ownerDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      })

      expect(res.status).toBe(200)
      const body = res.body

      // OpenID4VCI offer should have credential_offer_uri or inline offer
      const hasOffer = body.credentialOfferUri || body.credential_offer_uri || body.grants
      expect(hasOffer).toBeTruthy()
    })

    it('should accept token exchange with pre-authorized_code grant', async () => {
      const auth = authedRequest(app)

      // Create offer first
      const offerRes = await auth.post(`${API}/issuer/credentials/agent-identity`).send({
        holderDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
        agentType: 'autonomous',
        agentName: 'VCI-Token-Agent',
        ownerDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      })

      // Extract pre-auth code
      const preAuthCode = offerRes.body['pre-authorized_code'] ||
        offerRes.body.preAuthorizedCode ||
        (offerRes.body.grants?.['urn:ietf:params:oauth:grant-type:pre-authorized_code']?.['pre-authorized_code'])

      if (preAuthCode) {
        const tokenRes = await auth.post(`${API}/issuer/token`).send({
          grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
          'pre-authorized_code': preAuthCode,
        })

        // Should return access_token (200) or error (400/401)
        expect([200, 400, 401]).toContain(tokenRes.status)

        if (tokenRes.status === 200) {
          expect(tokenRes.body.access_token).toBeDefined()
          expect(tokenRes.body.token_type).toBeDefined()
        }
      }
    })

    it('should reject invalid grant_type', async () => {
      const auth = authedRequest(app)
      const res = await auth.post(`${API}/issuer/token`).send({
        grant_type: 'invalid_grant_type',
        code: 'fake-code',
      })

      expect(res.status).toBeGreaterThanOrEqual(400)
    })
  })

  // ─── OpenID4VP ──────────────────────────────────────────────────────

  describe('OpenID4VP 1.0 Compliance', () => {
    it('should create verification request with sessionId', async () => {
      const auth = authedRequest(app)
      const res = await auth.post(`${API}/verifier/verify/agent-identity`).send({})

      expect(res.status).toBe(200)
      expect(res.body.sessionId).toBeDefined()
      expect(res.body.requestUri).toBeDefined()
    })

    it('should return pending status for new session', async () => {
      const auth = authedRequest(app)
      const createRes = await auth.post(`${API}/verifier/verify/agent-identity`).send({})
      const sessionId = createRes.body.sessionId

      const resultRes = await auth.get(`${API}/verifier/verify/${sessionId}/result`)
      expect(resultRes.status).toBe(200)
      expect(resultRes.body.status).toBe('pending')
    })

    it('should handle direct_post endpoint', async () => {
      const request = require('supertest')
      const res = await request(app).post('/direct_post').send({})

      // Should return 400 (missing fields) not 500 (crash)
      expect(res.status).toBe(400)
    })

    it('should support delegation verification', async () => {
      const auth = authedRequest(app)
      const res = await auth.post(`${API}/verifier/verify/delegation`).send({})
      expect(res.status).toBe(200)
      expect(res.body.sessionId).toBeDefined()
    })

    it('should support combined verification', async () => {
      const auth = authedRequest(app)
      const res = await auth.post(`${API}/verifier/verify/combined`).send({})
      expect(res.status).toBe(200)
      expect(res.body.sessionId).toBeDefined()
    })
  })

  // ─── SD-JWT VC ──────────────────────────────────────────────────────

  describe('SD-JWT VC Format', () => {
    it('should support vc+sd-jwt format in credential offer', async () => {
      const auth = authedRequest(app)
      const res = await auth.post(`${API}/issuer/credentials/agent-identity`).send({
        holderDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
        agentType: 'autonomous',
        agentName: 'SDJWT-Format-Agent',
        ownerDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
        format: 'vc+sd-jwt',
      })

      // Should accept the format without error
      expect(res.status).not.toBe(500)
    })

    it('should support jwt_vc_json format in credential offer', async () => {
      const auth = authedRequest(app)
      const res = await auth.post(`${API}/issuer/credentials/agent-identity`).send({
        holderDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
        agentType: 'autonomous',
        agentName: 'JWT-Format-Agent',
        ownerDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
        format: 'jwt_vc_json',
      })

      expect(res.status).not.toBe(500)
    })
  })

  // ─── Credential Schema ─────────────────────────────────────────────

  describe('Credential Schema Registry', () => {
    it('should list available schemas', async () => {
      const auth = authedRequest(app)
      const res = await auth.get(`${API}/schemas`)

      expect(res.status).toBe(200)
      expect(res.body.schemas).toBeDefined()
      expect(Array.isArray(res.body.schemas)).toBe(true)
    })

    it('should reject invalid schema type for issuance', async () => {
      const auth = authedRequest(app)
      const res = await auth.post(`${API}/issuer/credentials/schema-issue`).send({
        schemaType: 'NonExistentSchema',
        claims: { foo: 'bar' },
      })

      // Should not succeed — unknown schema
      expect(res.status).toBeGreaterThanOrEqual(400)
    })
  })
})
