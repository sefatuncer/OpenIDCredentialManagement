/**
 * OAuth Bridge Service Tests — RFC 8693 Token Exchange
 */

import * as jose from 'jose'

// Mock dependencies before imports
vi.mock('../../src/services/didResolver.service', () => ({
  resolvePublicKeyFromDid: vi.fn(),
}))

vi.mock('../../src/services/revocation.service', () => ({
  isCredentialRevoked: vi.fn(),
}))

vi.mock('../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import {
  exchangeVCForToken,
  mapCredentialToScopes,
  getScopeMappings,
  OAuthBridgeError,
} from '../../src/services/oauth-bridge.service'
import { resolvePublicKeyFromDid } from '../../src/services/didResolver.service'
import { isCredentialRevoked } from '../../src/services/revocation.service'

const mockResolvePublicKey = resolvePublicKeyFromDid as anyedFunction<typeof resolvePublicKeyFromDid>
const mockIsRevoked = isCredentialRevoked as anyedFunction<typeof isCredentialRevoked>

// --- Test Helpers ---

async function createTestKeyPair() {
  const { publicKey, privateKey } = await jose.generateKeyPair('EdDSA')
  return { publicKey, privateKey }
}

async function createTestVC(
  privateKey: jose.KeyLike,
  options: {
    iss?: string
    sub?: string
    exp?: number
    jti?: string
    credentialType?: string
    credentialSubject?: Record<string, unknown>
  } = {}
): Promise<string> {
  const {
    iss = 'did:key:z6MkTestIssuer',
    sub = 'did:key:z6MkTestHolder',
    exp = Math.floor(Date.now() / 1000) + 3600,
    jti = 'vc-test-001',
    credentialType = 'AIAgentIdentityCredential',
    credentialSubject = {
      capabilities: ['read', 'write'],
      trust_level: 'verified',
    },
  } = options

  const jwt = await new jose.SignJWT({
    vc: {
      type: ['VerifiableCredential', credentialType],
      credentialSubject,
    },
  })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setIssuer(iss)
    .setSubject(sub)
    .setJti(jti)
    .setExpirationTime(exp)
    .setIssuedAt()
    .sign(privateKey)

  return jwt
}

describe('OAuthBridgeService', () => {
  let testKeys: { publicKey: jose.KeyLike; privateKey: jose.KeyLike }

  beforeAll(async () => {
    testKeys = await createTestKeyPair()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockIsRevoked.mockResolvedValue(false)
  })

  describe('mapCredentialToScopes', () => {
    it('should map AIAgentIdentityCredential capabilities to scopes', () => {
      const scopes = mapCredentialToScopes('AIAgentIdentityCredential', {
        capabilities: ['read', 'write', 'execute'],
      })

      expect(scopes).toContain('read')
      expect(scopes).toContain('write')
      expect(scopes).toContain('execute')
      expect(scopes).toContain('credential:AIAgentIdentityCredential')
    })

    it('should map DelegationCredential scope field', () => {
      const scopes = mapCredentialToScopes('DelegationCredential', {
        scope: ['api:read', 'api:write'],
      })

      expect(scopes).toContain('api:read')
      expect(scopes).toContain('api:write')
      expect(scopes).toContain('credential:DelegationCredential')
    })

    it('should map CapabilityCredential actions field', () => {
      const scopes = mapCredentialToScopes('CapabilityCredential', {
        actions: ['read', 'admin'],
      })

      expect(scopes).toContain('read')
      expect(scopes).toContain('admin')
      expect(scopes).toContain('credential:CapabilityCredential')
    })

    it('should add trust level scopes when trust_level is present', () => {
      const scopes = mapCredentialToScopes('AIAgentIdentityCredential', {
        capabilities: ['read'],
        trust_level: 'verified',
      })

      expect(scopes).toContain('trust:basic')
      expect(scopes).toContain('trust:verified')
    })

    it('should add certified trust level scopes', () => {
      const scopes = mapCredentialToScopes('AIAgentIdentityCredential', {
        capabilities: [],
        trust_level: 'certified',
      })

      expect(scopes).toContain('trust:basic')
      expect(scopes).toContain('trust:verified')
      expect(scopes).toContain('trust:certified')
    })

    it('should deduplicate scopes', () => {
      const scopes = mapCredentialToScopes('AIAgentIdentityCredential', {
        capabilities: ['read', 'read', 'write'],
      })

      const readCount = scopes.filter((s) => s === 'read').length
      expect(readCount).toBe(1)
    })

    it('should always include credential type scope', () => {
      const scopes = mapCredentialToScopes('UnknownType', {})

      expect(scopes).toContain('credential:UnknownType')
      expect(scopes).toHaveLength(1)
    })

    it('should handle missing scope field gracefully', () => {
      const scopes = mapCredentialToScopes('AIAgentIdentityCredential', {
        // no capabilities field
      })

      expect(scopes).toContain('credential:AIAgentIdentityCredential')
    })
  })

  describe('exchangeVCForToken', () => {
    it('should exchange a valid VC for an access token', async () => {
      mockResolvePublicKey.mockResolvedValue(testKeys.publicKey as any)

      const vcJwt = await createTestVC(testKeys.privateKey)

      const result = await exchangeVCForToken(vcJwt)

      expect(result.access_token).toBeDefined()
      expect(result.access_token.length).toBeGreaterThan(0)
      expect(result.token_type).toBe('Bearer')
      expect(result.expires_in).toBe(900)
      expect(result.issued_token_type).toBe('urn:ietf:params:oauth:token-type:access_token')
      expect(result.scope).toContain('read')
      expect(result.scope).toContain('write')
    })

    it('should include correct scope string in response', async () => {
      mockResolvePublicKey.mockResolvedValue(testKeys.publicKey as any)

      const vcJwt = await createTestVC(testKeys.privateKey, {
        credentialSubject: {
          capabilities: ['api:read', 'api:write'],
          trust_level: 'basic',
        },
      })

      const result = await exchangeVCForToken(vcJwt)

      expect(result.scope).toContain('api:read')
      expect(result.scope).toContain('api:write')
      expect(result.scope).toContain('trust:basic')
      expect(result.scope).toContain('credential:AIAgentIdentityCredential')
    })

    it('should filter scopes by requested scope (intersection)', async () => {
      mockResolvePublicKey.mockResolvedValue(testKeys.publicKey as any)

      const vcJwt = await createTestVC(testKeys.privateKey, {
        credentialSubject: { capabilities: ['read', 'write', 'execute'] },
      })

      const result = await exchangeVCForToken(vcJwt, 'read execute')

      const scopes = result.scope.split(' ')
      expect(scopes).toContain('read')
      expect(scopes).toContain('execute')
      expect(scopes).not.toContain('write')
    })

    it('should throw OAuthBridgeError when no matching scopes', async () => {
      mockResolvePublicKey.mockResolvedValue(testKeys.publicKey as any)

      const vcJwt = await createTestVC(testKeys.privateKey, {
        credentialSubject: { capabilities: ['read', 'write'] },
      })

      await expect(exchangeVCForToken(vcJwt, 'admin super-admin')).rejects.toThrow(
        OAuthBridgeError
      )

      try {
        await exchangeVCForToken(vcJwt, 'admin super-admin')
      } catch (err) {
        expect(err).toBeInstanceOf(OAuthBridgeError)
        expect((err as OAuthBridgeError).errorCode).toBe('invalid_scope')
      }
    })

    it('should reject invalid JWT format', async () => {
      await expect(exchangeVCForToken('not-a-jwt')).rejects.toThrow('Invalid JWT format')
    })

    it('should reject JWT missing issuer claim', async () => {
      // Manually craft a JWT without iss
      const payload = Buffer.from(JSON.stringify({ vc: { type: ['VerifiableCredential'] } })).toString('base64url')
      const header = Buffer.from(JSON.stringify({ alg: 'EdDSA' })).toString('base64url')
      const fakeJwt = `${header}.${payload}.fake-signature`

      await expect(exchangeVCForToken(fakeJwt)).rejects.toThrow('Missing issuer')
    })

    it('should reject when public key cannot be resolved', async () => {
      mockResolvePublicKey.mockResolvedValue(null as any)

      const vcJwt = await createTestVC(testKeys.privateKey)

      await expect(exchangeVCForToken(vcJwt)).rejects.toThrow('Cannot resolve public key')
    })

    it('should reject expired credentials', async () => {
      mockResolvePublicKey.mockResolvedValue(testKeys.publicKey as any)

      const expiredVC = await createTestVC(testKeys.privateKey, {
        exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      })

      // jose.jwtVerify itself will reject the expired token
      await expect(exchangeVCForToken(expiredVC)).rejects.toThrow()
    })

    it('should reject revoked credentials', async () => {
      mockResolvePublicKey.mockResolvedValue(testKeys.publicKey as any)
      mockIsRevoked.mockResolvedValue(true)

      const vcJwt = await createTestVC(testKeys.privateKey)

      await expect(exchangeVCForToken(vcJwt)).rejects.toThrow('Credential has been revoked')
    })

    it('should handle SD-JWT format (strip disclosures for verification)', async () => {
      mockResolvePublicKey.mockResolvedValue(testKeys.publicKey as any)

      const vcJwt = await createTestVC(testKeys.privateKey)
      const sdJwt = `${vcJwt}~disclosure1~disclosure2~`

      const result = await exchangeVCForToken(sdJwt)

      expect(result.access_token).toBeDefined()
      expect(result.token_type).toBe('Bearer')
    })

    it('should use holder DID (sub) as bridge token subject', async () => {
      mockResolvePublicKey.mockResolvedValue(testKeys.publicKey as any)

      const holderDid = 'did:key:z6MkHolderTest'
      const vcJwt = await createTestVC(testKeys.privateKey, { sub: holderDid })

      const result = await exchangeVCForToken(vcJwt)

      // Decode the bridge token to verify sub
      const tokenPayload = JSON.parse(
        Buffer.from(result.access_token.split('.')[1], 'base64url').toString()
      )
      expect(tokenPayload.sub).toBe(holderDid)
    })
  })

  describe('getScopeMappings', () => {
    it('should return all scope mappings', () => {
      const mappings = getScopeMappings()

      expect(mappings.mappings).toBeDefined()
      expect(mappings.trust_levels).toBeDefined()

      expect(mappings.mappings.AIAgentIdentityCredential.field).toBe('capabilities')
      expect(mappings.mappings.DelegationCredential.field).toBe('scope')
      expect(mappings.mappings.CapabilityCredential.field).toBe('actions')
    })

    it('should include trust level definitions', () => {
      const mappings = getScopeMappings()

      expect(mappings.trust_levels.basic).toEqual(['trust:basic'])
      expect(mappings.trust_levels.verified).toEqual(['trust:basic', 'trust:verified'])
      expect(mappings.trust_levels.certified).toEqual(['trust:basic', 'trust:verified', 'trust:certified'])
    })
  })

  describe('OAuthBridgeError', () => {
    it('should construct with error code and description', () => {
      const err = new OAuthBridgeError('invalid_grant', 'Token expired', 401)

      expect(err).toBeInstanceOf(Error)
      expect(err.errorCode).toBe('invalid_grant')
      expect(err.errorDescription).toBe('Token expired')
      expect(err.statusCode).toBe(401)
      expect(err.message).toBe('Token expired')
      expect(err.name).toBe('OAuthBridgeError')
    })

    it('should default to status 400', () => {
      const err = new OAuthBridgeError('invalid_request', 'Bad input')

      expect(err.statusCode).toBe(400)
    })
  })
})
