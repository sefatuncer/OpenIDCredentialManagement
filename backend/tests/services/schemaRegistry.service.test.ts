/**
 * Schema Registry Service Tests
 */

import type { CredentialSchema } from '../../src/services/schemaRegistry.service'

// Shared in-memory store (survives module lazy cache)
const store = new Map<string, CredentialSchema>()

jest.mock('../../src/core/storage', () => ({
  createStorageAdapter: jest.fn(() => ({
    save: jest.fn(async (key: string, data: CredentialSchema) => { store.set(key, data) }),
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    delete: jest.fn(async (key: string) => { store.delete(key) }),
    list: jest.fn(async () => Array.from(store.values())),
    query: jest.fn(async () => ({ data: Array.from(store.values()), total: store.size, hasMore: false })),
    count: jest.fn(async () => store.size),
    exists: jest.fn(async (key: string) => store.has(key)),
    update: jest.fn(async (key: string, data: Partial<CredentialSchema>) => {
      const existing = store.get(key)
      if (!existing) return null
      const updated = { ...existing, ...data } as CredentialSchema
      store.set(key, updated)
      return updated
    }),
    clear: jest.fn(async () => { store.clear() }),
    getAdapterType: jest.fn(() => 'memory'),
  })),
}))

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

import { schemaRegistry } from '../../src/services/schemaRegistry.service'

describe('SchemaRegistryService', () => {
  beforeEach(() => {
    store.clear()
    jest.clearAllMocks()
  })

  describe('initialize', () => {
    it('should seed built-in schemas when storage is empty', async () => {
      await schemaRegistry.initialize()

      // 3 built-in schemas
      expect(store.size).toBe(3)
      expect(store.has('AIAgentIdentityCredential')).toBe(true)
      expect(store.has('DelegationCredential')).toBe(true)
      expect(store.has('CapabilityCredential')).toBe(true)
    })

    it('should not overwrite existing schemas on re-initialize', async () => {
      // First init
      await schemaRegistry.initialize()
      expect(store.size).toBe(3)

      // Modify one schema to prove it's not overwritten
      const existing = store.get('AIAgentIdentityCredential')!
      existing.description = 'MODIFIED'
      store.set('AIAgentIdentityCredential', existing)

      // Second init
      await schemaRegistry.initialize()

      // Should still have the modified description
      expect(store.get('AIAgentIdentityCredential')!.description).toBe('MODIFIED')
    })

    it('should log the total schema count after initialization', async () => {
      const { logger } = require('../../src/utils/logger')
      await schemaRegistry.initialize()

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('3 schemas')
      )
    })
  })

  describe('getAllSchemas', () => {
    it('should return only active schemas', async () => {
      await schemaRegistry.initialize()

      // Deactivate one
      const schema = store.get('DelegationCredential')!
      schema.active = false
      store.set('DelegationCredential', schema)

      const result = await schemaRegistry.getAllSchemas()
      expect(result).toHaveLength(2)
      expect(result.map(s => s.id)).not.toContain('DelegationCredential')
    })

    it('should return empty array when no active schemas exist', async () => {
      // No schemas in store
      const result = await schemaRegistry.getAllSchemas()
      expect(result).toEqual([])
    })
  })

  describe('getSchema', () => {
    it('should return a schema by ID', async () => {
      await schemaRegistry.initialize()
      const result = await schemaRegistry.getSchema('AIAgentIdentityCredential')
      expect(result).not.toBeNull()
      expect(result!.id).toBe('AIAgentIdentityCredential')
    })

    it('should return null for non-existent schema', async () => {
      const result = await schemaRegistry.getSchema('NonExistent')
      expect(result).toBeNull()
    })
  })

  describe('registerSchema', () => {
    it('should register a new schema with timestamps', async () => {
      const schema = {
        id: 'CustomSchema',
        name: 'Custom Schema',
        version: '1.0.0',
        type: 'CustomSchema',
        description: 'Test schema',
        properties: {},
        required: ['field1'],
        context: ['https://www.w3.org/2018/credentials/v1'],
        credentialSubject: { type: 'Custom', properties: {} },
        active: true,
      }

      const result = await schemaRegistry.registerSchema(schema)
      expect(result.id).toBe('CustomSchema')
      expect(result.createdAt).toBeDefined()
      expect(result.updatedAt).toBeDefined()
      expect(store.has('CustomSchema')).toBe(true)
    })

    it('should throw if schema ID already exists', async () => {
      await schemaRegistry.initialize()
      await expect(
        schemaRegistry.registerSchema({
          id: 'AIAgentIdentityCredential',
          name: 'Duplicate',
          version: '1.0.0',
          type: 'AIAgentIdentityCredential',
          description: 'Duplicate',
          properties: {},
          required: [],
          context: [],
          credentialSubject: { type: 'Test', properties: {} },
          active: true,
        })
      ).rejects.toThrow('already exists')
    })
  })

  describe('built-in schema structure', () => {
    it('should have correct structure for AIAgentIdentityCredential', async () => {
      await schemaRegistry.initialize()
      const schema = store.get('AIAgentIdentityCredential')!

      expect(schema.type).toBe('AIAgentIdentityCredential')
      expect(schema.version).toBe('1.0.0')
      expect(schema.active).toBe(true)
      expect(schema.credentialSubject.type).toBe('AIAgent')
      expect(schema.required).toContain('agentId')
      expect(schema.required).toContain('agentType')
    })

    it('should have correct issuanceConfig', async () => {
      await schemaRegistry.initialize()
      const schema = store.get('AIAgentIdentityCredential')!

      expect(schema.issuanceConfig?.revocable).toBe(true)
      expect(schema.issuanceConfig?.selectiveDisclosure).toBeDefined()
      expect(schema.issuanceConfig!.selectiveDisclosure!.length).toBeGreaterThan(0)
    })
  })
})
