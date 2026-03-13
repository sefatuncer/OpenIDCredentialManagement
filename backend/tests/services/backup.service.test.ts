/**
 * Backup Service Tests — backup creation, restore, listing, deletion, verification
 */

vi.mock('../../src/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// Mock fs for file operations
const mockFiles = new Map<string, string | Buffer>()
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs')
  return {
    ...actual,
    existsSync: vi.fn((p: string) => mockFiles.has(p)),
    promises: {
      mkdir: vi.fn(async () => undefined),
      writeFile: vi.fn(async (p: string, data: string | Buffer) => {
        mockFiles.set(p, data)
      }),
      readFile: vi.fn(async (p: string) => {
        const content = mockFiles.get(p)
        if (!content) throw new Error('ENOENT')
        return Buffer.isBuffer(content) ? content : Buffer.from(content)
      }),
      readdir: vi.fn(async () => {
        const files: string[] = []
        for (const key of mockFiles.keys()) {
          const name = key.split('/').pop()
          if (name) files.push(name)
        }
        return files
      }),
      unlink: vi.fn(async (p: string) => {
        mockFiles.delete(p)
      }),
      stat: vi.fn(async () => ({
        mtime: new Date(),
        size: 1024,
      })),
    },
  }
})

// Mock storage adapters used internally by backup service for data collection
vi.mock('../../src/core/storage', () => ({
  createStorageAdapter: vi.fn(() => ({
    save: vi.fn(),
    get: vi.fn(async () => null),
    delete: vi.fn(),
    list: vi.fn(async () => []),
    query: vi.fn(async () => ({ data: [], total: 0, hasMore: false })),
    exists: vi.fn(async () => false),
    count: vi.fn(async () => 0),
  })),
}))

import { backupService, BackupResult, BackupMetadata } from '../../src/services/backup.service'

describe('BackupService', () => {
  beforeEach(() => {
    mockFiles.clear()
  })

  describe('createFullBackup', () => {
    it('should create a full backup with metadata', async () => {
      const result = await backupService.createFullBackup()
      expect(result.success).toBe(true)
      expect(result.backupId).toBeDefined()
      expect(result.path).toContain('.backup')
      expect(result.metadata).toBeDefined()
      expect(result.metadata.type).toBe('full')
      expect(result.metadata.version).toBe('1.0.0')
      expect(result.metadata.timestamp).toBeDefined()
      expect(result.metadata.checksum).toBeDefined()
      expect(result.metadata.encrypted).toBe(false)
    })

    it('should include components list in metadata', async () => {
      const result = await backupService.createFullBackup()
      expect(Array.isArray(result.metadata.components)).toBe(true)
    })

    it('should write backup file to disk', async () => {
      const result = await backupService.createFullBackup()
      expect(mockFiles.has(result.path)).toBe(true)
    })

    it('should generate unique backup IDs', async () => {
      const r1 = await backupService.createFullBackup()
      const r2 = await backupService.createFullBackup()
      expect(r1.backupId).not.toBe(r2.backupId)
    })
  })

  describe('createCredentialsBackup', () => {
    it('should create a credentials-only backup', async () => {
      const result = await backupService.createCredentialsBackup()
      expect(result.success).toBe(true)
      expect(result.metadata.type).toBe('credentials')
      expect(result.metadata.components).toContain('credentials')
    })
  })

  describe('listBackups', () => {
    it('should return empty array when no backups exist', async () => {
      const backups = await backupService.listBackups()
      expect(Array.isArray(backups)).toBe(true)
      expect(backups.length).toBe(0)
    })

    it('should list created backups', async () => {
      await backupService.createFullBackup()
      await backupService.createFullBackup()
      const backups = await backupService.listBackups()
      expect(backups.length).toBe(2)
    })

    it('should return metadata for each backup', async () => {
      await backupService.createFullBackup()
      const backups = await backupService.listBackups()
      expect(backups[0].type).toBe('full')
      expect(backups[0].version).toBeDefined()
      expect(backups[0].timestamp).toBeDefined()
    })
  })

  describe('deleteBackup', () => {
    it('should return false for non-existent backup', async () => {
      const result = await backupService.deleteBackup('non-existent-backup-id')
      expect(result).toBe(false)
    })

    it('should delete existing backup and return true', async () => {
      const backup = await backupService.createFullBackup()
      const result = await backupService.deleteBackup(backup.backupId)
      expect(result).toBe(true)
      expect(mockFiles.has(backup.path)).toBe(false)
    })
  })

  describe('verifyBackup', () => {
    it('should return invalid for non-existent backup', async () => {
      const result = await backupService.verifyBackup('missing-id')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('not found')
    })

    it('should verify a valid backup', async () => {
      const backup = await backupService.createFullBackup()
      const result = await backupService.verifyBackup(backup.backupId)
      expect(result.valid).toBe(true)
      expect(result.metadata).toBeDefined()
    })
  })
})
