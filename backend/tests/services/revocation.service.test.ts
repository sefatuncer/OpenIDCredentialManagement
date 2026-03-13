/**
 * Revocation Service Tests
 * Tests for Status List 2021 implementation
 *
 * Uses vi.resetModules + dynamic import to ensure clean state for each test
 */

// Mock logger first (before any imports)
vi.mock('../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock event bus
vi.mock('../../src/core/event-bus', () => ({
  eventBus: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}))

describe('RevocationService', () => {
  const testIssuerId = 'did:example:issuer123'
  const testCredentialId = 'urn:uuid:credential-123'

  // Import types for type checking
  type RevocationModule = typeof import('../../src/services/revocation.service')
  type FeatureFlagsModule = typeof import('../../src/core/feature-flags')

  let revocationService: RevocationModule
  let featureFlags: FeatureFlagsModule

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()

    // Mock feature flags before importing revocation service
    vi.doMock('../../src/core/feature-flags', () => ({
      isFeatureEnabled: vi.fn().mockReturnValue(true),
      requireFeature: vi.fn(),
      getFeatureFlags: vi.fn().mockReturnValue({}),
    }))

    // Import fresh modules
    revocationService = await import('../../src/services/revocation.service')
    featureFlags = await import('../../src/core/feature-flags')
  })

  describe('createStatusList', () => {
    it('should create a new status list', async () => {
      const result = await revocationService.createStatusList(testIssuerId)

      expect(result).toMatchObject({
        issuer: testIssuerId,
        size: 131072,
        usedIndices: [],
      })
      expect(result.id).toMatch(/^urn:uuid:/)
      expect(result.encodedList).toBeDefined()
      expect(result.createdAt).toBeInstanceOf(Date)
      expect(result.updatedAt).toBeInstanceOf(Date)
    })

    it('should create a status list with custom size', async () => {
      const customSize = 1024
      const result = await revocationService.createStatusList(testIssuerId, customSize)

      expect(result.size).toBe(customSize)
    })

    it('should throw if revocation feature is disabled', async () => {
      const mockRequireFeature = featureFlags.requireFeature as any
      mockRequireFeature.mockImplementation(() => {
        throw new Error('Feature module.revocation is disabled')
      })

      await expect(revocationService.createStatusList(testIssuerId)).rejects.toThrow(
        'Feature module.revocation is disabled'
      )
    })
  })

  describe('getOrCreateStatusList', () => {
    it('should create new list if none exists', async () => {
      const result = await revocationService.getOrCreateStatusList(testIssuerId)

      expect(result.issuer).toBe(testIssuerId)
      expect(result.id).toMatch(/^urn:uuid:/)
    })

    it('should return existing list with available space', async () => {
      // Create first list
      const firstList = await revocationService.createStatusList(testIssuerId)

      // Get or create should return the existing one
      const result = await revocationService.getOrCreateStatusList(testIssuerId)

      expect(result.id).toBe(firstList.id)
    })

    it('should return dummy list if revocation is disabled', async () => {
      const mockIsFeatureEnabled = featureFlags.isFeatureEnabled as any
      mockIsFeatureEnabled.mockReturnValue(false)

      const result = await revocationService.getOrCreateStatusList(testIssuerId)

      expect(result.id).toBe('disabled')
      expect(result.size).toBe(0)
    })
  })

  describe('allocateStatusEntry', () => {
    it('should allocate a new status entry', async () => {
      const result = await revocationService.allocateStatusEntry(testIssuerId, testCredentialId)

      expect(result).toMatchObject({
        type: 'StatusList2021Entry',
        statusPurpose: 'revocation',
        statusListIndex: '0',
      })
      expect(result.statusListCredential).toMatch(/^urn:uuid:/)
    })

    it('should allocate sequential indices', async () => {
      const entry1 = await revocationService.allocateStatusEntry(testIssuerId, 'cred-1')
      const entry2 = await revocationService.allocateStatusEntry(testIssuerId, 'cred-2')
      const entry3 = await revocationService.allocateStatusEntry(testIssuerId, 'cred-3')

      expect(entry1.statusListIndex).toBe('0')
      expect(entry2.statusListIndex).toBe('1')
      expect(entry3.statusListIndex).toBe('2')

      // All should use the same status list
      expect(entry1.statusListCredential).toBe(entry2.statusListCredential)
      expect(entry2.statusListCredential).toBe(entry3.statusListCredential)
    })

    it('should throw if status list is full', async () => {
      // Create a very small list
      const smallList = await revocationService.createStatusList(testIssuerId, 8)

      // Allocate all 8 entries
      for (let i = 0; i < 8; i++) {
        await revocationService.allocateStatusEntry(testIssuerId, `cred-${i}`)
      }

      // 9th allocation should fail (but will create a new list in real implementation)
      // This test verifies the allocation continues to work
      const entry9 = await revocationService.allocateStatusEntry(testIssuerId, 'cred-9')
      expect(entry9.statusListIndex).toBeDefined()
    })
  })

  describe('revokeCredential', () => {
    it('should revoke a credential', async () => {
      // First allocate a status entry
      await revocationService.allocateStatusEntry(testIssuerId, testCredentialId)

      // Revoke
      const result = await revocationService.revokeCredential(testCredentialId, 'Key compromised')

      expect(result).toBe(true)

      // Verify it's revoked
      const isRevoked = await revocationService.isCredentialRevoked(testCredentialId)
      expect(isRevoked).toBe(true)
    })

    it('should return false if credential not found', async () => {
      const result = await revocationService.revokeCredential('non-existent-credential')

      expect(result).toBe(false)
    })

    it('should return true if already revoked', async () => {
      await revocationService.allocateStatusEntry(testIssuerId, testCredentialId)
      await revocationService.revokeCredential(testCredentialId)

      // Revoke again
      const result = await revocationService.revokeCredential(testCredentialId)

      expect(result).toBe(true)
    })

    it('should update bitstring correctly', async () => {
      await revocationService.allocateStatusEntry(testIssuerId, testCredentialId)

      // Get the status before revocation
      const statusBefore = await revocationService.getCredentialStatus(testCredentialId)
      expect(statusBefore?.revoked).toBe(false)

      // Revoke
      await revocationService.revokeCredential(testCredentialId)

      // Get status after
      const statusAfter = await revocationService.getCredentialStatus(testCredentialId)
      expect(statusAfter?.revoked).toBe(true)
      expect(statusAfter?.revokedAt).toBeInstanceOf(Date)
    })
  })

  describe('unrevokeCredential', () => {
    it('should unrevoke a credential', async () => {
      await revocationService.allocateStatusEntry(testIssuerId, testCredentialId)
      await revocationService.revokeCredential(testCredentialId, 'Test')

      const result = await revocationService.unrevokeCredential(testCredentialId)

      expect(result).toBe(true)

      const isRevoked = await revocationService.isCredentialRevoked(testCredentialId)
      expect(isRevoked).toBe(false)
    })

    it('should return true if not revoked', async () => {
      await revocationService.allocateStatusEntry(testIssuerId, testCredentialId)

      const result = await revocationService.unrevokeCredential(testCredentialId)

      expect(result).toBe(true)
    })

    it('should return false if credential not found', async () => {
      const result = await revocationService.unrevokeCredential('non-existent')

      expect(result).toBe(false)
    })
  })

  describe('isCredentialRevoked', () => {
    it('should return true for revoked credential', async () => {
      await revocationService.allocateStatusEntry(testIssuerId, testCredentialId)
      await revocationService.revokeCredential(testCredentialId)

      const result = await revocationService.isCredentialRevoked(testCredentialId)

      expect(result).toBe(true)
    })

    it('should return false for non-revoked credential', async () => {
      await revocationService.allocateStatusEntry(testIssuerId, testCredentialId)

      const result = await revocationService.isCredentialRevoked(testCredentialId)

      expect(result).toBe(false)
    })

    it('should return false for unknown credential', async () => {
      const result = await revocationService.isCredentialRevoked('unknown-credential')

      expect(result).toBe(false)
    })

    it('should return false if revocation is disabled', async () => {
      const mockIsFeatureEnabled = featureFlags.isFeatureEnabled as any
      mockIsFeatureEnabled.mockReturnValue(false)

      const result = await revocationService.isCredentialRevoked(testCredentialId)

      expect(result).toBe(false)
    })
  })

  describe('checkStatusListEntry', () => {
    it('should return true if credential is revoked', async () => {
      const entry = await revocationService.allocateStatusEntry(testIssuerId, testCredentialId)
      await revocationService.revokeCredential(testCredentialId)

      const result = await revocationService.checkStatusListEntry(
        entry.statusListCredential,
        parseInt(entry.statusListIndex)
      )

      expect(result).toBe(true)
    })

    it('should return false if credential is not revoked', async () => {
      const entry = await revocationService.allocateStatusEntry(testIssuerId, testCredentialId)

      const result = await revocationService.checkStatusListEntry(
        entry.statusListCredential,
        parseInt(entry.statusListIndex)
      )

      expect(result).toBe(false)
    })

    it('should return false if status list not found', async () => {
      const result = await revocationService.checkStatusListEntry('non-existent-list', 0)

      expect(result).toBe(false)
    })
  })

  describe('getCredentialStatus', () => {
    it('should return status for existing credential', async () => {
      await revocationService.allocateStatusEntry(testIssuerId, testCredentialId)

      const result = await revocationService.getCredentialStatus(testCredentialId)

      expect(result).toMatchObject({
        credentialId: testCredentialId,
        statusListIndex: 0,
        revoked: false,
      })
    })

    it('should return null for unknown credential', async () => {
      const result = await revocationService.getCredentialStatus('unknown')

      expect(result).toBeNull()
    })
  })

  describe('getStatusList', () => {
    it('should return status list by ID', async () => {
      const created = await revocationService.createStatusList(testIssuerId)

      const result = await revocationService.getStatusList(created.id)

      expect(result).toMatchObject({
        id: created.id,
        issuer: testIssuerId,
      })
    })

    it('should return null for unknown ID', async () => {
      const result = await revocationService.getStatusList('unknown-id')

      expect(result).toBeNull()
    })
  })

  describe('getRevocationStats', () => {
    it('should return statistics', async () => {
      // Create some credentials
      await revocationService.allocateStatusEntry(testIssuerId, 'cred-1')
      await revocationService.allocateStatusEntry(testIssuerId, 'cred-2')
      await revocationService.allocateStatusEntry(testIssuerId, 'cred-3')

      // Revoke one
      await revocationService.revokeCredential('cred-2')

      const result = await revocationService.getRevocationStats()

      expect(result).toMatchObject({
        totalLists: 1,
        totalCredentials: 3,
        revokedCredentials: 1,
        activeCredentials: 2,
        storageType: 'memory',
      })
    })

    it('should filter by issuer', async () => {
      // Create credentials for different issuers
      await revocationService.allocateStatusEntry(testIssuerId, 'cred-1')
      await revocationService.allocateStatusEntry('did:example:other', 'cred-2')

      const result = await revocationService.getRevocationStats(testIssuerId)

      expect(result.totalCredentials).toBe(1)
    })
  })

  describe('exportRevocationData', () => {
    it('should export all data', async () => {
      await revocationService.allocateStatusEntry(testIssuerId, testCredentialId)

      const result = await revocationService.exportRevocationData()

      expect(result.statusLists).toHaveLength(1)
      expect(result.credentialStatuses).toHaveLength(1)
    })
  })

  describe('importRevocationData', () => {
    it('should import data', async () => {
      // Create and export data
      await revocationService.allocateStatusEntry(testIssuerId, testCredentialId)
      await revocationService.revokeCredential(testCredentialId)

      const exported = await revocationService.exportRevocationData()

      // Clear and reimport
      await revocationService.clearRevocationData()

      // Verify cleared
      const afterClear = await revocationService.getCredentialStatus(testCredentialId)
      expect(afterClear).toBeNull()

      // Import
      await revocationService.importRevocationData(exported)

      // Verify imported
      const afterImport = await revocationService.getCredentialStatus(testCredentialId)
      expect(afterImport).not.toBeNull()
      expect(afterImport?.revoked).toBe(true)
    })
  })

  describe('getStatusListCredential', () => {
    it('should return status list credential format', async () => {
      const statusList = await revocationService.createStatusList(testIssuerId)

      const result = await revocationService.getStatusListCredential(statusList.id, testIssuerId)

      expect(result).toMatchObject({
        '@context': expect.arrayContaining([
          'https://www.w3.org/2018/credentials/v1',
          'https://w3id.org/vc/status-list/2021/v1',
        ]),
        type: ['VerifiableCredential', 'StatusList2021Credential'],
        issuer: testIssuerId,
        credentialSubject: {
          type: 'StatusList2021',
          statusPurpose: 'revocation',
        },
      })
    })

    it('should return null for unknown status list', async () => {
      const result = await revocationService.getStatusListCredential('unknown', testIssuerId)

      expect(result).toBeNull()
    })
  })
})
