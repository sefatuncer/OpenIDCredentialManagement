/**
 * Multi-Tenant Service Tests
 */

import {
  createTenant,
  getTenant,
  getTenantBySlug,
  listTenants,
  updateTenant,
  suspendTenant,
  activateTenant,
  deleteTenant,
  setCurrentTenant,
  getCurrentTenant,
  getUsage,
  incrementUsage,
  canPerformAction,
  isCredentialTypeAllowed,
  getRateLimits,
  getStats,
  extractTenantFromRequest,
  Tenant,
  TenantUsage,
} from '../../src/services/multiTenant.service'
import { IStorageAdapter, QueryResult } from '../../src/core/storage/IStorageAdapter'

// Mock dependencies
jest.mock('../../src/core/storage', () => {
  const mockTenantsStorage = createMockStorage<Tenant>()
  const mockUsageStorage = createMockStorage<TenantUsage>()

  return {
    createStorageAdapter: jest.fn((collection: string) => {
      if (collection === 'tenants') return mockTenantsStorage
      if (collection === 'tenant_usage') return mockUsageStorage
      return createMockStorage()
    }),
    getStorageFactory: jest.fn(() => ({
      getStorageType: () => 'memory',
    })),
    __mockTenantsStorage: mockTenantsStorage,
    __mockUsageStorage: mockUsageStorage,
  }
})

jest.mock('../../src/core/event-bus', () => ({
  eventBus: {
    emit: jest.fn(),
  },
}))

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

/** Helper: create a mock IStorageAdapter backed by an in-memory Map */
function createMockStorage<T>(): jest.Mocked<IStorageAdapter<T>> {
  const store = new Map<string, T>()

  return {
    save: jest.fn(async (key: string, data: T) => {
      store.set(key, data)
    }),
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    delete: jest.fn(async (key: string) => store.delete(key)),
    list: jest.fn(async () => Array.from(store.values())),
    query: jest.fn(async (filter) => {
      let results = Array.from(store.values())
      if (filter.where) {
        results = results.filter((item: any) =>
          Object.entries(filter.where!).every(([k, v]) => item[k] === v)
        )
      }
      if (filter.limit) results = results.slice(0, filter.limit)
      return { data: results, total: results.length, hasMore: false } as QueryResult<T>
    }),
    count: jest.fn(async () => store.size),
    exists: jest.fn(async (key: string) => store.has(key)),
    update: jest.fn(async (key: string, data: Partial<T>) => {
      const existing = store.get(key)
      if (!existing) return null
      const updated = { ...existing, ...data }
      store.set(key, updated)
      return updated
    }),
    clear: jest.fn(async () => store.clear()),
    getAdapterType: jest.fn(() => 'mock'),
    // Expose internals for test assertions
    __store: store,
  } as any
}

// Get references to mock storage
function getMockStorages() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const storage = require('../../src/core/storage')
  return {
    tenantsStorage: storage.__mockTenantsStorage as jest.Mocked<IStorageAdapter<Tenant>> & { __store: Map<string, Tenant> },
    usageStorage: storage.__mockUsageStorage as jest.Mocked<IStorageAdapter<TenantUsage>> & { __store: Map<string, TenantUsage> },
  }
}

const { eventBus } = require('../../src/core/event-bus')

describe('MultiTenantService', () => {
  let tenantsStorage: ReturnType<typeof getMockStorages>['tenantsStorage']
  let usageStorage: ReturnType<typeof getMockStorages>['usageStorage']

  beforeEach(() => {
    jest.clearAllMocks()
    const storages = getMockStorages()
    tenantsStorage = storages.tenantsStorage
    usageStorage = storages.usageStorage
    // Clear in-memory stores between tests
    ;(tenantsStorage as any).__store.clear()
    ;(usageStorage as any).__store.clear()
  })

  // ---------------------------------------------------------------
  // Tenant CRUD
  // ---------------------------------------------------------------
  describe('createTenant', () => {
    it('should create a tenant with default config', async () => {
      const tenant = await createTenant('Acme Corp', 'acme')

      expect(tenant.name).toBe('Acme Corp')
      expect(tenant.slug).toBe('acme')
      expect(tenant.status).toBe('active')
      expect(tenant.id).toMatch(/^tenant-/)
      expect(tenant.config.features.sdjwt).toBe(true)
      expect(tenant.config.maxCredentials).toBe(10000)
      expect(tenantsStorage.save).toHaveBeenCalledWith(tenant.id, tenant)
      expect(usageStorage.save).toHaveBeenCalledWith(
        tenant.id,
        expect.objectContaining({ credentialsIssued: 0, apiCalls: 0 })
      )
      expect(eventBus.emit).toHaveBeenCalledWith('tenant.created', { tenant })
    })

    it('should merge custom config with defaults', async () => {
      const tenant = await createTenant('Acme', 'acme', {
        maxCredentials: 500,
        features: { sdjwt: false, revocation: false, batchIssuance: true, webhooks: true },
      })

      expect(tenant.config.maxCredentials).toBe(500)
      expect(tenant.config.features.sdjwt).toBe(false)
      expect(tenant.config.features.batchIssuance).toBe(true)
    })

    it('should reject invalid slug characters', async () => {
      await expect(createTenant('Bad', 'Bad_Slug!')).rejects.toThrow(
        'Slug must contain only lowercase letters, numbers, and hyphens'
      )
    })

    it('should reject uppercase slug', async () => {
      await expect(createTenant('Upper', 'UpperCase')).rejects.toThrow(
        'Slug must contain only lowercase letters, numbers, and hyphens'
      )
    })

    it('should reject duplicate slug', async () => {
      await createTenant('First', 'unique-slug')
      await expect(createTenant('Second', 'unique-slug')).rejects.toThrow(
        'Tenant with slug "unique-slug" already exists'
      )
    })

    it('should accept slug with hyphens and numbers', async () => {
      const tenant = await createTenant('Test', 'my-tenant-123')
      expect(tenant.slug).toBe('my-tenant-123')
    })
  })

  describe('getTenant', () => {
    it('should return tenant by ID', async () => {
      const created = await createTenant('Test', 'test')
      const fetched = await getTenant(created.id)
      expect(fetched).not.toBeNull()
      expect(fetched!.name).toBe('Test')
    })

    it('should return null for non-existent ID', async () => {
      const result = await getTenant('non-existent')
      expect(result).toBeNull()
    })
  })

  describe('getTenantBySlug', () => {
    it('should return tenant by slug', async () => {
      await createTenant('Acme', 'acme')
      const found = await getTenantBySlug('acme')
      expect(found).not.toBeNull()
      expect(found!.name).toBe('Acme')
    })

    it('should return null for unknown slug', async () => {
      const result = await getTenantBySlug('no-such-slug')
      expect(result).toBeNull()
    })
  })

  describe('listTenants', () => {
    it('should list all tenants', async () => {
      await createTenant('A', 'a')
      await createTenant('B', 'b')
      const all = await listTenants()
      expect(all).toHaveLength(2)
    })

    it('should filter by status', async () => {
      const t = await createTenant('Suspendee', 'suspendee')
      await createTenant('Active', 'active-one')
      await suspendTenant(t.id, 'test')

      const suspended = await listTenants('suspended')
      expect(suspended).toHaveLength(1)
      expect(suspended[0].status).toBe('suspended')

      const active = await listTenants('active')
      expect(active).toHaveLength(1)
      expect(active[0].status).toBe('active')
    })

    it('should return empty array when no tenants', async () => {
      const result = await listTenants()
      expect(result).toEqual([])
    })
  })

  describe('updateTenant', () => {
    it('should update tenant name', async () => {
      const t = await createTenant('Old', 'old')
      const updated = await updateTenant(t.id, { name: 'New' })
      expect(updated!.name).toBe('New')
    })

    it('should merge config updates', async () => {
      const t = await createTenant('Cfg', 'cfg')
      const updated = await updateTenant(t.id, {
        config: { maxCredentials: 999 } as any,
      })
      expect(updated!.config.maxCredentials).toBe(999)
      // Other config fields preserved
      expect(updated!.config.features.sdjwt).toBe(true)
    })

    it('should merge metadata updates', async () => {
      const t = await createTenant('Meta', 'meta')
      await updateTenant(t.id, { metadata: { foo: 'bar' } })
      const updated = await updateTenant(t.id, { metadata: { baz: 42 } })
      expect(updated!.metadata.foo).toBe('bar')
      expect(updated!.metadata.baz).toBe(42)
    })

    it('should throw for non-existent tenant', async () => {
      await expect(updateTenant('nope', { name: 'X' })).rejects.toThrow('Tenant not found')
    })

    it('should emit tenant.updated event', async () => {
      const t = await createTenant('Evt', 'evt')
      jest.clearAllMocks()
      await updateTenant(t.id, { name: 'Updated' })
      expect(eventBus.emit).toHaveBeenCalledWith('tenant.updated', expect.objectContaining({
        tenant: expect.objectContaining({ name: 'Updated' }),
      }))
    })

    it('should update the updatedAt timestamp', async () => {
      const t = await createTenant('Time', 'time')
      const originalUpdatedAt = t.updatedAt
      // Small delay so timestamps differ
      await new Promise((r) => setTimeout(r, 10))
      const updated = await updateTenant(t.id, { name: 'Time2' })
      expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(originalUpdatedAt.getTime())
    })
  })

  describe('deleteTenant', () => {
    it('should delete tenant and its usage data', async () => {
      const t = await createTenant('Doomed', 'doomed')
      const result = await deleteTenant(t.id)
      expect(result).toBe(true)
      expect(tenantsStorage.delete).toHaveBeenCalledWith(t.id)
      expect(usageStorage.delete).toHaveBeenCalledWith(t.id)
      expect(eventBus.emit).toHaveBeenCalledWith('tenant.deleted', {
        tenantId: t.id,
        tenantName: 'Doomed',
      })
    })

    it('should return false for non-existent tenant', async () => {
      const result = await deleteTenant('ghost')
      expect(result).toBe(false)
    })

    it('should make tenant unfindable after deletion', async () => {
      const t = await createTenant('Gone', 'gone')
      await deleteTenant(t.id)
      expect(await getTenant(t.id)).toBeNull()
    })
  })

  // ---------------------------------------------------------------
  // Tenant lifecycle
  // ---------------------------------------------------------------
  describe('suspendTenant', () => {
    it('should set status to suspended', async () => {
      const t = await createTenant('Alive', 'alive')
      await suspendTenant(t.id, 'policy violation')
      const fetched = await getTenant(t.id)
      expect(fetched!.status).toBe('suspended')
      expect(fetched!.metadata.suspendedReason).toBe('policy violation')
      expect(fetched!.metadata.suspendedAt).toBeDefined()
    })

    it('should emit tenant.suspended event', async () => {
      const t = await createTenant('Suspendable', 'suspendable')
      jest.clearAllMocks()
      await suspendTenant(t.id, 'abuse')
      expect(eventBus.emit).toHaveBeenCalledWith('tenant.suspended', {
        tenant: expect.objectContaining({ status: 'suspended' }),
        reason: 'abuse',
      })
    })

    it('should throw for non-existent tenant', async () => {
      await expect(suspendTenant('missing')).rejects.toThrow('Tenant not found')
    })

    it('should work without a reason', async () => {
      const t = await createTenant('NoReason', 'noreason')
      await suspendTenant(t.id)
      const fetched = await getTenant(t.id)
      expect(fetched!.status).toBe('suspended')
      expect(fetched!.metadata.suspendedReason).toBeUndefined()
    })
  })

  describe('activateTenant', () => {
    it('should set status back to active', async () => {
      const t = await createTenant('Reactivate', 'reactivate')
      await suspendTenant(t.id, 'temp')
      await activateTenant(t.id)
      const fetched = await getTenant(t.id)
      expect(fetched!.status).toBe('active')
      expect(fetched!.metadata.suspendedReason).toBeUndefined()
      expect(fetched!.metadata.suspendedAt).toBeUndefined()
    })

    it('should emit tenant.activated event', async () => {
      const t = await createTenant('Act', 'act')
      await suspendTenant(t.id)
      jest.clearAllMocks()
      await activateTenant(t.id)
      expect(eventBus.emit).toHaveBeenCalledWith('tenant.activated', {
        tenant: expect.objectContaining({ status: 'active' }),
      })
    })

    it('should throw for non-existent tenant', async () => {
      await expect(activateTenant('missing')).rejects.toThrow('Tenant not found')
    })
  })

  // ---------------------------------------------------------------
  // Tenant context
  // ---------------------------------------------------------------
  describe('setCurrentTenant / getCurrentTenant', () => {
    it('should set and get current tenant context', async () => {
      const t = await createTenant('Ctx', 'ctx')
      await setCurrentTenant(t.id)
      const current = await getCurrentTenant()
      expect(current).not.toBeNull()
      expect(current!.id).toBe(t.id)
    })

    it('should clear current tenant with null', async () => {
      const t = await createTenant('Ctx2', 'ctx2')
      await setCurrentTenant(t.id)
      await setCurrentTenant(null)
      const current = await getCurrentTenant()
      expect(current).toBeNull()
    })

    it('should throw when setting non-existent tenant', async () => {
      await expect(setCurrentTenant('non-existent')).rejects.toThrow('Tenant not found')
    })
  })

  // ---------------------------------------------------------------
  // Usage tracking
  // ---------------------------------------------------------------
  describe('getUsage', () => {
    it('should return usage initialized to zero', async () => {
      const t = await createTenant('Usage', 'usage')
      const usage = await getUsage(t.id)
      expect(usage).not.toBeNull()
      expect(usage!.credentialsIssued).toBe(0)
      expect(usage!.apiCalls).toBe(0)
    })

    it('should return null for non-existent tenant', async () => {
      const usage = await getUsage('ghost')
      expect(usage).toBeNull()
    })
  })

  describe('incrementUsage', () => {
    it('should increment a metric by 1', async () => {
      const t = await createTenant('Inc', 'inc')
      await incrementUsage(t.id, 'credentialsIssued')
      const usage = await getUsage(t.id)
      expect(usage!.credentialsIssued).toBe(1)
    })

    it('should increment by a custom amount', async () => {
      const t = await createTenant('Inc2', 'inc2')
      await incrementUsage(t.id, 'apiCalls', 50)
      const usage = await getUsage(t.id)
      expect(usage!.apiCalls).toBe(50)
    })

    it('should accumulate multiple increments', async () => {
      const t = await createTenant('Acc', 'acc')
      await incrementUsage(t.id, 'credentialsIssued', 3)
      await incrementUsage(t.id, 'credentialsIssued', 7)
      const usage = await getUsage(t.id)
      expect(usage!.credentialsIssued).toBe(10)
    })

    it('should silently skip for non-existent tenant', async () => {
      // Should not throw
      await incrementUsage('ghost', 'apiCalls')
    })
  })

  // ---------------------------------------------------------------
  // Action authorization
  // ---------------------------------------------------------------
  describe('canPerformAction', () => {
    it('should allow action for active tenant within limits', async () => {
      const t = await createTenant('Allowed', 'allowed')
      const result = await canPerformAction(t.id, 'issue_credential')
      expect(result.allowed).toBe(true)
    })

    it('should deny action for suspended tenant', async () => {
      const t = await createTenant('Suspended', 'suspended-check')
      await suspendTenant(t.id, 'test')
      const result = await canPerformAction(t.id, 'issue_credential')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('suspended')
    })

    it('should deny when credential limit is reached', async () => {
      const t = await createTenant('Limited', 'limited', { maxCredentials: 5 })
      // Simulate reaching the limit
      await incrementUsage(t.id, 'credentialsIssued', 5)
      const result = await canPerformAction(t.id, 'issue_credential')
      expect(result.allowed).toBe(false)
      expect(result.reason).toBe('Credential limit reached')
    })

    it('should deny batch_issuance when feature disabled', async () => {
      const t = await createTenant('NoBatch', 'nobatch')
      // Default config has batchIssuance: false
      const result = await canPerformAction(t.id, 'batch_issuance')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('Batch issuance not enabled')
    })

    it('should allow sdjwt when feature enabled', async () => {
      const t = await createTenant('SdJwt', 'sdjwt-ok')
      // Default config has sdjwt: true
      const result = await canPerformAction(t.id, 'sdjwt')
      expect(result.allowed).toBe(true)
    })

    it('should deny sdjwt when feature disabled', async () => {
      const t = await createTenant('NoSd', 'nosd', {
        features: { sdjwt: false, revocation: true, batchIssuance: false, webhooks: false },
      })
      const result = await canPerformAction(t.id, 'sdjwt')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('SD-JWT not enabled')
    })

    it('should deny revocation when feature disabled', async () => {
      const t = await createTenant('NoRev', 'norev', {
        features: { sdjwt: true, revocation: false, batchIssuance: false, webhooks: false },
      })
      const result = await canPerformAction(t.id, 'revocation')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('Revocation not enabled')
    })

    it('should return not-found for non-existent tenant', async () => {
      const result = await canPerformAction('ghost', 'issue_credential')
      expect(result.allowed).toBe(false)
      expect(result.reason).toBe('Tenant not found')
    })

    it('should allow unknown action (no specific rule)', async () => {
      const t = await createTenant('Unknown', 'unknown-action')
      const result = await canPerformAction(t.id, 'some_unknown_action')
      expect(result.allowed).toBe(true)
    })
  })

  // ---------------------------------------------------------------
  // Credential type allowlist
  // ---------------------------------------------------------------
  describe('isCredentialTypeAllowed', () => {
    it('should return true for allowed type', async () => {
      const t = await createTenant('Allow', 'allow-type')
      const result = await isCredentialTypeAllowed(t.id, 'AIAgentIdentityCredential')
      expect(result).toBe(true)
    })

    it('should return false for disallowed type', async () => {
      const t = await createTenant('Deny', 'deny-type')
      const result = await isCredentialTypeAllowed(t.id, 'SomeRandomType')
      expect(result).toBe(false)
    })

    it('should return false for non-existent tenant', async () => {
      const result = await isCredentialTypeAllowed('ghost', 'AIAgentIdentityCredential')
      expect(result).toBe(false)
    })
  })

  // ---------------------------------------------------------------
  // Rate limits
  // ---------------------------------------------------------------
  describe('getRateLimits', () => {
    it('should return rate limits for tenant', async () => {
      const t = await createTenant('Rate', 'rate')
      const limits = await getRateLimits(t.id)
      expect(limits).not.toBeNull()
      expect(limits!.requestsPerMinute).toBe(100)
      expect(limits!.requestsPerHour).toBe(5000)
    })

    it('should return null for non-existent tenant', async () => {
      const limits = await getRateLimits('ghost')
      expect(limits).toBeNull()
    })
  })

  // ---------------------------------------------------------------
  // Stats aggregation
  // ---------------------------------------------------------------
  describe('getStats', () => {
    it('should aggregate stats across tenants', async () => {
      const t1 = await createTenant('S1', 's1')
      const t2 = await createTenant('S2', 's2')
      await suspendTenant(t2.id, 'test')
      await incrementUsage(t1.id, 'credentialsIssued', 10)
      await incrementUsage(t2.id, 'credentialsIssued', 5)
      await incrementUsage(t1.id, 'apiCalls', 100)

      const stats = await getStats()
      expect(stats.totalTenants).toBe(2)
      expect(stats.activeTenants).toBe(1)
      expect(stats.suspendedTenants).toBe(1)
      expect(stats.totalCredentialsIssued).toBe(15)
      expect(stats.totalApiCalls).toBe(100)
      expect(stats.storageType).toBe('memory')
    })

    it('should return zeros when no tenants exist', async () => {
      const stats = await getStats()
      expect(stats.totalTenants).toBe(0)
      expect(stats.activeTenants).toBe(0)
      expect(stats.totalCredentialsIssued).toBe(0)
    })
  })

  // ---------------------------------------------------------------
  // Tenant isolation
  // ---------------------------------------------------------------
  describe('tenant isolation', () => {
    it('should not confuse data between tenants', async () => {
      const t1 = await createTenant('Tenant1', 'tenant1')
      const t2 = await createTenant('Tenant2', 'tenant2')

      await incrementUsage(t1.id, 'credentialsIssued', 100)
      await incrementUsage(t2.id, 'credentialsIssued', 5)

      const u1 = await getUsage(t1.id)
      const u2 = await getUsage(t2.id)
      expect(u1!.credentialsIssued).toBe(100)
      expect(u2!.credentialsIssued).toBe(5)
    })

    it('deleting one tenant should not affect another', async () => {
      const t1 = await createTenant('Keep', 'keep')
      const t2 = await createTenant('Delete', 'deleteme')
      await deleteTenant(t2.id)

      expect(await getTenant(t1.id)).not.toBeNull()
      expect(await getUsage(t1.id)).not.toBeNull()
    })

    it('suspending one tenant should not affect another', async () => {
      const t1 = await createTenant('StayActive', 'stayactive')
      const t2 = await createTenant('GetSuspended', 'getsuspended')
      await suspendTenant(t2.id, 'reason')

      const result = await canPerformAction(t1.id, 'issue_credential')
      expect(result.allowed).toBe(true)
    })
  })

  // ---------------------------------------------------------------
  // extractTenantFromRequest
  // ---------------------------------------------------------------
  describe('extractTenantFromRequest', () => {
    it('should resolve tenant by X-Tenant-ID header', async () => {
      const t = await createTenant('Header', 'header')
      const result = await extractTenantFromRequest({
        headers: { 'x-tenant-id': t.id },
      })
      expect(result).not.toBeNull()
      expect(result!.id).toBe(t.id)
    })

    it('should resolve tenant by X-Tenant-Slug header', async () => {
      await createTenant('Slug', 'slug-header')
      const result = await extractTenantFromRequest({
        headers: { 'x-tenant-slug': 'slug-header' },
      })
      expect(result).not.toBeNull()
      expect(result!.slug).toBe('slug-header')
    })

    it('should resolve tenant from subdomain', async () => {
      await createTenant('Sub', 'sub')
      const result = await extractTenantFromRequest({
        headers: {},
        hostname: 'sub.example.com',
      })
      expect(result).not.toBeNull()
      expect(result!.slug).toBe('sub')
    })

    it('should resolve tenant from query parameter', async () => {
      const t = await createTenant('Query', 'query')
      const result = await extractTenantFromRequest({
        headers: {},
        query: { tenantId: t.id },
      })
      expect(result).not.toBeNull()
      expect(result!.id).toBe(t.id)
    })

    it('should return null when no tenant resolved', async () => {
      const result = await extractTenantFromRequest({
        headers: {},
      })
      expect(result).toBeNull()
    })

    it('should prioritize X-Tenant-ID over slug and subdomain', async () => {
      const t1 = await createTenant('ByID', 'byid')
      await createTenant('BySlug', 'byslug')
      const result = await extractTenantFromRequest({
        headers: { 'x-tenant-id': t1.id, 'x-tenant-slug': 'byslug' },
        hostname: 'byslug.example.com',
      })
      expect(result!.id).toBe(t1.id)
    })

    it('should return null for non-existent X-Tenant-ID', async () => {
      const result = await extractTenantFromRequest({
        headers: { 'x-tenant-id': 'non-existent' },
      })
      expect(result).toBeNull()
    })
  })
})
