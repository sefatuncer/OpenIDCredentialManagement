/**
 * AI Agent Service Unit Tests
 * Tests for agent registration, credentials, delegations, and trust management
 * Production-ready: All tests use proper API mocking
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as agentService from '../services/agent.service'

// Mock fetch responses
const mockFetch = global.fetch as ReturnType<typeof vi.fn>

// Helper to mock successful auth + API response
function mockAuthAndResponse(responseData: unknown, options: { ok?: boolean } = {}) {
  const { ok = true } = options

  // Mock auth token response
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ access_token: 'test-token' }),
  })

  // Mock API response
  mockFetch.mockResolvedValueOnce({
    ok,
    status: ok ? 200 : 400,
    json: async () => responseData,
  })
}

// Helper to mock auth failure
function mockAuthFailure() {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status: 401,
    json: async () => ({ error: 'invalid_client' }),
  })
}

describe('Agent Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Clear cached auth token
    agentService.clearAuth()
  })

  // ============================================
  // Scenario 1: Agent Registration
  // ============================================
  describe('Agent Registration', () => {
    it('should register a new agent successfully', async () => {
      mockAuthAndResponse({
        id: 'agent-123',
        did: 'did:key:z6MkTest123',
        name: 'Test Agent',
        type: 'autonomous',
        status: 'active',
        trustLevel: 'medium',
      })

      const result = await agentService.registerAgent({
        name: 'Test Agent',
        type: 'autonomous',
        capabilities: ['text-generation', 'code-execution'],
        owner: {
          did: 'did:key:z6MkOwner123',
          name: 'Test Owner',
          type: 'human',
        },
      })

      expect(result.name).toBe('Test Agent')
      expect(result.type).toBe('autonomous')
      expect(result.did).toContain('did:key:')
    })

    it('should throw error when auth fails', async () => {
      mockAuthFailure()

      await expect(
        agentService.registerAgent({
          name: 'Test Agent',
          type: 'assistant',
          capabilities: ['chat'],
        })
      ).rejects.toThrow()
    })

    it('should throw error when registration fails', async () => {
      mockAuthAndResponse({ error: 'Registration failed' }, { ok: false })

      await expect(
        agentService.registerAgent({
          name: 'Test Agent',
          type: 'autonomous',
          capabilities: [],
        })
      ).rejects.toThrow('Failed to register agent')
    })
  })

  // ============================================
  // Scenario 2: Get Agent Identity
  // ============================================
  describe('Agent Identity', () => {
    it('should get agent identity by DID', async () => {
      mockAuthAndResponse({
        id: 'agent-123',
        did: 'did:key:z6MkTest123',
        name: 'Test Agent',
        type: 'autonomous',
        status: 'active',
        trustLevel: 'high',
      })

      const result = await agentService.getAgentIdentity('did:key:z6MkTest123')

      expect(result?.did).toBe('did:key:z6MkTest123')
      expect(result?.name).toBe('Test Agent')
    })

    it('should return null for non-existent agent', async () => {
      // Mock auth
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'test-token' }),
      })
      // Mock 404 response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Not found' }),
      })

      const result = await agentService.getAgentIdentity('did:key:z6MkNotFound')
      expect(result).toBeNull()
    })
  })

  // ============================================
  // Scenario 3: Wallet Management
  // ============================================
  describe('Wallet Management', () => {
    it('should get wallet by agent DID', async () => {
      mockAuthAndResponse({
        identity: {
          did: 'did:key:z6MkTest123',
          name: 'Test Agent',
          type: 'autonomous',
          status: 'active',
          trustLevel: 'medium',
        },
        credentials: {
          basic: null,
          rich: [],
          delegations: [],
        },
        keys: [{ id: 'key-1', algorithm: 'Ed25519' }],
      })

      const wallet = await agentService.getWallet('did:key:z6MkTest123')

      expect(wallet).not.toBeNull()
      expect(wallet?.identity.did).toBe('did:key:z6MkTest123')
    })

    it('should return null for non-existent wallet', async () => {
      // Mock auth
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'test-token' }),
      })
      // Mock 404
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Not found' }),
      })

      const wallet = await agentService.getWallet('did:key:z6MkNotFound')
      expect(wallet).toBeNull()
    })
  })

  // ============================================
  // Scenario 4: Credentials
  // ============================================
  describe('Credentials', () => {
    it('should request basic credential', async () => {
      mockAuthAndResponse({
        id: 'cred-123',
        type: ['VerifiableCredential', 'BasicAgentCredential'],
        issuer: 'did:key:z6MkIssuer',
        issuanceDate: new Date().toISOString(),
        expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        credentialSubject: {
          id: 'did:key:z6MkTest123',
          isAgent: true,
          securityDomain: 'enterprise-domain',
        },
      })

      const bvc = await agentService.requestBasicCredential('did:key:z6MkTest123', 'enterprise-domain')

      expect(bvc.type).toContain('BasicAgentCredential')
      expect(bvc.credentialSubject.securityDomain).toBe('enterprise-domain')
    })

    it('should request rich credential', async () => {
      mockAuthAndResponse({
        id: 'cred-456',
        type: ['VerifiableCredential', 'RichAgentCredential'],
        issuer: 'did:key:z6MkIssuer',
        issuanceDate: new Date().toISOString(),
        expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        credentialSubject: {
          id: 'did:key:z6MkTest123',
          roles: ['data-analyst', 'report-generator'],
          capabilities: [
            { id: 'cap-0', name: 'read-data', category: 'data', scope: ['*'] },
          ],
          authorizations: [
            { resource: '/data-analyst/*', actions: ['read', 'write'] },
          ],
        },
      })

      const rvc = await agentService.requestRichCredential(
        'did:key:z6MkTest123',
        ['data-analyst', 'report-generator'],
        ['read-data']
      )

      expect(rvc.type).toContain('RichAgentCredential')
      expect(rvc.credentialSubject.roles).toContain('data-analyst')
    })

    it('should get agent credentials', async () => {
      mockAuthAndResponse({
        basic: {
          id: 'bvc-1',
          type: ['VerifiableCredential', 'BasicAgentCredential'],
        },
        rich: [],
        delegations: [],
      })

      const creds = await agentService.getAgentCredentials('did:key:z6MkTest123')

      expect(creds.basic).not.toBeNull()
      expect(creds.rich).toHaveLength(0)
    })
  })

  // ============================================
  // Scenario 5: Delegation Management
  // ============================================
  describe('Delegation Management', () => {
    it('should create delegation grant', async () => {
      mockAuthAndResponse({
        id: 'del-123',
        type: ['VerifiableCredential', 'DelegationGrant'],
        issuer: 'did:key:z6MkDelegator',
        issuanceDate: new Date().toISOString(),
        expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        delegation: {
          delegator: { did: 'did:key:z6MkDelegator', name: 'Delegator' },
          delegatee: { did: 'did:key:z6MkDelegatee123' },
          scope: {
            actions: ['read', 'write'],
            resources: ['/data/*', '/reports/*'],
          },
          revocation: { revocable: true, revokedAt: null },
        },
      })

      const delegation = await agentService.createDelegation({
        delegateeToDid: 'did:key:z6MkDelegatee123',
        scope: {
          actions: ['read', 'write'],
          resources: ['/data/*', '/reports/*'],
        },
        duration: 'P30D',
        revocable: true,
      })

      expect(delegation.delegation.scope.actions).toContain('read')
      expect(delegation.delegation.revocation.revocable).toBe(true)
    })

    it('should get delegations', async () => {
      mockAuthAndResponse({
        given: [{ id: 'del-1' }],
        received: [{ id: 'del-2' }],
      })

      const delegations = await agentService.getDelegations()

      expect(delegations.given).toHaveLength(1)
      expect(delegations.received).toHaveLength(1)
    })

    it('should revoke delegation', async () => {
      mockAuthAndResponse({ success: true })

      await expect(
        agentService.revokeDelegation('del-123', 'No longer needed')
      ).resolves.not.toThrow()
    })

    it('should verify delegation scope', async () => {
      mockAuthAndResponse({
        valid: true,
        inScope: true,
      })

      const result = await agentService.verifyDelegation('del-123', 'read', '/data/test')

      expect(result.valid).toBe(true)
      expect(result.inScope).toBe(true)
    })
  })

  // ============================================
  // Scenario 6: Trust Management
  // ============================================
  describe('Trust Management', () => {
    it('should establish trust with another agent', async () => {
      mockAuthAndResponse({
        success: true,
        trustRelationship: {
          agentDid: 'did:key:z6MkTrusted123',
          trustLevel: 'high',
          mutual: false,
          establishedAt: new Date().toISOString(),
        },
      })

      const result = await agentService.establishTrust({
        targetAgentDid: 'did:key:z6MkTrusted123',
        trustLevel: 'high',
        mutualTrust: false,
      })

      expect(result.success).toBe(true)
      expect(result.trustRelationship.trustLevel).toBe('high')
    })

    it('should get trusted agents', async () => {
      mockAuthAndResponse({
        agents: [
          {
            did: 'did:key:z6MkTrusted1',
            name: 'Trusted Agent 1',
            type: 'service',
            trustLevel: 'high',
            establishedAt: new Date().toISOString(),
          },
        ],
      })

      const agents = await agentService.getTrustedAgents()

      expect(agents).toHaveLength(1)
      expect(agents[0].trustLevel).toBe('high')
    })

    it('should revoke trust', async () => {
      mockAuthAndResponse({ success: true })

      await expect(
        agentService.revokeTrust('did:key:z6MkToRevoke', 'Trust violation')
      ).resolves.not.toThrow()
    })
  })

  // ============================================
  // Scenario 7: Agent Verification
  // ============================================
  describe('Agent Verification', () => {
    it('should verify agent', async () => {
      mockAuthAndResponse({
        valid: true,
        agent: {
          did: 'did:key:z6MkVerified123',
          name: 'Verified Agent',
          trustLevel: 'high',
        },
        checks: {
          signature: true,
          expiration: true,
          revocation: true,
        },
      })

      const result = await agentService.verifyAgent('did:key:z6MkVerified123')

      expect(result.valid).toBe(true)
      expect(result.checks.signature).toBe(true)
    })

    it('should verify agent capability', async () => {
      mockAuthAndResponse({
        allowed: true,
        delegationChain: ['del-123'],
      })

      const result = await agentService.verifyAgentCapability(
        'did:key:z6MkAgent',
        'read',
        '/api/data'
      )

      expect(result.allowed).toBe(true)
    })
  })

  // ============================================
  // Scenario 8: Activity Logging
  // ============================================
  describe('Activity Logging', () => {
    it('should get agent activity', async () => {
      mockAuthAndResponse({
        activities: [
          {
            id: 'act-1',
            action: 'data-access',
            resource: '/users/123',
            timestamp: new Date().toISOString(),
            result: 'success',
          },
        ],
        total: 1,
      })

      const { activities, total } = await agentService.getAgentActivity(10, 0)

      expect(activities).toHaveLength(1)
      expect(total).toBe(1)
    })

    it('should log agent action', async () => {
      mockAuthAndResponse({ success: true })

      await expect(
        agentService.logAgentAction('data-access', '/users/123', { userId: '123' })
      ).resolves.not.toThrow()
    })
  })

  // ============================================
  // Scenario 9: JWT Parsing
  // ============================================
  describe('JWT Parsing', () => {
    it('should parse valid JWT credential', () => {
      const header = btoa(JSON.stringify({ alg: 'ES256', typ: 'JWT' }))
      const payload = btoa(JSON.stringify({
        iss: 'did:key:z6MkIssuer',
        sub: 'did:key:z6MkSubject',
        vc: { type: ['VerifiableCredential'] },
      }))
      const jwt = `${header}.${payload}.signature`

      const parsed = agentService.parseJwtCredential(jwt)

      expect(parsed).not.toBeNull()
      expect(parsed?.header.alg).toBe('ES256')
      expect(parsed?.payload.iss).toBe('did:key:z6MkIssuer')
    })

    it('should return null for invalid JWT', () => {
      const parsed = agentService.parseJwtCredential('invalid-jwt')
      expect(parsed).toBeNull()
    })

    it('should return null for JWT with wrong parts count', () => {
      const parsed = agentService.parseJwtCredential('part1.part2')
      expect(parsed).toBeNull()
    })
  })

  // ============================================
  // Scenario 10: OpenID4VCI Integration
  // ============================================
  describe('OpenID4VCI Integration', () => {
    it('should create credential offer', async () => {
      mockAuthAndResponse({
        credentialOfferUri: 'openid-credential-offer://?credential_offer=...',
        qrCodeData: 'base64-qr-data',
        expiresIn: 300,
      })

      const offer = await agentService.createAgentCredentialOffer(
        'AIAgentIdentityCredential',
        { name: 'Test Agent', type: 'autonomous' }
      )

      expect(offer.credentialOfferUri).toContain('openid-credential-offer')
      expect(offer.expiresIn).toBe(300)
    })

    it('should accept credential offer', async () => {
      mockAuthAndResponse({
        credential: 'eyJ...',
        format: 'jwt_vc_json',
      })

      const result = await agentService.acceptCredentialOffer(
        'openid-credential-offer://?credential_offer_uri=https://issuer.local/offers/123'
      )

      expect(result.format).toBe('jwt_vc_json')
    })
  })
})
