/**
 * Storage Adapter Integration Tests
 *
 * Tests all storage adapter implementations against the IStorageAdapter interface.
 * These tests ensure consistent behavior across in-memory, PostgreSQL, and Redis adapters.
 */

import {
  IStorageAdapter,
  InMemoryStorageAdapterFactory,
  inMemoryStorageFactory,
} from '../../src/core/storage'

// Test data type - extends Record<string, unknown> for storage adapter compatibility
interface TestEntity extends Record<string, unknown> {
  id: string
  name: string
  type: string
  score: number
  active: boolean
  createdAt: Date
  metadata?: Record<string, unknown>
}

/**
 * Generic test suite that can be run against any storage adapter
 */
function runStorageAdapterTests(
  adapterName: string,
  createAdapter: () => Promise<IStorageAdapter<TestEntity>>,
  cleanup?: () => Promise<void>
) {
  describe(`${adapterName} Storage Adapter`, () => {
    let adapter: IStorageAdapter<TestEntity>

    beforeAll(async () => {
      adapter = await createAdapter()
    })

    afterAll(async () => {
      if (cleanup) {
        await cleanup()
      }
    })

    beforeEach(async () => {
      // Clear data before each test
      await adapter.clear()
    })

    describe('Basic CRUD Operations', () => {
      it('should save and retrieve an entity', async () => {
        const entity: TestEntity = {
          id: 'test-1',
          name: 'Test Entity',
          type: 'basic',
          score: 100,
          active: true,
          createdAt: new Date('2024-01-01T00:00:00Z'),
        }

        await adapter.save('test-1', entity)
        const retrieved = await adapter.get('test-1')

        expect(retrieved).not.toBeNull()
        expect(retrieved?.id).toBe('test-1')
        expect(retrieved?.name).toBe('Test Entity')
        expect(retrieved?.score).toBe(100)
        expect(retrieved?.active).toBe(true)
      })

      it('should return null for non-existent key', async () => {
        const result = await adapter.get('non-existent')
        expect(result).toBeNull()
      })

      it('should delete an entity', async () => {
        const entity: TestEntity = {
          id: 'delete-test',
          name: 'To Be Deleted',
          type: 'temp',
          score: 50,
          active: true,
          createdAt: new Date(),
        }

        await adapter.save('delete-test', entity)
        const deleted = await adapter.delete('delete-test')

        expect(deleted).toBe(true)
        expect(await adapter.get('delete-test')).toBeNull()
      })

      it('should return false when deleting non-existent entity', async () => {
        const result = await adapter.delete('non-existent')
        expect(result).toBe(false)
      })

      it('should update an existing entity', async () => {
        const entity: TestEntity = {
          id: 'update-test',
          name: 'Original Name',
          type: 'basic',
          score: 10,
          active: true,
          createdAt: new Date(),
        }

        await adapter.save('update-test', entity)
        const updated = await adapter.update('update-test', {
          name: 'Updated Name',
          score: 20,
        })

        expect(updated).not.toBeNull()
        expect(updated?.name).toBe('Updated Name')
        expect(updated?.score).toBe(20)
        expect(updated?.type).toBe('basic') // Unchanged
      })

      it('should return null when updating non-existent entity', async () => {
        const result = await adapter.update('non-existent', { name: 'New' })
        expect(result).toBeNull()
      })

      it('should check if entity exists', async () => {
        const entity: TestEntity = {
          id: 'exists-test',
          name: 'Exists',
          type: 'basic',
          score: 0,
          active: true,
          createdAt: new Date(),
        }

        expect(await adapter.exists('exists-test')).toBe(false)
        await adapter.save('exists-test', entity)
        expect(await adapter.exists('exists-test')).toBe(true)
      })
    })

    describe('List and Query Operations', () => {
      const testEntities: TestEntity[] = [
        {
          id: 'entity-1',
          name: 'Alpha',
          type: 'typeA',
          score: 100,
          active: true,
          createdAt: new Date('2024-01-01'),
        },
        {
          id: 'entity-2',
          name: 'Beta',
          type: 'typeB',
          score: 200,
          active: true,
          createdAt: new Date('2024-02-01'),
        },
        {
          id: 'entity-3',
          name: 'Gamma',
          type: 'typeA',
          score: 150,
          active: false,
          createdAt: new Date('2024-03-01'),
        },
        {
          id: 'other-1',
          name: 'Delta',
          type: 'typeB',
          score: 50,
          active: true,
          createdAt: new Date('2024-04-01'),
        },
      ]

      beforeEach(async () => {
        await adapter.clear()
        for (const entity of testEntities) {
          await adapter.save(entity.id, entity)
        }
      })

      it('should list all entities', async () => {
        const list = await adapter.list()
        expect(list).toHaveLength(4)
      })

      it('should list entities with prefix filter', async () => {
        const list = await adapter.list('entity')
        expect(list).toHaveLength(3)
        expect(list.every((e) => e.id.startsWith('entity'))).toBe(true)
      })

      it('should count all entities', async () => {
        const count = await adapter.count()
        expect(count).toBe(4)
      })

      it('should query with where filter', async () => {
        const result = await adapter.query({
          where: { type: 'typeA' },
        })

        expect(result.data).toHaveLength(2)
        expect(result.total).toBe(2)
        expect(result.data.every((e) => e.type === 'typeA')).toBe(true)
      })

      it('should query with boolean filter', async () => {
        const result = await adapter.query({
          where: { active: false },
        })

        expect(result.data).toHaveLength(1)
        expect(result.data[0].name).toBe('Gamma')
      })

      it('should query with pagination', async () => {
        const result = await adapter.query({
          limit: 2,
          offset: 1,
        })

        expect(result.data).toHaveLength(2)
        expect(result.hasMore).toBe(true)
      })

      it('should query with ascending sort', async () => {
        const result = await adapter.query({
          orderBy: 'score',
        })

        expect(result.data[0].score).toBeLessThanOrEqual(result.data[1].score)
      })

      it('should query with descending sort', async () => {
        const result = await adapter.query({
          orderBy: '-score',
        })

        expect(result.data[0].score).toBeGreaterThanOrEqual(result.data[1].score)
      })

      it('should count with filter', async () => {
        const count = await adapter.count({
          where: { active: true },
        })
        expect(count).toBe(3)
      })
    })

    describe('Complex Data Handling', () => {
      it('should handle nested metadata', async () => {
        const entity: TestEntity = {
          id: 'nested-test',
          name: 'Nested',
          type: 'complex',
          score: 0,
          active: true,
          createdAt: new Date(),
          metadata: {
            nested: {
              deep: {
                value: 'test',
              },
            },
            array: [1, 2, 3],
          },
        }

        await adapter.save('nested-test', entity)
        const retrieved = await adapter.get('nested-test')

        expect(retrieved?.metadata?.nested).toEqual({ deep: { value: 'test' } })
        expect(retrieved?.metadata?.array).toEqual([1, 2, 3])
      })

      it('should handle special characters in keys', async () => {
        const entity: TestEntity = {
          id: 'special:key/with.chars',
          name: 'Special',
          type: 'test',
          score: 0,
          active: true,
          createdAt: new Date(),
        }

        await adapter.save('special:key/with.chars', entity)
        const retrieved = await adapter.get('special:key/with.chars')

        expect(retrieved).not.toBeNull()
        expect(retrieved?.name).toBe('Special')
      })

      it('should handle empty strings', async () => {
        const entity: TestEntity = {
          id: 'empty-string-test',
          name: '',
          type: '',
          score: 0,
          active: true,
          createdAt: new Date(),
        }

        await adapter.save('empty-string-test', entity)
        const retrieved = await adapter.get('empty-string-test')

        expect(retrieved?.name).toBe('')
        expect(retrieved?.type).toBe('')
      })
    })

    describe('Overwrite Behavior', () => {
      it('should overwrite existing entity with same key', async () => {
        const entity1: TestEntity = {
          id: 'overwrite-test',
          name: 'First',
          type: 'v1',
          score: 10,
          active: true,
          createdAt: new Date(),
        }

        const entity2: TestEntity = {
          id: 'overwrite-test',
          name: 'Second',
          type: 'v2',
          score: 20,
          active: false,
          createdAt: new Date(),
        }

        await adapter.save('overwrite-test', entity1)
        await adapter.save('overwrite-test', entity2)

        const retrieved = await adapter.get('overwrite-test')
        expect(retrieved?.name).toBe('Second')
        expect(retrieved?.type).toBe('v2')
        expect(retrieved?.score).toBe(20)
      })
    })

    describe('Clear Operation', () => {
      it('should clear all data in collection', async () => {
        await adapter.save('clear-1', {
          id: 'clear-1',
          name: 'A',
          type: 't',
          score: 0,
          active: true,
          createdAt: new Date(),
        })
        await adapter.save('clear-2', {
          id: 'clear-2',
          name: 'B',
          type: 't',
          score: 0,
          active: true,
          createdAt: new Date(),
        })

        expect(await adapter.count()).toBe(2)

        await adapter.clear()

        expect(await adapter.count()).toBe(0)
        expect(await adapter.list()).toHaveLength(0)
      })
    })

    describe('Adapter Type', () => {
      it('should return correct adapter type', () => {
        const type = adapter.getAdapterType()
        expect(typeof type).toBe('string')
        expect(type.length).toBeGreaterThan(0)
      })
    })
  })
}

// Run tests for In-Memory Storage Adapter
runStorageAdapterTests(
  'InMemory',
  async () => {
    const factory = new InMemoryStorageAdapterFactory()
    await factory.initialize()
    return factory.create<TestEntity>('test_entities')
  },
  async () => {
    // No cleanup needed for in-memory
  }
)

// Test storage factory functions
describe('Storage Factory', () => {
  it('should create adapter for collection', () => {
    const adapter = inMemoryStorageFactory.create<TestEntity>('factory_test')
    expect(adapter).toBeDefined()
    expect(adapter.getAdapterType()).toBe('memory')
  })

  it('should return same adapter for same collection', () => {
    const adapter1 = inMemoryStorageFactory.create<TestEntity>('same_collection')
    const adapter2 = inMemoryStorageFactory.create<TestEntity>('same_collection')
    expect(adapter1).toBe(adapter2)
  })

  it('should return different adapters for different collections', () => {
    const adapter1 = inMemoryStorageFactory.create<TestEntity>('collection_a')
    const adapter2 = inMemoryStorageFactory.create<TestEntity>('collection_b')
    expect(adapter1).not.toBe(adapter2)
  })

  it('should report availability', async () => {
    const available = await inMemoryStorageFactory.isAvailable()
    expect(available).toBe(true)
  })

  it('should report storage type', () => {
    const type = inMemoryStorageFactory.getStorageType()
    expect(type).toBe('memory')
  })
})

// Test date range queries
describe('Date Range Queries', () => {
  let adapter: IStorageAdapter<TestEntity>

  beforeAll(async () => {
    const factory = new InMemoryStorageAdapterFactory()
    await factory.initialize()
    adapter = factory.create<TestEntity>('date_range_test')
  })

  beforeEach(async () => {
    await adapter.clear()

    // Add entities with different dates
    const entities: TestEntity[] = [
      {
        id: 'jan',
        name: 'January',
        type: 't',
        score: 0,
        active: true,
        createdAt: new Date('2024-01-15'),
      },
      {
        id: 'feb',
        name: 'February',
        type: 't',
        score: 0,
        active: true,
        createdAt: new Date('2024-02-15'),
      },
      {
        id: 'mar',
        name: 'March',
        type: 't',
        score: 0,
        active: true,
        createdAt: new Date('2024-03-15'),
      },
      {
        id: 'apr',
        name: 'April',
        type: 't',
        score: 0,
        active: true,
        createdAt: new Date('2024-04-15'),
      },
    ]

    for (const e of entities) {
      await adapter.save(e.id, e)
    }
  })

  it('should filter by date range with start and end', async () => {
    const result = await adapter.query({
      dateRange: {
        field: 'createdAt',
        start: new Date('2024-02-01'),
        end: new Date('2024-03-31'),
      },
    })

    expect(result.data).toHaveLength(2)
    expect(result.data.map((e) => e.id).sort()).toEqual(['feb', 'mar'])
  })

  it('should filter by date range with only start', async () => {
    const result = await adapter.query({
      dateRange: {
        field: 'createdAt',
        start: new Date('2024-03-01'),
      },
    })

    expect(result.data).toHaveLength(2)
    expect(result.data.map((e) => e.id).sort()).toEqual(['apr', 'mar'])
  })

  it('should filter by date range with only end', async () => {
    const result = await adapter.query({
      dateRange: {
        field: 'createdAt',
        end: new Date('2024-02-28'),
      },
    })

    expect(result.data).toHaveLength(2)
    expect(result.data.map((e) => e.id).sort()).toEqual(['feb', 'jan'])
  })
})

// Test combined filters
describe('Combined Query Filters', () => {
  let adapter: IStorageAdapter<TestEntity>

  beforeAll(async () => {
    const factory = new InMemoryStorageAdapterFactory()
    await factory.initialize()
    adapter = factory.create<TestEntity>('combined_query_test')
  })

  beforeEach(async () => {
    await adapter.clear()

    const entities: TestEntity[] = [
      {
        id: 'e1',
        name: 'A',
        type: 'x',
        score: 100,
        active: true,
        createdAt: new Date('2024-01-01'),
      },
      {
        id: 'e2',
        name: 'B',
        type: 'x',
        score: 200,
        active: false,
        createdAt: new Date('2024-02-01'),
      },
      {
        id: 'e3',
        name: 'C',
        type: 'y',
        score: 150,
        active: true,
        createdAt: new Date('2024-03-01'),
      },
      {
        id: 'e4',
        name: 'D',
        type: 'y',
        score: 50,
        active: true,
        createdAt: new Date('2024-04-01'),
      },
    ]

    for (const e of entities) {
      await adapter.save(e.id, e)
    }
  })

  it('should combine where filter with sorting', async () => {
    const result = await adapter.query({
      where: { type: 'y' },
      orderBy: '-score',
    })

    expect(result.data).toHaveLength(2)
    expect(result.data[0].name).toBe('C')
    expect(result.data[1].name).toBe('D')
  })

  it('should combine where filter with pagination', async () => {
    const result = await adapter.query({
      where: { active: true },
      limit: 2,
      offset: 1,
    })

    expect(result.data).toHaveLength(2)
    expect(result.total).toBe(3)
    expect(result.hasMore).toBe(false)
  })

  it('should combine all filters', async () => {
    const result = await adapter.query({
      where: { active: true },
      dateRange: {
        field: 'createdAt',
        start: new Date('2024-02-01'),
      },
      orderBy: 'score',
      limit: 10,
    })

    expect(result.data).toHaveLength(2)
    expect(result.data[0].name).toBe('D') // score 50
    expect(result.data[1].name).toBe('C') // score 150
  })
})
