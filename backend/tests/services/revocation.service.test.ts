/**
 * Revocation Service Tests
 * Tests for Status List 2021 implementation
 */

import {
  createStatusList,
  getOrCreateStatusList,
  allocateStatusEntry,
  revokeCredential,
  unrevokeCredential,
  isCredentialRevoked,
  checkStatusListEntry,
  getCredentialStatus,
  getStatusList,
  getStatusListsForIssuer,
  getRevocationStats,
  exportRevocationData,
  importRevocationData,
  StatusList,
  CredentialStatus,
} from '../../src/services/revocation.service'
import { isFeatureEnabled, requireFeature } from '../../src/core/feature-flags'
import { createStorageAdapter, getStorageType, IStorageAdapter } from '../../src/core/storage'
import { eventBus } from '../../src/core/event-bus'

// Mock dependencies
jest.mock('../../src/core/feature-flags')
jest.mock('../../src/core/storage')
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

const mockIsFeatureEnabled = isFeatureEnabled as jest.MockedFunction<typeof isFeatureEnabled>
const mockRequireFeature = requireFeature as jest.MockedFunction<typeof requireFeature>
const mockCreateStorageAdapter = createStorageAdapter as jest.MockedFunction<typeof createStorageAdapter>
const mockGetStorageType = getStorageType as jest.MockedFunction<typeof getStorageType>
const mockEventBus = eventBus as jest.Mocked<typeof eventBus>

describe('RevocationService', () => {
  const testIssuerId = 'did:example:issuer123'
  const testCredentialId = 'urn:uuid:credential-123'

  // Mock storage adapters
  let mockStatusListsStorage: jest.Mocked<IStorageAdapter<StatusList>>
  let mockCredentialStatusesStorage: jest.Mocked<IStorageAdapter<CredentialStatus>>

  beforeEach(() => {
    jest.clearAllMocks()

    // Setup mock storage adapters
    mockStatusListsStorage = {
      save: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(true),
      list: jest.fn().mockResolvedValue([]),
      query: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      clear: jest.fn().mockResolvedValue(undefined),
    }

    mockCredentialStatusesStorage = {
      save: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(true),
      list: jest.fn().mockResolvedValue([]),
      query: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      clear: jest.fn().mockResolvedValue(undefined),
    }

    mockCreateStorageAdapter.mockImplementation((name: string) => {
      if (name === 'status_lists') return mockStatusListsStorage as any
      if (name === 'credential_statuses') return mockCredentialStatusesStorage as any
      return {} as any
    })

    mockGetStorageType.mockReturnValue('memory')
    mockIsFeatureEnabled.mockReturnValue(true)
    mockRequireFeature.mockImplementation(() => {})
  })

  describe('createStatusList', () => {
    it('should create a new status list', async () => {
      const result = await createStatusList(testIssuerId)

      expect(result).toMatchObject({
        issuer: testIssuerId,
        size: 131072, // Default size
        usedIndices: [],
      })
      expect(result.id).toMatch(/^urn:uuid:/)
      expect(result.encodedList).toBeDefined()
      expect(mockStatusListsStorage.save).toHaveBeenCalled()
    })

    it('should create a status list with custom size', async () => {
      const customSize = 1024

      const result = await createStatusList(testIssuerId, customSize)

      expect(result.size).toBe(customSize)
    })

    it('should throw if revocation feature is disabled', async () => {
      mockRequireFeature.mockImplementation(() => {
        throw new Error('Feature disabled')
      })

      await expect(createStatusList(testIssuerId)).rejects.toThrow('Feature disabled')
    })
  })

  describe('getOrCreateStatusList', () => {
    it('should return existing list with available space', async () => {
      const existingList: StatusList = {
        id: 'urn:uuid:existing-list',
        issuer: testIssuerId,
        encodedList: Buffer.alloc(16384).toString('base64'),
        size: 131072,
        usedIndices: [0, 1, 2],
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockStatusListsStorage.list.mockResolvedValue([existingList])

      const result = await getOrCreateStatusList(testIssuerId)

      expect(result.id).toBe(existingList.id)
      expect(mockStatusListsStorage.save).not.toHaveBeenCalled()
    })

    it('should create new list if none exists', async () => {
      mockStatusListsStorage.list.mockResolvedValue([])

      const result = await getOrCreateStatusList(testIssuerId)

      expect(result.issuer).toBe(testIssuerId)
      expect(mockStatusListsStorage.save).toHaveBeenCalled()
    })

    it('should return dummy list if revocation is disabled', async () => {
      mockIsFeatureEnabled.mockReturnValue(false)

      const result = await getOrCreateStatusList(testIssuerId)

      expect(result.id).toBe('disabled')
      expect(result.size).toBe(0)
    })
  })

  describe('allocateStatusEntry', () => {
    it('should allocate a new status entry', async () => {
      const statusList: StatusList = {
        id: 'urn:uuid:list-123',
        issuer: testIssuerId,
        encodedList: Buffer.alloc(16384).toString('base64'),
        size: 131072,
        usedIndices: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockStatusListsStorage.list.mockResolvedValue([statusList])
      mockStatusListsStorage.get.mockResolvedValue(statusList)

      const result = await allocateStatusEntry(testIssuerId, testCredentialId)

      expect(result).toMatchObject({
        type: 'StatusList2021Entry',
        statusPurpose: 'revocation',
        statusListIndex: '0',
        statusListCredential: statusList.id,
      })
      expect(mockCredentialStatusesStorage.save).toHaveBeenCalledWith(
        testCredentialId,
        expect.objectContaining({
          credentialId: testCredentialId,
          statusListIndex: 0,
          revoked: false,
        })
      )
    })

    it('should find next available index', async () => {
      const statusList: StatusList = {
        id: 'urn:uuid:list-123',
        issuer: testIssuerId,
        encodedList: Buffer.alloc(16384).toString('base64'),
        size: 131072,
        usedIndices: [0, 1, 2],
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockStatusListsStorage.list.mockResolvedValue([statusList])
      mockStatusListsStorage.get.mockResolvedValue(statusList)

      const result = await allocateStatusEntry(testIssuerId, testCredentialId)

      expect(result.statusListIndex).toBe('3')
    })

    it('should throw if status list is full', async () => {
      const fullList: StatusList = {
        id: 'urn:uuid:full-list',
        issuer: testIssuerId,
        encodedList: Buffer.alloc(1).toString('base64'),
        size: 8,
        usedIndices: [0, 1, 2, 3, 4, 5, 6, 7],
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockStatusListsStorage.list.mockResolvedValue([fullList])
      mockStatusListsStorage.get.mockResolvedValue(fullList)

      await expect(allocateStatusEntry(testIssuerId, testCredentialId)).rejects.toThrow(
        'Status list is full'
      )
    })
  })

  describe('revokeCredential', () => {
    const mockCredentialStatus: CredentialStatus = {
      credentialId: testCredentialId,
      statusListId: 'urn:uuid:list-123',
      statusListIndex: 5,
      revoked: false,
    }

    const mockStatusList: StatusList = {
      id: 'urn:uuid:list-123',
      issuer: testIssuerId,
      encodedList: Buffer.alloc(16384).toString('base64'),
      size: 131072,
      usedIndices: [5],
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    it('should revoke a credential', async () => {
      mockCredentialStatusesStorage.get.mockResolvedValue(mockCredentialStatus)
      mockStatusListsStorage.get.mockResolvedValue(mockStatusList)

      const result = await revokeCredential(testCredentialId, 'Key compromised')

      expect(result).toBe(true)
      expect(mockCredentialStatusesStorage.save).toHaveBeenCalledWith(
        testCredentialId,
        expect.objectContaining({
          revoked: true,
          reason: 'Key compromised',
        })
      )
      expect(mockEventBus.emit).toHaveBeenCalledWith('credential.revoked', {
        credentialId: testCredentialId,
        statusListId: mockStatusList.id,
        reason: 'Key compromised',
      })
    })

    it('should return false if credential not found', async () => {
      mockCredentialStatusesStorage.get.mockResolvedValue(null)

      const result = await revokeCredential(testCredentialId)

      expect(result).toBe(false)
    })

    it('should return true if already revoked', async () => {
      mockCredentialStatusesStorage.get.mockResolvedValue({
        ...mockCredentialStatus,
        revoked: true,
      })

      const result = await revokeCredential(testCredentialId)

      expect(result).toBe(true)
    })

    it('should return false if status list not found', async () => {
      mockCredentialStatusesStorage.get.mockResolvedValue(mockCredentialStatus)
      mockStatusListsStorage.get.mockResolvedValue(null)

      const result = await revokeCredential(testCredentialId)

      expect(result).toBe(false)
    })

    it('should update bitstring correctly', async () => {
      mockCredentialStatusesStorage.get.mockResolvedValue(mockCredentialStatus)
      mockStatusListsStorage.get.mockResolvedValue(mockStatusList)

      await revokeCredential(testCredentialId)

      expect(mockStatusListsStorage.save).toHaveBeenCalled()
      const savedList = mockStatusListsStorage.save.mock.calls[0][1]
      const bitstring = Buffer.from(savedList.encodedList, 'base64')

      // Check that bit at index 5 is set
      const byteIndex = Math.floor(5 / 8)
      const bitIndex = 5 % 8
      expect((bitstring[byteIndex] & (1 << (7 - bitIndex))) !== 0).toBe(true)
    })
  })

  describe('unrevokeCredential', () => {
    const revokedStatus: CredentialStatus = {
      credentialId: testCredentialId,
      statusListId: 'urn:uuid:list-123',
      statusListIndex: 5,
      revoked: true,
      revokedAt: new Date(),
      reason: 'Test revocation',
    }

    const mockStatusList: StatusList = {
      id: 'urn:uuid:list-123',
      issuer: testIssuerId,
      encodedList: Buffer.alloc(16384).toString('base64'),
      size: 131072,
      usedIndices: [5],
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    it('should unrevoke a credential', async () => {
      mockCredentialStatusesStorage.get.mockResolvedValue(revokedStatus)
      mockStatusListsStorage.get.mockResolvedValue(mockStatusList)

      const result = await unrevokeCredential(testCredentialId)

      expect(result).toBe(true)
      expect(mockCredentialStatusesStorage.save).toHaveBeenCalledWith(
        testCredentialId,
        expect.objectContaining({
          revoked: false,
          revokedAt: undefined,
          reason: undefined,
        })
      )
      expect(mockEventBus.emit).toHaveBeenCalledWith('credential.unrevoked', {
        credentialId: testCredentialId,
        statusListId: mockStatusList.id,
      })
    })

    it('should return true if not revoked', async () => {
      mockCredentialStatusesStorage.get.mockResolvedValue({
        ...revokedStatus,
        revoked: false,
      })

      const result = await unrevokeCredential(testCredentialId)

      expect(result).toBe(true)
    })
  })

  describe('isCredentialRevoked', () => {
    it('should return true for revoked credential', async () => {
      mockCredentialStatusesStorage.get.mockResolvedValue({
        credentialId: testCredentialId,
        statusListId: 'urn:uuid:list-123',
        statusListIndex: 0,
        revoked: true,
      })

      const result = await isCredentialRevoked(testCredentialId)

      expect(result).toBe(true)
    })

    it('should return false for non-revoked credential', async () => {
      mockCredentialStatusesStorage.get.mockResolvedValue({
        credentialId: testCredentialId,
        statusListId: 'urn:uuid:list-123',
        statusListIndex: 0,
        revoked: false,
      })

      const result = await isCredentialRevoked(testCredentialId)

      expect(result).toBe(false)
    })

    it('should return false for unknown credential', async () => {
      mockCredentialStatusesStorage.get.mockResolvedValue(null)

      const result = await isCredentialRevoked(testCredentialId)

      expect(result).toBe(false)
    })

    it('should return false if revocation is disabled', async () => {
      mockIsFeatureEnabled.mockReturnValue(false)

      const result = await isCredentialRevoked(testCredentialId)

      expect(result).toBe(false)
    })
  })

  describe('checkStatusListEntry', () => {
    it('should return true if bit is set', async () => {
      const bitstring = Buffer.alloc(16384)
      bitstring[0] = 0b10000000 // First bit set

      mockStatusListsStorage.get.mockResolvedValue({
        id: 'urn:uuid:list-123',
        issuer: testIssuerId,
        encodedList: bitstring.toString('base64'),
        size: 131072,
        usedIndices: [0],
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const result = await checkStatusListEntry('urn:uuid:list-123', 0)

      expect(result).toBe(true)
    })

    it('should return false if bit is not set', async () => {
      mockStatusListsStorage.get.mockResolvedValue({
        id: 'urn:uuid:list-123',
        issuer: testIssuerId,
        encodedList: Buffer.alloc(16384).toString('base64'),
        size: 131072,
        usedIndices: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const result = await checkStatusListEntry('urn:uuid:list-123', 0)

      expect(result).toBe(false)
    })

    it('should return false if status list not found', async () => {
      mockStatusListsStorage.get.mockResolvedValue(null)

      const result = await checkStatusListEntry('non-existent', 0)

      expect(result).toBe(false)
    })
  })

  describe('getRevocationStats', () => {
    it('should return statistics', async () => {
      const statusLists: StatusList[] = [
        {
          id: 'urn:uuid:list-1',
          issuer: testIssuerId,
          encodedList: '',
          size: 131072,
          usedIndices: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      const credentialStatuses: CredentialStatus[] = [
        { credentialId: 'cred-1', statusListId: 'urn:uuid:list-1', statusListIndex: 0, revoked: false },
        { credentialId: 'cred-2', statusListId: 'urn:uuid:list-1', statusListIndex: 1, revoked: true },
        { credentialId: 'cred-3', statusListId: 'urn:uuid:list-1', statusListIndex: 2, revoked: false },
      ]

      mockStatusListsStorage.list.mockResolvedValue(statusLists)
      mockCredentialStatusesStorage.list.mockResolvedValue(credentialStatuses)

      const result = await getRevocationStats()

      expect(result).toEqual({
        totalLists: 1,
        totalCredentials: 3,
        revokedCredentials: 1,
        activeCredentials: 2,
        storageType: 'memory',
      })
    })

    it('should filter by issuer', async () => {
      const statusLists: StatusList[] = [
        { id: 'list-1', issuer: testIssuerId, encodedList: '', size: 131072, usedIndices: [], createdAt: new Date(), updatedAt: new Date() },
        { id: 'list-2', issuer: 'other-issuer', encodedList: '', size: 131072, usedIndices: [], createdAt: new Date(), updatedAt: new Date() },
      ]

      const credentialStatuses: CredentialStatus[] = [
        { credentialId: 'cred-1', statusListId: 'list-1', statusListIndex: 0, revoked: false },
        { credentialId: 'cred-2', statusListId: 'list-2', statusListIndex: 0, revoked: true },
      ]

      mockStatusListsStorage.list.mockResolvedValue(statusLists)
      mockCredentialStatusesStorage.list.mockResolvedValue(credentialStatuses)

      const result = await getRevocationStats(testIssuerId)

      expect(result.totalLists).toBe(1)
      expect(result.totalCredentials).toBe(1)
    })
  })

  describe('exportRevocationData', () => {
    it('should export all data', async () => {
      const statusLists: StatusList[] = [
        { id: 'list-1', issuer: testIssuerId, encodedList: '', size: 131072, usedIndices: [], createdAt: new Date(), updatedAt: new Date() },
      ]
      const credentialStatuses: CredentialStatus[] = [
        { credentialId: 'cred-1', statusListId: 'list-1', statusListIndex: 0, revoked: false },
      ]

      mockStatusListsStorage.list.mockResolvedValue(statusLists)
      mockCredentialStatusesStorage.list.mockResolvedValue(credentialStatuses)

      const result = await exportRevocationData()

      expect(result.statusLists).toHaveLength(1)
      expect(result.credentialStatuses).toHaveLength(1)
    })
  })

  describe('importRevocationData', () => {
    it('should import data', async () => {
      const data = {
        statusLists: [
          { id: 'list-1', issuer: testIssuerId, encodedList: '', size: 131072, usedIndices: [], createdAt: new Date(), updatedAt: new Date() },
        ],
        credentialStatuses: [
          { credentialId: 'cred-1', statusListId: 'list-1', statusListIndex: 0, revoked: false },
        ],
      }

      await importRevocationData(data)

      expect(mockStatusListsStorage.save).toHaveBeenCalledWith('list-1', data.statusLists[0])
      expect(mockCredentialStatusesStorage.save).toHaveBeenCalledWith('cred-1', data.credentialStatuses[0])
    })
  })
})
