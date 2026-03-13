/**
 * Tenant Storage Service Tests
 *
 * Tests for tenant-scoped storage helpers that provide JSONB tenantId
 * enrichment and cross-tenant isolation.
 */

import {
  withTenantFilter,
  saveTenantData,
  queryTenantData,
  listTenantData,
  getTenantData,
  deleteTenantData,
} from '../../src/services/tenant-storage.service'
import { IStorageAdapter, QueryFilter, QueryResult } from '../../src/core/storage/IStorageAdapter'

// Test data type
interface TestRecord {
  id: string
  name: string
  tenantId?: string
}

/** Create a mock IStorageAdapter backed by an in-memory Map */
function createMockStorage(): vi.Mocked<IStorageAdapter<TestRecord>> & { __store: Map<string, TestRecord> } {
  const store = new Map<string, TestRecord>()

  return {
    save: vi.fn(async (key: string, data: TestRecord) => {
      store.set(key, data)
    }),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    delete: vi.fn(async (key: string) => store.delete(key)),
    list: vi.fn(async () => Array.from(store.values())),
    query: vi.fn(async (filter: QueryFilter) => {
      let results = Array.from(store.values())
      if (filter.where) {
        results = results.filter((item: any) =>
          Object.entries(filter.where!).every(([k, v]) => item[k] === v)
        )
      }
      if (filter.limit) results = results.slice(0, filter.limit)
      return { data: results, total: results.length, hasMore: false } as QueryResult<TestRecord>
    }),
    count: vi.fn(async () => store.size),
    exists: vi.fn(async (key: string) => store.has(key)),
    update: vi.fn(async (key: string, data: Partial<TestRecord>) => {
      const existing = store.get(key)
      if (!existing) return null
      const updated = { ...existing, ...data }
      store.set(key, updated)
      return updated
    }),
    clear: vi.fn(async () => store.clear()),
    getAdapterType: vi.fn(() => 'mock'),
    __store: store,
  } as any
}

describe('TenantStorageService', () => {
  let storage: ReturnType<typeof createMockStorage>

  beforeEach(() => {
    storage = createMockStorage()
  })

  // ---------------------------------------------------------------
  // withTenantFilter
  // ---------------------------------------------------------------
  describe('withTenantFilter', () => {
    it('should add tenantId to where clause', () => {
      const filter = withTenantFilter('tenant-1', { where: { status: 'active' } })
      expect(filter.where).toEqual({ status: 'active', tenantId: 'tenant-1' })
    })

    it('should create where clause when none exists', () => {
      const filter = withTenantFilter('tenant-1', {})
      expect(filter.where).toEqual({ tenantId: 'tenant-1' })
    })

    it('should return original filter when tenantId is undefined', () => {
      const original: QueryFilter = { where: { status: 'active' }, limit: 10 }
      const result = withTenantFilter(undefined, original)
      expect(result).toEqual(original)
    })

    it('should return empty filter when both tenantId and filter are empty', () => {
      const result = withTenantFilter(undefined)
      expect(result).toEqual({})
    })

    it('should preserve other filter fields (limit, orderBy)', () => {
      const filter = withTenantFilter('t-1', { limit: 5, orderBy: '-createdAt' })
      expect(filter.limit).toBe(5)
      expect(filter.orderBy).toBe('-createdAt')
      expect(filter.where).toEqual({ tenantId: 't-1' })
    })
  })

  // ---------------------------------------------------------------
  // saveTenantData
  // ---------------------------------------------------------------
  describe('saveTenantData', () => {
    it('should enrich data with tenantId', async () => {
      const data: TestRecord = { id: 'rec-1', name: 'Alpha' }
      await saveTenantData(storage, 'rec-1', 'tenant-a', data)

      expect(storage.save).toHaveBeenCalledWith('rec-1', {
        id: 'rec-1',
        name: 'Alpha',
        tenantId: 'tenant-a',
      })
      const saved = storage.__store.get('rec-1')
      expect(saved!.tenantId).toBe('tenant-a')
    })

    it('should save without tenantId when tenantId is undefined', async () => {
      const data: TestRecord = { id: 'rec-2', name: 'Beta' }
      await saveTenantData(storage, 'rec-2', undefined, data)

      expect(storage.save).toHaveBeenCalledWith('rec-2', { id: 'rec-2', name: 'Beta' })
      const saved = storage.__store.get('rec-2')
      expect(saved!.tenantId).toBeUndefined()
    })

    it('should not mutate the original data object', async () => {
      const data: TestRecord = { id: 'rec-3', name: 'Gamma' }
      const original = { ...data }
      await saveTenantData(storage, 'rec-3', 'tenant-x', data)
      expect(data).toEqual(original) // original unchanged
    })
  })

  // ---------------------------------------------------------------
  // queryTenantData
  // ---------------------------------------------------------------
  describe('queryTenantData', () => {
    beforeEach(async () => {
      // Seed data for two tenants
      await storage.save('r1', { id: 'r1', name: 'A', tenantId: 'tenant-1' })
      await storage.save('r2', { id: 'r2', name: 'B', tenantId: 'tenant-1' })
      await storage.save('r3', { id: 'r3', name: 'C', tenantId: 'tenant-2' })
      await storage.save('r4', { id: 'r4', name: 'D' }) // no tenant
    })

    it('should return only records matching tenantId', async () => {
      const result = await queryTenantData(storage, 'tenant-1')
      expect(result.data).toHaveLength(2)
      expect(result.data.every((r: any) => r.tenantId === 'tenant-1')).toBe(true)
    })

    it('should return all records when tenantId is undefined', async () => {
      const result = await queryTenantData(storage, undefined)
      expect(result.data).toHaveLength(4)
    })

    it('should combine tenant filter with additional where clause', async () => {
      const result = await queryTenantData(storage, 'tenant-1', {
        where: { name: 'A' },
      })
      expect(result.data).toHaveLength(1)
      expect(result.data[0].name).toBe('A')
    })
  })

  // ---------------------------------------------------------------
  // listTenantData
  // ---------------------------------------------------------------
  describe('listTenantData', () => {
    beforeEach(async () => {
      await storage.save('r1', { id: 'r1', name: 'A', tenantId: 'tenant-1' })
      await storage.save('r2', { id: 'r2', name: 'B', tenantId: 'tenant-2' })
      await storage.save('r3', { id: 'r3', name: 'C', tenantId: 'tenant-1' })
    })

    it('should list only records for specified tenant', async () => {
      const result = await listTenantData(storage, 'tenant-1')
      expect(result).toHaveLength(2)
      expect(result.every((r: any) => r.tenantId === 'tenant-1')).toBe(true)
    })

    it('should list all records when tenantId is undefined', async () => {
      const result = await listTenantData(storage, undefined)
      expect(result).toHaveLength(3)
    })

    it('should return empty array when no records for tenant', async () => {
      const result = await listTenantData(storage, 'tenant-nonexistent')
      expect(result).toEqual([])
    })
  })

  // ---------------------------------------------------------------
  // getTenantData
  // ---------------------------------------------------------------
  describe('getTenantData', () => {
    beforeEach(async () => {
      await storage.save('r1', { id: 'r1', name: 'A', tenantId: 'tenant-1' })
      await storage.save('r2', { id: 'r2', name: 'B', tenantId: 'tenant-2' })
      await storage.save('r3', { id: 'r3', name: 'C' }) // no tenant
    })

    it('should return record when tenantId matches', async () => {
      const result = await getTenantData(storage, 'r1', 'tenant-1')
      expect(result).not.toBeNull()
      expect(result!.name).toBe('A')
    })

    it('should return null for cross-tenant access', async () => {
      const result = await getTenantData(storage, 'r1', 'tenant-2')
      expect(result).toBeNull()
    })

    it('should return record when tenantId is undefined (no tenant check)', async () => {
      const result = await getTenantData(storage, 'r1', undefined)
      expect(result).not.toBeNull()
      expect(result!.name).toBe('A')
    })

    it('should return null for non-existent key', async () => {
      const result = await getTenantData(storage, 'nonexistent', 'tenant-1')
      expect(result).toBeNull()
    })

    it('should return record without tenantId field when no tenant check', async () => {
      const result = await getTenantData(storage, 'r3', undefined)
      expect(result).not.toBeNull()
      expect(result!.name).toBe('C')
    })

    it('should return record without tenantId field even when tenant specified (no tenantId on data)', async () => {
      // Record has no tenantId field, so the cross-tenant check condition
      // `(data as any).tenantId && (data as any).tenantId !== tenantId` is false
      const result = await getTenantData(storage, 'r3', 'tenant-1')
      expect(result).not.toBeNull()
      expect(result!.name).toBe('C')
    })
  })

  // ---------------------------------------------------------------
  // deleteTenantData
  // ---------------------------------------------------------------
  describe('deleteTenantData', () => {
    beforeEach(async () => {
      await storage.save('r1', { id: 'r1', name: 'A', tenantId: 'tenant-1' })
      await storage.save('r2', { id: 'r2', name: 'B', tenantId: 'tenant-2' })
      await storage.save('r3', { id: 'r3', name: 'C' }) // no tenant
    })

    it('should delete record when tenantId matches', async () => {
      const result = await deleteTenantData(storage, 'r1', 'tenant-1')
      expect(result).toBe(true)
      expect(storage.__store.has('r1')).toBe(false)
    })

    it('should refuse to delete cross-tenant record', async () => {
      const result = await deleteTenantData(storage, 'r1', 'tenant-2')
      expect(result).toBe(false)
      expect(storage.__store.has('r1')).toBe(true) // still exists
    })

    it('should delete any record when tenantId is undefined', async () => {
      const result = await deleteTenantData(storage, 'r1', undefined)
      expect(result).toBe(true)
      expect(storage.__store.has('r1')).toBe(false)
    })

    it('should return false for non-existent key', async () => {
      const result = await deleteTenantData(storage, 'nonexistent', 'tenant-1')
      expect(result).toBe(false)
    })

    it('should delete record without tenantId when tenant specified', async () => {
      // Record r3 has no tenantId, cross-tenant guard condition is false
      const result = await deleteTenantData(storage, 'r3', 'tenant-1')
      expect(result).toBe(true)
    })
  })

  // ---------------------------------------------------------------
  // Cross-tenant isolation (end-to-end scenario)
  // ---------------------------------------------------------------
  describe('cross-tenant isolation', () => {
    const tenantA = 'tenant-alpha'
    const tenantB = 'tenant-beta'

    beforeEach(async () => {
      // Tenant A saves two records
      await saveTenantData(storage, 'a1', tenantA, { id: 'a1', name: 'AlphaOne' })
      await saveTenantData(storage, 'a2', tenantA, { id: 'a2', name: 'AlphaTwo' })
      // Tenant B saves one record
      await saveTenantData(storage, 'b1', tenantB, { id: 'b1', name: 'BetaOne' })
    })

    it('tenant A should only see its own records via listTenantData', async () => {
      const result = await listTenantData(storage, tenantA)
      expect(result).toHaveLength(2)
      expect(result.map((r) => r.id).sort()).toEqual(['a1', 'a2'])
    })

    it('tenant B should only see its own records via listTenantData', async () => {
      const result = await listTenantData(storage, tenantB)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('b1')
    })

    it('tenant B cannot read tenant A data via getTenantData', async () => {
      const result = await getTenantData(storage, 'a1', tenantB)
      expect(result).toBeNull()
    })

    it('tenant A cannot read tenant B data via getTenantData', async () => {
      const result = await getTenantData(storage, 'b1', tenantA)
      expect(result).toBeNull()
    })

    it('tenant B cannot delete tenant A data', async () => {
      const deleted = await deleteTenantData(storage, 'a1', tenantB)
      expect(deleted).toBe(false)
      // Verify still exists
      const record = await getTenantData(storage, 'a1', tenantA)
      expect(record).not.toBeNull()
    })

    it('tenant A cannot delete tenant B data', async () => {
      const deleted = await deleteTenantData(storage, 'b1', tenantA)
      expect(deleted).toBe(false)
      const record = await getTenantData(storage, 'b1', tenantB)
      expect(record).not.toBeNull()
    })

    it('query with tenantA filter should not return tenantB records', async () => {
      const result = await queryTenantData(storage, tenantA)
      const ids = result.data.map((r) => r.id)
      expect(ids).not.toContain('b1')
    })
  })
})
