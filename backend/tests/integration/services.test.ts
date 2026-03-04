/**
 * Services Integration Tests
 *
 * Tests the migrated services with storage adapters to ensure
 * they work correctly with the new storage infrastructure.
 */

import {
  addTrustedEntity,
  removeTrustedEntity,
  updateTrustedEntity,
  getTrustedEntity,
  isEntityTrusted,
  isIssuerTrustedForCredential,
  getEntityTrustLevel,
  getTrustedIssuers,
  getTrustedVerifiers,
  addTrustAnchor,
  removeTrustAnchor,
  getTrustAnchors,
  addTrustPolicy,
  getTrustPolicy,
  getAllTrustPolicies,
  validateAgainstTrustPolicy,
  getTrustRegistryStats,
  clearTrustRegistry,
  meetsTrustLevel,
  TrustedEntity,
  TrustPolicy,
} from '../../src/services/trustRegistry.service'

import {
  createAuditLog,
  getAuditLog,
  queryAuditLogs,
  clearOldAuditLogs,
  getAuditStats,
  clearAllAuditLogs,
  AuditAction,
  AuditEventType,
} from '../../src/services/audit.service'

import { setFeature, resetFeatureFlags } from '../../src/core/feature-flags'
import { initializeStorage, shutdownStorage } from '../../src/core/storage'
import { eventBus } from '../../src/core/event-bus'

// Initialize storage before tests
beforeAll(async () => {
  await initializeStorage('memory')
})

afterAll(async () => {
  await shutdownStorage()
})

describe('Trust Registry Service Integration', () => {
  beforeEach(async () => {
    // Ensure feature is enabled and clear data
    setFeature('module.trust-registry', true)
    await clearTrustRegistry()
  })

  afterEach(() => {
    resetFeatureFlags()
  })

  describe('Trusted Entity Management', () => {
    const testEntityDid = 'did:key:z6MkTest123'
    const testEntity = {
      did: testEntityDid,
      name: 'Test Issuer',
      type: 'issuer' as const,
      trustLevel: 'standard' as const,
      credentialTypes: ['AgentIdentityCredential', 'DelegationCredential'],
      metadata: { region: 'EU' },
      active: true,
    }

    it('should add and retrieve a trusted entity', async () => {
      const created = await addTrustedEntity(testEntity)

      expect(created.did).toBe(testEntityDid)
      expect(created.name).toBe(testEntity.name)
      expect(created.addedAt).toBeInstanceOf(Date)
      expect(created.updatedAt).toBeInstanceOf(Date)

      const retrieved = await getTrustedEntity(testEntityDid)
      expect(retrieved).not.toBeNull()
      expect(retrieved?.name).toBe(testEntity.name)
    })

    it('should update a trusted entity', async () => {
      await addTrustedEntity(testEntity)

      const updated = await updateTrustedEntity(testEntityDid, {
        name: 'Updated Name',
        trustLevel: 'elevated',
      })

      expect(updated).not.toBeNull()
      expect(updated?.name).toBe('Updated Name')
      expect(updated?.trustLevel).toBe('elevated')
      expect(updated?.did).toBe(testEntityDid) // Unchanged
    })

    it('should remove a trusted entity', async () => {
      await addTrustedEntity(testEntity)

      const removed = await removeTrustedEntity(testEntityDid)
      expect(removed).toBe(true)

      const retrieved = await getTrustedEntity(testEntityDid)
      expect(retrieved).toBeNull()
    })

    it('should check if entity is trusted', async () => {
      await addTrustedEntity(testEntity)

      expect(await isEntityTrusted(testEntityDid)).toBe(true)
      expect(await isEntityTrusted(testEntityDid, 'issuer')).toBe(true)
      expect(await isEntityTrusted(testEntityDid, 'verifier')).toBe(false)
      expect(await isEntityTrusted('did:key:unknown')).toBe(false)
    })

    it('should handle inactive entities', async () => {
      await addTrustedEntity({ ...testEntity, active: false })

      expect(await isEntityTrusted(testEntityDid)).toBe(false)
    })

    it('should handle expired entities', async () => {
      const expiredEntity = {
        ...testEntity,
        expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
      }
      await addTrustedEntity(expiredEntity)

      expect(await isEntityTrusted(testEntityDid)).toBe(false)
    })
  })

  describe('Issuer Credential Authorization', () => {
    it('should check issuer authorization for credential types', async () => {
      await addTrustedEntity({
        did: 'did:key:z6MkIssuer1',
        name: 'Specialized Issuer',
        type: 'issuer',
        trustLevel: 'standard',
        credentialTypes: ['AgentIdentityCredential'],
        metadata: {},
        active: true,
      })

      expect(await isIssuerTrustedForCredential('did:key:z6MkIssuer1', 'AgentIdentityCredential')).toBe(true)
      expect(await isIssuerTrustedForCredential('did:key:z6MkIssuer1', 'DelegationCredential')).toBe(false)
    })

    it('should allow wildcard credential authorization', async () => {
      await addTrustedEntity({
        did: 'did:key:z6MkWildcard',
        name: 'Wildcard Issuer',
        type: 'issuer',
        trustLevel: 'high',
        credentialTypes: ['*'],
        metadata: {},
        active: true,
      })

      expect(await isIssuerTrustedForCredential('did:key:z6MkWildcard', 'AnyCredential')).toBe(true)
    })
  })

  describe('Trust Level Operations', () => {
    it('should get entity trust level', async () => {
      await addTrustedEntity({
        did: 'did:key:z6MkTrust',
        name: 'Trusted Entity',
        type: 'issuer',
        trustLevel: 'elevated',
        credentialTypes: ['*'],
        metadata: {},
        active: true,
      })

      expect(await getEntityTrustLevel('did:key:z6MkTrust')).toBe('elevated')
      expect(await getEntityTrustLevel('did:key:unknown')).toBe('untrusted')
    })

    it('should compare trust levels correctly', () => {
      expect(meetsTrustLevel('high', 'basic')).toBe(true)
      expect(meetsTrustLevel('standard', 'standard')).toBe(true)
      expect(meetsTrustLevel('basic', 'elevated')).toBe(false)
      expect(meetsTrustLevel('untrusted', 'basic')).toBe(false)
    })
  })

  describe('Trust Anchors', () => {
    it('should add and retrieve trust anchors', async () => {
      const anchor = await addTrustAnchor({
        id: 'anchor-1',
        name: 'Root CA',
        did: 'did:key:z6MkRootCA',
        publicKey: 'mockPublicKey',
        trustLevel: 'high',
        active: true,
      })

      expect(anchor.id).toBe('anchor-1')
      expect(anchor.addedAt).toBeInstanceOf(Date)

      const anchors = await getTrustAnchors()
      expect(anchors).toHaveLength(1)
      expect(anchors[0].name).toBe('Root CA')
    })

    it('should remove trust anchors', async () => {
      await addTrustAnchor({
        id: 'anchor-remove',
        name: 'To Remove',
        did: 'did:key:z6MkRemove',
        publicKey: 'key',
        trustLevel: 'basic',
        active: true,
      })

      const removed = await removeTrustAnchor('anchor-remove')
      expect(removed).toBe(true)

      const anchors = await getTrustAnchors()
      expect(anchors).toHaveLength(0)
    })
  })

  describe('Trust Policies', () => {
    const testPolicy: TrustPolicy = {
      id: 'policy-1',
      name: 'Default Policy',
      description: 'Test policy',
      active: true,
      rules: [
        {
          credentialType: 'AgentIdentityCredential',
          requiredTrustLevel: 'standard',
          requireRevocationCheck: true,
          maxCredentialAge: 86400, // 1 day
        },
      ],
    }

    it('should add and retrieve trust policies', async () => {
      const created = await addTrustPolicy(testPolicy)
      expect(created.id).toBe('policy-1')

      const retrieved = await getTrustPolicy('policy-1')
      expect(retrieved).not.toBeNull()
      expect(retrieved?.rules).toHaveLength(1)

      const all = await getAllTrustPolicies()
      expect(all).toHaveLength(1)
    })

    it('should validate against trust policy', async () => {
      await addTrustPolicy(testPolicy)
      await addTrustedEntity({
        did: 'did:key:z6MkPolicyIssuer',
        name: 'Policy Issuer',
        type: 'issuer',
        trustLevel: 'standard',
        credentialTypes: ['AgentIdentityCredential'],
        metadata: {},
        active: true,
      })

      const result = await validateAgainstTrustPolicy(
        'policy-1',
        'did:key:z6MkPolicyIssuer',
        'AgentIdentityCredential',
        new Date()
      )

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should fail validation for low trust level', async () => {
      await addTrustPolicy({
        ...testPolicy,
        rules: [
          {
            credentialType: 'AgentIdentityCredential',
            requiredTrustLevel: 'high',
            requireRevocationCheck: false,
          },
        ],
      })

      await addTrustedEntity({
        did: 'did:key:z6MkLowTrust',
        name: 'Low Trust Issuer',
        type: 'issuer',
        trustLevel: 'basic',
        credentialTypes: ['*'],
        metadata: {},
        active: true,
      })

      const result = await validateAgainstTrustPolicy(
        'policy-1',
        'did:key:z6MkLowTrust',
        'AgentIdentityCredential',
        new Date()
      )

      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  })

  describe('Entity Queries', () => {
    beforeEach(async () => {
      // Add multiple entities
      await addTrustedEntity({
        did: 'did:key:issuer1',
        name: 'Issuer 1',
        type: 'issuer',
        trustLevel: 'standard',
        credentialTypes: ['*'],
        metadata: {},
        active: true,
      })
      await addTrustedEntity({
        did: 'did:key:issuer2',
        name: 'Issuer 2',
        type: 'issuer',
        trustLevel: 'high',
        credentialTypes: ['*'],
        metadata: {},
        active: true,
      })
      await addTrustedEntity({
        did: 'did:key:verifier1',
        name: 'Verifier 1',
        type: 'verifier',
        trustLevel: 'standard',
        credentialTypes: ['*'],
        metadata: {},
        active: true,
      })
    })

    it('should get all trusted issuers', async () => {
      const issuers = await getTrustedIssuers()
      expect(issuers).toHaveLength(2)
      expect(issuers.every((e) => e.type === 'issuer')).toBe(true)
    })

    it('should get all trusted verifiers', async () => {
      const verifiers = await getTrustedVerifiers()
      expect(verifiers).toHaveLength(1)
      expect(verifiers[0].type).toBe('verifier')
    })
  })

  describe('Trust Registry Statistics', () => {
    it('should return correct statistics', async () => {
      await addTrustedEntity({
        did: 'did:key:stat1',
        name: 'Stat Entity 1',
        type: 'issuer',
        trustLevel: 'standard',
        credentialTypes: ['*'],
        metadata: {},
        active: true,
      })

      await addTrustAnchor({
        id: 'stat-anchor',
        name: 'Stat Anchor',
        did: 'did:key:anchor',
        publicKey: 'key',
        trustLevel: 'high',
        active: true,
      })

      const stats = await getTrustRegistryStats()
      expect(stats.totalEntities).toBe(1)
      expect(stats.activeEntities).toBe(1)
      expect(stats.trustedIssuers).toBe(1)
      expect(stats.trustAnchors).toBe(1)
      expect(stats.storageType).toBe('memory')
    })
  })

  describe('Feature Flag Integration', () => {
    it('should return defaults when feature is disabled', async () => {
      await addTrustedEntity({
        did: 'did:key:disabled',
        name: 'Disabled Entity',
        type: 'issuer',
        trustLevel: 'standard',
        credentialTypes: ['*'],
        metadata: {},
        active: true,
      })

      setFeature('module.trust-registry', false)

      // When disabled, isEntityTrusted returns true (permissive)
      expect(await isEntityTrusted('did:key:unknown')).toBe(true)

      // Queries return empty
      expect(await getTrustedIssuers()).toHaveLength(0)
      expect(await getTrustAnchors()).toHaveLength(0)
    })
  })

  describe('Event Emission', () => {
    it('should emit events on entity operations', async () => {
      const events: string[] = []

      const unsubscribe = eventBus.on('trust.*', (event) => {
        events.push(event.type)
      })

      await addTrustedEntity({
        did: 'did:key:eventTest',
        name: 'Event Test',
        type: 'issuer',
        trustLevel: 'standard',
        credentialTypes: ['*'],
        metadata: {},
        active: true,
      })

      await updateTrustedEntity('did:key:eventTest', { name: 'Updated' })
      await removeTrustedEntity('did:key:eventTest')

      unsubscribe()

      expect(events).toContain('trust.entity.added')
      expect(events).toContain('trust.entity.updated')
      expect(events).toContain('trust.entity.removed')
    })
  })
})

describe('Audit Service Integration', () => {
  beforeEach(async () => {
    setFeature('module.audit', true)
    await clearAllAuditLogs()
  })

  afterEach(() => {
    resetFeatureFlags()
  })

  describe('Audit Log Creation', () => {
    it('should create and retrieve audit log', async () => {
      const log = await createAuditLog({
        eventType: 'credential.issued' as AuditEventType,
        action: 'issue' as AuditAction,
        actorDid: 'did:key:issuer',
        resourceType: 'credential',
        resourceId: '123',
        success: true,
        details: { credentialType: 'AgentIdentityCredential' },
      })

      expect(log.id).toBeDefined()
      expect(log.timestamp).toBeInstanceOf(Date)

      const retrieved = await getAuditLog(log.id)
      expect(retrieved).not.toBeNull()
      expect(retrieved?.action).toBe('issue')
    })

    it('should store IP address and user agent', async () => {
      const log = await createAuditLog({
        eventType: 'credential.verified' as AuditEventType,
        action: 'verify' as AuditAction,
        actorDid: 'did:key:verifier',
        resourceType: 'presentation',
        resourceId: '456',
        success: true,
        details: {},
        ipAddress: '192.168.1.1',
        userAgent: 'TestAgent/1.0',
      })

      const retrieved = await getAuditLog(log.id)
      expect(retrieved?.ipAddress).toBe('192.168.1.1')
      expect(retrieved?.userAgent).toBe('TestAgent/1.0')
    })
  })

  describe('Audit Log Queries', () => {
    beforeEach(async () => {
      await clearAllAuditLogs()
      // Create multiple logs
      for (let i = 0; i < 5; i++) {
        await createAuditLog({
          eventType: 'credential.issued' as AuditEventType,
          action: 'issue' as AuditAction,
          actorDid: `did:key:actor${i}`,
          resourceType: 'credential',
          resourceId: `${i}`,
          success: i % 2 === 0,
          details: {},
        })
      }
    })

    it('should query logs with filters', async () => {
      const result = await queryAuditLogs({
        success: true,
      })

      expect(result.logs.length).toBeGreaterThan(0)
      expect(result.logs.every((log) => log.success === true)).toBe(true)
    })

    it('should support pagination', async () => {
      const result = await queryAuditLogs({
        limit: 2,
        offset: 0,
      })

      expect(result.logs).toHaveLength(2)
      expect(result.total).toBe(5)
      expect(result.hasMore).toBe(true)
    })
  })

  describe('Audit Log Cleanup', () => {
    it('should delete old audit logs', async () => {
      // Create a log
      await createAuditLog({
        eventType: 'credential.issued' as AuditEventType,
        action: 'issue' as AuditAction,
        actorDid: 'did:key:old',
        resourceType: 'credential',
        resourceId: 'old',
        success: true,
        details: {},
      })

      // Delete logs older than now (should delete the log we just created)
      const futureDate = new Date(Date.now() + 1000) // 1 second in the future
      const deleted = await clearOldAuditLogs(futureDate)
      expect(deleted).toBeGreaterThanOrEqual(1)
    })
  })

  describe('Audit Statistics', () => {
    it('should return correct statistics', async () => {
      await createAuditLog({
        eventType: 'credential.issued' as AuditEventType,
        action: 'issue' as AuditAction,
        actorDid: 'did:key:stat',
        resourceType: 'credential',
        resourceId: 'stat',
        success: true,
        details: {},
      })

      await createAuditLog({
        eventType: 'credential.verified' as AuditEventType,
        action: 'verify' as AuditAction,
        actorDid: 'did:key:stat',
        resourceType: 'presentation',
        resourceId: 'stat',
        success: false,
        details: {},
      })

      const stats = await getAuditStats()

      expect(stats.totalLogs).toBe(2)
      expect(stats.byAction['issue']).toBe(1)
      expect(stats.byAction['verify']).toBe(1)
      // successRate is a percentage (0-100)
      expect(stats.successRate).toBe(50)
    })
  })

  describe('Feature Flag Integration', () => {
    it('should still work when feature is disabled', async () => {
      setFeature('module.audit', false)

      // Should not throw, but log won't be saved
      const log = await createAuditLog({
        eventType: 'credential.issued' as AuditEventType,
        action: 'issue' as AuditAction,
        actorDid: 'did:key:disabled',
        resourceType: 'credential',
        resourceId: 'disabled',
        success: true,
        details: {},
      })

      // Log is still created but querying returns empty when disabled
      expect(log.id).toBeDefined()
    })
  })
})

describe('Event Bus Integration', () => {
  it('should emit and receive events across services', async () => {
    const receivedEvents: unknown[] = []

    const unsubscribe = eventBus.on('credential.*', (event) => {
      receivedEvents.push(event)
    })

    eventBus.emit('credential.issued', {
      credentialId: 'cred-123',
      holder: 'did:key:holder',
    })

    eventBus.emit('credential.revoked', {
      credentialId: 'cred-456',
    })

    // Non-matching event
    eventBus.emit('trust.entity.added', { did: 'did:key:test' })

    unsubscribe()

    expect(receivedEvents).toHaveLength(2)
  })

  it('should support once listeners', async () => {
    const received: unknown[] = []

    eventBus.once('test.once', (event) => {
      received.push(event)
    })

    eventBus.emit('test.once', { data: 1 })
    eventBus.emit('test.once', { data: 2 })
    eventBus.emit('test.once', { data: 3 })

    expect(received).toHaveLength(1)
  })

  it('should support waitFor with timeout', async () => {
    // Start waiting before emitting
    const promise = eventBus.waitFor<{ value: number }>('test.wait', 1000)

    // Emit after a short delay
    setTimeout(() => {
      eventBus.emit('test.wait', { value: 42 })
    }, 100)

    const event = await promise
    expect((event.data as { value: number }).value).toBe(42)
  })
})

describe('Storage Type Detection', () => {
  it('should report memory storage type', async () => {
    const { getStorageType } = await import('../../src/core/storage')
    expect(getStorageType()).toBe('memory')
  })
})
