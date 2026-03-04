/**
 * AI Agent Service Unit Tests
 * Tests for agent registration, credentials, delegations, and trust management
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as agentService from '../services/agent.service'

// Mock fetch responses
const mockFetch = global.fetch as ReturnType<typeof vi.fn>

describe('Agent Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ============================================
  // Scenario 1: Agent Registration
  // ============================================
  describe('Agent Registration', () => {
    it('should register a new agent successfully', async () => {
      // Mock auth token response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'test-token' }),
      })

      // Mock register response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'agent-123',
          did: 'did:key:z6MkTest123',
          name: 'Test Agent',
          type: 'autonomous',
          status: 'active',
          trustLevel: 'medium',
        }),
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

    it('should switch to demo mode when backend is unavailable', async () => {
      // Mock failed auth
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await agentService.registerAgent({
        name: 'Demo Agent',
        type: 'assistant',
        capabilities: ['chat'],
      })

      // Should return demo data
      expect(result.name).toBe('Demo Agent')
      expect(result.did).toContain('did:key:z6Mk')
      expect(result.status).toBe('active')
    })

    it('should validate agent types', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const validTypes = ['autonomous', 'semi-autonomous', 'assistant', 'service', 'orchestrator']

      for (const type of validTypes) {
        const result = await agentService.registerAgent({
          name: `${type} Agent`,
          type: type as any,
          capabilities: [],
        })
        expect(result.type).toBe(type)
      }
    })
  })

  // ============================================
  // Scenario 2: Basic Credential (bVC) Request
  // ============================================
  describe('Basic Agent Credential (bVC)', () => {
    beforeEach(async () => {
      // Ensure demo mode is active
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      await agentService.registerAgent({
        name: 'Test Agent',
        type: 'autonomous',
        capabilities: [],
      })
    })

    it('should request basic credential successfully', async () => {
      const bvc = await agentService.requestBasicCredential('did:key:z6MkTest123', 'enterprise-domain')

      expect(bvc.type).toContain('BasicAgentCredential')
      expect(bvc.credentialSubject.isAgent).toBe(true)
      expect(bvc.credentialSubject.securityDomain).toBe('enterprise-domain')
      expect(bvc.issuanceDate).toBeDefined()
      expect(bvc.expirationDate).toBeDefined()
    })

    it('should set default security domain if not provided', async () => {
      const bvc = await agentService.requestBasicCredential('did:key:z6MkTest123')

      expect(bvc.credentialSubject.securityDomain).toBe('default-domain')
    })

    it('should set expiration to 1 year from now', async () => {
      const bvc = await agentService.requestBasicCredential('did:key:z6MkTest123')

      const issuance = new Date(bvc.issuanceDate)
      const expiration = new Date(bvc.expirationDate)

      const diffInDays = (expiration.getTime() - issuance.getTime()) / (1000 * 60 * 60 * 24)
      expect(diffInDays).toBeGreaterThanOrEqual(364)
      expect(diffInDays).toBeLessThanOrEqual(366)
    })
  })

  // ============================================
  // Scenario 3: Rich Credential (rVC) Request
  // ============================================
  describe('Rich Agent Credential (rVC)', () => {
    beforeEach(async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      await agentService.registerAgent({
        name: 'Rich Agent',
        type: 'service',
        capabilities: [],
      })
    })

    it('should request rich credential with roles and capabilities', async () => {
      const roles = ['data-analyst', 'report-generator']
      const capabilities = ['read-data', 'generate-reports', 'send-emails']

      const rvc = await agentService.requestRichCredential('did:key:z6MkTest123', roles, capabilities)

      expect(rvc.type).toContain('RichAgentCredential')
      expect(rvc.credentialSubject.roles).toEqual(roles)
      expect(rvc.credentialSubject.capabilities).toHaveLength(3)
      expect(rvc.credentialSubject.authorizations).toHaveLength(2)
    })

    it('should generate capabilities with correct structure', async () => {
      const rvc = await agentService.requestRichCredential(
        'did:key:z6MkTest123',
        ['admin'],
        ['manage-users', 'view-logs']
      )

      const cap = rvc.credentialSubject.capabilities[0]
      expect(cap.id).toBe('cap-0')
      expect(cap.name).toBe('manage-users')
      expect(cap.category).toBe('data')
      expect(cap.scope).toContain('*')
    })

    it('should generate authorizations for each role', async () => {
      const rvc = await agentService.requestRichCredential(
        'did:key:z6MkTest123',
        ['editor', 'viewer'],
        ['edit-content']
      )

      expect(rvc.credentialSubject.authorizations).toHaveLength(2)
      expect(rvc.credentialSubject.authorizations[0].resource).toBe('/editor/*')
      expect(rvc.credentialSubject.authorizations[1].resource).toBe('/viewer/*')
    })
  })

  // ============================================
  // Scenario 4: Delegation Management
  // ============================================
  describe('Delegation Management', () => {
    beforeEach(async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      await agentService.registerAgent({
        name: 'Delegator Agent',
        type: 'orchestrator',
        capabilities: [],
      })
    })

    it('should create delegation grant', async () => {
      const delegation = await agentService.createDelegation({
        delegateeToDid: 'did:key:z6MkDelegatee123',
        scope: {
          actions: ['read', 'write'],
          resources: ['/data/*', '/reports/*'],
        },
        duration: 'P30D',
        revocable: true,
      })

      expect(delegation.type).toContain('DelegationGrant')
      expect(delegation.delegation.scope.actions).toContain('read')
      expect(delegation.delegation.scope.actions).toContain('write')
      expect(delegation.delegation.revocation.revocable).toBe(true)
    })

    it('should calculate expiration from duration', async () => {
      const delegation = await agentService.createDelegation({
        delegateeToDid: 'did:key:z6MkDelegatee123',
        scope: {
          actions: ['read'],
          resources: ['*'],
        },
        duration: 'P7D', // 7 days
        revocable: true,
      })

      const issuance = new Date(delegation.issuanceDate)
      const expiration = new Date(delegation.expirationDate)

      const diffInDays = (expiration.getTime() - issuance.getTime()) / (1000 * 60 * 60 * 24)
      expect(diffInDays).toBeGreaterThanOrEqual(6)
      expect(diffInDays).toBeLessThanOrEqual(8)
    })

    it('should revoke delegation', async () => {
      const delegation = await agentService.createDelegation({
        delegateeToDid: 'did:key:z6MkDelegatee123',
        scope: {
          actions: ['*'],
          resources: ['*'],
        },
        duration: 'P30D',
        revocable: true,
      })

      await agentService.revokeDelegation(delegation.id, 'No longer needed')

      const delegations = await agentService.getDelegations()
      const revoked = delegations.given.find(d => d.id === delegation.id)
      expect(revoked?.delegation.revocation.revokedAt).toBeDefined()
    })

    it('should verify delegation scope', async () => {
      const delegation = await agentService.createDelegation({
        delegateeToDid: 'did:key:z6MkDelegatee123',
        scope: {
          actions: ['read', 'write'],
          resources: ['/data/*'],
        },
        duration: 'P30D',
        revocable: true,
      })

      const result = await agentService.verifyDelegation(delegation.id, 'read', '/data/test')
      expect(result.valid).toBe(true)
      expect(result.inScope).toBe(true)
    })

    it('should reject out-of-scope actions', async () => {
      const delegation = await agentService.createDelegation({
        delegateeToDid: 'did:key:z6MkDelegatee123',
        scope: {
          actions: ['read'],
          resources: ['/data/*'],
        },
        duration: 'P30D',
        revocable: true,
      })

      const result = await agentService.verifyDelegation(delegation.id, 'delete', '/data/test')
      expect(result.inScope).toBe(false)
    })
  })

  // ============================================
  // Scenario 5: Trust Management
  // ============================================
  describe('Trust Management', () => {
    beforeEach(async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      await agentService.registerAgent({
        name: 'Trust Agent',
        type: 'autonomous',
        capabilities: [],
      })
    })

    it('should establish trust with another agent', async () => {
      const result = await agentService.establishTrust({
        targetAgentDid: 'did:key:z6MkTrusted123',
        trustLevel: 'high',
        mutualTrust: false,
      })

      expect(result.success).toBe(true)
      expect(result.trustRelationship.trustLevel).toBe('high')
      expect(result.trustRelationship.mutual).toBe(false)
    })

    it('should add trusted agent to list', async () => {
      await agentService.establishTrust({
        targetAgentDid: 'did:key:z6MkTrusted456',
        trustLevel: 'medium',
        mutualTrust: true,
      })

      const trustedAgents = await agentService.getTrustedAgents()
      expect(trustedAgents).toHaveLength(1)
      expect(trustedAgents[0].trustLevel).toBe('medium')
    })

    it('should revoke trust', async () => {
      await agentService.establishTrust({
        targetAgentDid: 'did:key:z6MkToRevoke',
        trustLevel: 'low',
        mutualTrust: false,
      })

      await agentService.revokeTrust('did:key:z6MkToRevoke', 'Trust violation')

      const trustedAgents = await agentService.getTrustedAgents()
      expect(trustedAgents.find(a => a.did === 'did:key:z6MkToRevoke')).toBeUndefined()
    })

    it('should support all trust levels', async () => {
      const trustLevels: Array<'low' | 'medium' | 'high' | 'verified'> = ['low', 'medium', 'high', 'verified']

      for (const level of trustLevels) {
        const result = await agentService.establishTrust({
          targetAgentDid: `did:key:z6Mk${level}Agent`,
          trustLevel: level,
          mutualTrust: false,
        })
        expect(result.trustRelationship.trustLevel).toBe(level)
      }
    })
  })

  // ============================================
  // Scenario 6: Agent Verification
  // ============================================
  describe('Agent Verification', () => {
    beforeEach(async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      await agentService.registerAgent({
        name: 'Verifier Agent',
        type: 'service',
        capabilities: [],
      })
    })

    it('should verify trusted agent', async () => {
      await agentService.establishTrust({
        targetAgentDid: 'did:key:z6MkVerified123',
        trustLevel: 'high',
        mutualTrust: false,
      })

      const result = await agentService.verifyAgent('did:key:z6MkVerified123')

      expect(result.valid).toBe(true)
      expect(result.agent.trustLevel).toBe('high')
      expect(result.checks.signature).toBe(true)
      expect(result.checks.expiration).toBe(true)
    })

    it('should return warnings for unknown agents', async () => {
      const result = await agentService.verifyAgent('did:key:z6MkUnknown999')

      expect(result.valid).toBe(true)
      expect(result.agent.trustLevel).toBe('low')
      expect(result.warnings).toContain('Agent not in trusted list')
    })

    it('should verify agent capability with delegation', async () => {
      const delegation = await agentService.createDelegation({
        delegateeToDid: 'did:key:z6MkCapable123',
        scope: {
          actions: ['read', 'execute'],
          resources: ['/api/*'],
        },
        duration: 'P30D',
        revocable: true,
      })

      const result = await agentService.verifyAgentCapability(
        'did:key:z6MkCapable123',
        'read',
        '/api/data'
      )

      expect(result.allowed).toBe(true)
      expect(result.delegationChain).toContain(delegation.id)
    })

    it('should reject capability without delegation', async () => {
      const result = await agentService.verifyAgentCapability(
        'did:key:z6MkNoDelegation',
        'write',
        '/api/data'
      )

      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('No delegation')
    })
  })

  // ============================================
  // Scenario 7: Activity Logging
  // ============================================
  describe('Activity Logging', () => {
    beforeEach(async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      await agentService.registerAgent({
        name: 'Activity Agent',
        type: 'assistant',
        capabilities: [],
      })
    })

    it('should log agent actions', async () => {
      await agentService.logAgentAction('data-access', '/users/123', { userId: '123' })

      const { activities } = await agentService.getAgentActivity(10, 0)

      const dataAccessLog = activities.find(a => a.action === 'data-access')
      expect(dataAccessLog).toBeDefined()
      expect(dataAccessLog?.resource).toBe('/users/123')
    })

    it('should track registration activity', async () => {
      const { activities } = await agentService.getAgentActivity(10, 0)

      const registrationLog = activities.find(a => a.action === 'Agent registered')
      expect(registrationLog).toBeDefined()
      expect(registrationLog?.result).toBe('success')
    })

    it('should support pagination', async () => {
      // Add multiple activities
      for (let i = 0; i < 5; i++) {
        await agentService.logAgentAction(`action-${i}`, `/resource-${i}`)
      }

      const { activities, total } = await agentService.getAgentActivity(2, 0)

      expect(activities.length).toBe(2)
      expect(total).toBeGreaterThan(2)
    })
  })

  // ============================================
  // Scenario 8: JWT Parsing
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
  // Scenario 9: Wallet Management
  // ============================================
  describe('Wallet Management', () => {
    it('should return wallet after registration', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await agentService.registerAgent({
        name: 'Wallet Agent',
        type: 'autonomous',
        capabilities: ['data-processing'],
      })

      const wallet = await agentService.getWallet('did:key:z6MkTest123')

      expect(wallet).not.toBeNull()
      expect(wallet?.identity.name).toBe('Wallet Agent')
      expect(wallet?.keys).toHaveLength(1)
      expect(wallet?.keys[0].algorithm).toBe('Ed25519')
    })

    it('should update credentials in wallet', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const agent = await agentService.registerAgent({
        name: 'Cred Agent',
        type: 'service',
        capabilities: [],
      })

      await agentService.requestBasicCredential(agent.did, 'test-domain')
      await agentService.requestRichCredential(agent.did, ['admin'], ['manage'])

      const wallet = await agentService.getWallet(agent.did)

      expect(wallet?.credentials.basic).not.toBeNull()
      expect(wallet?.credentials.rich).toHaveLength(1)
    })
  })

  // ============================================
  // Scenario 10: OpenID4VCI Integration
  // ============================================
  describe('OpenID4VCI Integration', () => {
    beforeEach(async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      await agentService.registerAgent({
        name: 'OIDC Agent',
        type: 'service',
        capabilities: [],
      })
    })

    it('should create credential offer', async () => {
      const offer = await agentService.createAgentCredentialOffer(
        'AIAgentIdentityCredential',
        { name: 'Test Agent', type: 'autonomous' }
      )

      expect(offer.credentialOfferUri).toContain('openid-credential-offer://')
      expect(offer.expiresIn).toBe(300)
    })

    it('should accept credential offer', async () => {
      const result = await agentService.acceptCredentialOffer(
        'openid-credential-offer://?credential_offer_uri=https://issuer.local/offers/123'
      )

      expect(result.format).toBe('jwt_vc_json')
      expect(result.credential).toContain('.')
    })
  })
})
