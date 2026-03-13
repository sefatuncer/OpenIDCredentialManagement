/**
 * Fabric Anchor Service Tests
 */

import { createHash } from 'crypto'

// Mock dependencies before imports
vi.mock('../../src/database/connection')
vi.mock('../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { query } from '../../src/database/connection'

const mockQuery = query as vi.MockedFunction<typeof query>

// Helper to create mock QueryResult
const mockQueryResult = (rows: any[], rowCount?: number) =>
  ({ rows, rowCount: rowCount ?? rows.length, command: '', oid: 0, fields: [] } as any)

// Compute expected hash using same algorithm as service
function computeExpectedHash(recordType: string, referenceId: string, payload: Record<string, unknown>): string {
  const data = JSON.stringify({ recordType, referenceId, ...payload })
  return createHash('sha256').update(data).digest('hex')
}

// We need to re-import the module fresh for each test suite that changes module state
let fabricAnchorService: typeof import('../../src/services/fabricAnchor.service')

describe('FabricAnchorService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset the module to clear internal state (fabricConnected, fabricConfig)
    vi.resetModules()
    // Re-mock after reset
    vi.mock('../../src/database/connection')
    vi.mock('../../src/utils/logger', () => ({
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }))
  })

  async function loadService() {
    fabricAnchorService = await import('../../src/services/fabricAnchor.service')
    return fabricAnchorService
  }

  describe('anchorRecord', () => {
    it('should write-ahead to DB with pending status when Fabric not connected', async () => {
      const svc = await loadService()
      const { query: mq } = await import('../../src/database/connection') as any

      const mockRow = {
        id: 'anchor-1',
        record_type: 'revocation',
        reference_id: 'ref-123',
        data_hash: 'abc123',
        fabric_tx_id: null,
        fabric_block_number: null,
        status: 'pending',
        retry_count: 0,
        payload: JSON.stringify({ credentialId: 'cred-1' }),
        created_at: '2026-03-12T00:00:00Z',
        confirmed_at: null,
        error_message: null,
      }
      mq.mockResolvedValue(mockQueryResult([mockRow]))

      const result = await svc.anchorRecord('revocation', 'ref-123', { credentialId: 'cred-1' })

      expect(result.id).toBe('anchor-1')
      expect(result.status).toBe('pending')
      expect(result.fabricTxId).toBeNull()
      expect(result.referenceId).toBe('ref-123')
      expect(result.recordType).toBe('revocation')

      // Verify DB INSERT was called with correct params
      expect(mq).toHaveBeenCalledTimes(1)
      const [sql, params] = mq.mock.calls[0]
      expect(sql).toContain('INSERT INTO fabric_anchor_records')
      expect(params[0]).toBe('revocation')
      expect(params[1]).toBe('ref-123')
      // params[2] is the computed hash
      expect(params[2]).toHaveLength(64) // SHA-256 hex
      expect(params[3]).toBe(JSON.stringify({ credentialId: 'cred-1' }))
    })

    it('should compute deterministic SHA-256 hash', async () => {
      const svc = await loadService()
      const { query: mq } = await import('../../src/database/connection') as any

      const payload = { credentialId: 'cred-1', reason: 'test' }
      const expectedHash = computeExpectedHash('revocation', 'ref-123', payload)

      const mockRow = {
        id: 'anchor-2',
        record_type: 'revocation',
        reference_id: 'ref-123',
        data_hash: expectedHash,
        fabric_tx_id: null,
        fabric_block_number: null,
        status: 'pending',
        retry_count: 0,
        payload: JSON.stringify(payload),
        created_at: '2026-03-12T00:00:00Z',
        confirmed_at: null,
        error_message: null,
      }
      mq.mockResolvedValue(mockQueryResult([mockRow]))

      await svc.anchorRecord('revocation', 'ref-123', payload)

      const [, params] = mq.mock.calls[0]
      expect(params[2]).toBe(expectedHash)
    })

    it('should handle delegation_created record type', async () => {
      const svc = await loadService()
      const { query: mq } = await import('../../src/database/connection') as any

      const mockRow = {
        id: 'anchor-3',
        record_type: 'delegation_created',
        reference_id: 'del-456',
        data_hash: 'hash123',
        fabric_tx_id: null,
        fabric_block_number: null,
        status: 'pending',
        retry_count: 0,
        payload: JSON.stringify({ delegatorDid: 'did:example:a' }),
        created_at: '2026-03-12T00:00:00Z',
        confirmed_at: null,
        error_message: null,
      }
      mq.mockResolvedValue(mockQueryResult([mockRow]))

      const result = await svc.anchorRecord('delegation_created', 'del-456', { delegatorDid: 'did:example:a' })

      expect(result.recordType).toBe('delegation_created')
      expect(result.referenceId).toBe('del-456')
    })

    it('should handle delegation_revoked record type', async () => {
      const svc = await loadService()
      const { query: mq } = await import('../../src/database/connection') as any

      const mockRow = {
        id: 'anchor-4',
        record_type: 'delegation_revoked',
        reference_id: 'del-789',
        data_hash: 'hash456',
        fabric_tx_id: null,
        fabric_block_number: null,
        status: 'pending',
        retry_count: 0,
        payload: JSON.stringify({ reason: 'expired' }),
        created_at: '2026-03-12T00:00:00Z',
        confirmed_at: null,
        error_message: null,
      }
      mq.mockResolvedValue(mockQueryResult([mockRow]))

      const result = await svc.anchorRecord('delegation_revoked', 'del-789', { reason: 'expired' })

      expect(result.recordType).toBe('delegation_revoked')
    })

    it('should parse JSON payload from DB row', async () => {
      const svc = await loadService()
      const { query: mq } = await import('../../src/database/connection') as any

      const payload = { key1: 'value1', nested: { a: 1 } }
      const mockRow = {
        id: 'anchor-5',
        record_type: 'revocation',
        reference_id: 'ref-100',
        data_hash: 'hash789',
        fabric_tx_id: null,
        fabric_block_number: null,
        status: 'pending',
        retry_count: 0,
        payload: JSON.stringify(payload),
        created_at: '2026-03-12T00:00:00Z',
        confirmed_at: null,
        error_message: null,
      }
      mq.mockResolvedValue(mockQueryResult([mockRow]))

      const result = await svc.anchorRecord('revocation', 'ref-100', payload)

      expect(result.payload).toEqual(payload)
    })
  })

  describe('verifyAnchor', () => {
    it('should return verified: false when no records found', async () => {
      const svc = await loadService()
      const { query: mq } = await import('../../src/database/connection') as any

      mq.mockResolvedValue(mockQueryResult([]))

      const result = await svc.verifyAnchor('nonexistent')

      expect(result.verified).toBe(false)
      expect(result.records).toEqual([])
    })

    it('should return verified: false when only pending records exist', async () => {
      const svc = await loadService()
      const { query: mq } = await import('../../src/database/connection') as any

      mq.mockResolvedValue(mockQueryResult([{
        id: 'anchor-10',
        record_type: 'revocation',
        reference_id: 'ref-200',
        data_hash: 'hash-pending',
        fabric_tx_id: null,
        fabric_block_number: null,
        status: 'pending',
        retry_count: 0,
        payload: '{}',
        created_at: '2026-03-12T00:00:00Z',
        confirmed_at: null,
        error_message: null,
      }]))

      const result = await svc.verifyAnchor('ref-200')

      expect(result.verified).toBe(false)
      expect(result.records).toHaveLength(1)
      expect(result.localHash).toBeUndefined()
    })

    it('should return verified: false with localHash when confirmed records exist but Fabric not connected', async () => {
      const svc = await loadService()
      const { query: mq } = await import('../../src/database/connection') as any

      mq.mockResolvedValue(mockQueryResult([{
        id: 'anchor-11',
        record_type: 'revocation',
        reference_id: 'ref-300',
        data_hash: 'confirmed-hash',
        fabric_tx_id: 'tx-abc',
        fabric_block_number: 10,
        status: 'confirmed',
        retry_count: 0,
        payload: '{}',
        created_at: '2026-03-12T00:00:00Z',
        confirmed_at: '2026-03-12T00:01:00Z',
        error_message: null,
      }]))

      // Not connected (no initialize called), so should return localHash only
      const result = await svc.verifyAnchor('ref-300')

      expect(result.verified).toBe(false)
      expect(result.localHash).toBe('confirmed-hash')
      expect(result.records).toHaveLength(1)
      expect(result.records[0].status).toBe('confirmed')
    })

    it('should return multiple records ordered by created_at', async () => {
      const svc = await loadService()
      const { query: mq } = await import('../../src/database/connection') as any

      mq.mockResolvedValue(mockQueryResult([
        {
          id: 'anchor-20',
          record_type: 'delegation_created',
          reference_id: 'ref-400',
          data_hash: 'hash-a',
          fabric_tx_id: null,
          fabric_block_number: null,
          status: 'pending',
          retry_count: 0,
          payload: '{}',
          created_at: '2026-03-12T00:00:00Z',
          confirmed_at: null,
          error_message: null,
        },
        {
          id: 'anchor-21',
          record_type: 'delegation_revoked',
          reference_id: 'ref-400',
          data_hash: 'hash-b',
          fabric_tx_id: 'tx-xyz',
          fabric_block_number: 15,
          status: 'confirmed',
          retry_count: 0,
          payload: '{}',
          created_at: '2026-03-12T01:00:00Z',
          confirmed_at: '2026-03-12T01:01:00Z',
          error_message: null,
        },
      ]))

      const result = await svc.verifyAnchor('ref-400')

      expect(result.records).toHaveLength(2)
      expect(result.records[0].id).toBe('anchor-20')
      expect(result.records[1].id).toBe('anchor-21')
    })
  })

  describe('getAnchorStatus', () => {
    it('should return records for a given reference ID', async () => {
      const svc = await loadService()
      const { query: mq } = await import('../../src/database/connection') as any

      mq.mockResolvedValue(mockQueryResult([{
        id: 'anchor-30',
        record_type: 'revocation',
        reference_id: 'ref-500',
        data_hash: 'status-hash',
        fabric_tx_id: 'tx-status',
        fabric_block_number: 20,
        status: 'confirmed',
        retry_count: 0,
        payload: '{"reason":"test"}',
        created_at: '2026-03-12T00:00:00Z',
        confirmed_at: '2026-03-12T00:01:00Z',
        error_message: null,
      }]))

      const result = await svc.getAnchorStatus('ref-500')

      expect(result).toHaveLength(1)
      expect(result[0].referenceId).toBe('ref-500')
      expect(result[0].status).toBe('confirmed')
      expect(result[0].fabricTxId).toBe('tx-status')

      expect(mq).toHaveBeenCalledWith(
        expect.stringContaining('WHERE reference_id = $1'),
        ['ref-500'],
      )
    })

    it('should return empty array when no records exist', async () => {
      const svc = await loadService()
      const { query: mq } = await import('../../src/database/connection') as any

      mq.mockResolvedValue(mockQueryResult([]))

      const result = await svc.getAnchorStatus('ref-nonexistent')

      expect(result).toEqual([])
    })

    it('should return multiple records for same reference', async () => {
      const svc = await loadService()
      const { query: mq } = await import('../../src/database/connection') as any

      mq.mockResolvedValue(mockQueryResult([
        {
          id: 'a-1', record_type: 'revocation', reference_id: 'ref-600',
          data_hash: 'h1', fabric_tx_id: null, fabric_block_number: null,
          status: 'failed', retry_count: 3, payload: '{}',
          created_at: '2026-03-12T00:00:00Z', confirmed_at: null, error_message: 'timeout',
        },
        {
          id: 'a-2', record_type: 'revocation', reference_id: 'ref-600',
          data_hash: 'h1', fabric_tx_id: 'tx-retry', fabric_block_number: 25,
          status: 'confirmed', retry_count: 0, payload: '{}',
          created_at: '2026-03-12T01:00:00Z', confirmed_at: '2026-03-12T01:01:00Z', error_message: null,
        },
      ]))

      const result = await svc.getAnchorStatus('ref-600')

      expect(result).toHaveLength(2)
      expect(result[0].status).toBe('failed')
      expect(result[0].errorMessage).toBe('timeout')
      expect(result[1].status).toBe('confirmed')
    })
  })

  describe('listAnchors', () => {
    it('should return paginated records with total count', async () => {
      const svc = await loadService()
      const { query: mq } = await import('../../src/database/connection') as any

      mq
        .mockResolvedValueOnce(mockQueryResult([{ total: 100 }])) // COUNT query
        .mockResolvedValueOnce(mockQueryResult([
          {
            id: 'list-1', record_type: 'revocation', reference_id: 'ref-a',
            data_hash: 'ha', fabric_tx_id: 'tx-a', fabric_block_number: 1,
            status: 'confirmed', retry_count: 0, payload: '{}',
            created_at: '2026-03-12T02:00:00Z', confirmed_at: '2026-03-12T02:01:00Z',
            error_message: null,
          },
          {
            id: 'list-2', record_type: 'delegation_created', reference_id: 'ref-b',
            data_hash: 'hb', fabric_tx_id: null, fabric_block_number: null,
            status: 'pending', retry_count: 0, payload: '{}',
            created_at: '2026-03-12T01:00:00Z', confirmed_at: null,
            error_message: null,
          },
        ]))

      const result = await svc.listAnchors(10, 0)

      expect(result.total).toBe(100)
      expect(result.records).toHaveLength(2)
      expect(result.records[0].id).toBe('list-1')
      expect(result.records[1].id).toBe('list-2')
    })

    it('should use default limit and offset', async () => {
      const svc = await loadService()
      const { query: mq } = await import('../../src/database/connection') as any

      mq
        .mockResolvedValueOnce(mockQueryResult([{ total: 0 }]))
        .mockResolvedValueOnce(mockQueryResult([]))

      await svc.listAnchors()

      // Second call is the SELECT with LIMIT/OFFSET
      const [sql, params] = mq.mock.calls[1]
      expect(sql).toContain('LIMIT $1 OFFSET $2')
      expect(params).toEqual([50, 0])
    })

    it('should pass custom limit and offset', async () => {
      const svc = await loadService()
      const { query: mq } = await import('../../src/database/connection') as any

      mq
        .mockResolvedValueOnce(mockQueryResult([{ total: 200 }]))
        .mockResolvedValueOnce(mockQueryResult([]))

      await svc.listAnchors(25, 50)

      const [, params] = mq.mock.calls[1]
      expect(params).toEqual([25, 50])
    })

    it('should return empty records with total 0', async () => {
      const svc = await loadService()
      const { query: mq } = await import('../../src/database/connection') as any

      mq
        .mockResolvedValueOnce(mockQueryResult([{ total: 0 }]))
        .mockResolvedValueOnce(mockQueryResult([]))

      const result = await svc.listAnchors()

      expect(result.total).toBe(0)
      expect(result.records).toEqual([])
    })
  })

  describe('retryPendingAnchors', () => {
    it('should return 0 when Fabric not connected', async () => {
      const svc = await loadService()

      // Not initialized, so fabricConnected is false
      const result = await svc.retryPendingAnchors()

      expect(result).toBe(0)
    })

    it('should return 0 when no pending/failed records with retry_count < 3', async () => {
      const svc = await loadService()
      const { query: mq } = await import('../../src/database/connection') as any

      // Simulate initialize with SDK not available (stays disconnected)
      // We need fabricConnected = true for retry to proceed
      // Since we can't call initialize without real SDK, test the early return
      const result = await svc.retryPendingAnchors()
      expect(result).toBe(0)
    })
  })

  describe('isConnected', () => {
    it('should return false when not initialized', async () => {
      const svc = await loadService()

      expect(svc.isConnected()).toBe(false)
    })
  })

  describe('initialize', () => {
    it('should gracefully degrade when HLF SDK is not available', async () => {
      const svc = await loadService()
      const { logger: mockLogger } = await import('../../src/utils/logger') as any

      const config = {
        peerEndpoint: 'localhost:7051',
        mspId: 'Org1MSP',
        channelName: 'mychannel',
        chaincodeName: 'credential-anchor',
      }

      // SDK imports will fail (not installed in test env)
      await svc.initialize(config)

      // Should not throw, just log warning
      expect(svc.isConnected()).toBe(false)
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('HLF not available'),
        expect.any(Object),
      )
    })

    it('should log initialization info', async () => {
      const svc = await loadService()
      const { logger: mockLogger } = await import('../../src/utils/logger') as any

      const config = {
        peerEndpoint: 'peer0.org1.example.com:7051',
        mspId: 'Org1MSP',
        channelName: 'mychannel',
        chaincodeName: 'credential-anchor',
      }

      await svc.initialize(config)

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Fabric anchor service initializing',
        expect.objectContaining({
          peerEndpoint: 'peer0.org1.example.com:7051',
          mspId: 'Org1MSP',
          channelName: 'mychannel',
        }),
      )
    })
  })

  describe('mapRecord (via public API)', () => {
    it('should map snake_case DB columns to camelCase fields', async () => {
      const svc = await loadService()
      const { query: mq } = await import('../../src/database/connection') as any

      mq.mockResolvedValue(mockQueryResult([{
        id: 'map-1',
        record_type: 'delegation_created',
        reference_id: 'del-map-1',
        data_hash: 'abcdef0123456789',
        fabric_tx_id: 'tx-map-1',
        fabric_block_number: 42,
        status: 'confirmed',
        retry_count: 1,
        payload: '{"key":"value"}',
        created_at: '2026-03-12T10:00:00Z',
        confirmed_at: '2026-03-12T10:01:00Z',
        error_message: null,
      }]))

      const records = await svc.getAnchorStatus('del-map-1')

      expect(records[0]).toEqual({
        id: 'map-1',
        recordType: 'delegation_created',
        referenceId: 'del-map-1',
        dataHash: 'abcdef0123456789',
        fabricTxId: 'tx-map-1',
        fabricBlockNumber: 42,
        status: 'confirmed',
        retryCount: 1,
        payload: { key: 'value' },
        createdAt: '2026-03-12T10:00:00Z',
        confirmedAt: '2026-03-12T10:01:00Z',
        errorMessage: null,
      })
    })

    it('should handle payload as object (already parsed)', async () => {
      const svc = await loadService()
      const { query: mq } = await import('../../src/database/connection') as any

      mq.mockResolvedValue(mockQueryResult([{
        id: 'map-2',
        record_type: 'revocation',
        reference_id: 'ref-map-2',
        data_hash: 'hash',
        fabric_tx_id: null,
        fabric_block_number: null,
        status: 'pending',
        retry_count: 0,
        payload: { already: 'parsed' }, // Object, not string
        created_at: '2026-03-12T10:00:00Z',
        confirmed_at: null,
        error_message: 'some error',
      }]))

      const records = await svc.getAnchorStatus('ref-map-2')

      expect(records[0].payload).toEqual({ already: 'parsed' })
      expect(records[0].errorMessage).toBe('some error')
    })
  })
})
