/**
 * ExpirationNotifier Service Tests
 */

import { IStorageAdapter } from '../../src/core/storage'

// In-memory mock storage
function createMockStorage<T>(): IStorageAdapter<T> & { _store: Map<string, T> } {
  const store = new Map<string, T>()
  return {
    _store: store,
    save: vi.fn(async (key: string, data: T) => { store.set(key, data) }),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    delete: vi.fn(async (key: string) => store.delete(key)),
    list: vi.fn(async () => Array.from(store.values())),
    query: vi.fn(async () => ({ data: Array.from(store.values()), total: store.size, hasMore: false })),
    count: vi.fn(async () => store.size),
    exists: vi.fn(async (key: string) => store.has(key)),
    update: vi.fn(async (key: string, data: Partial<T>) => {
      const existing = store.get(key)
      if (!existing) return null
      const updated = { ...existing, ...data } as T
      store.set(key, updated)
      return updated
    }),
    clear: vi.fn(async () => { store.clear() }),
    getAdapterType: vi.fn(() => 'memory'),
  }
}

const mockCredentialStorage = createMockStorage<any>()
const mockNotificationStorage = createMockStorage<any>()

// Mock storage module before importing service
vi.mock('../../src/core/storage', () => ({
  createStorageAdapter: vi.fn((collection: string) => {
    if (collection === 'expiration_credentials') return mockCredentialStorage
    if (collection === 'expiration_notifications') return mockNotificationStorage
    return createMockStorage()
  }),
}))

vi.mock('../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../../src/services/websocket.service', () => ({
  wsService: {
    broadcast: vi.fn(),
  },
}))

import { expirationNotifier, ExpiringCredential } from '../../src/services/expirationNotifier.service'
import { wsService } from '../../src/services/websocket.service'

const mockBroadcast = wsService.broadcast as any

describe('ExpirationNotifierService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCredentialStorage._store.clear()
    mockNotificationStorage._store.clear()
    expirationNotifier.stop()
  })

  afterAll(() => {
    expirationNotifier.stop()
  })

  describe('start() / stop() lifecycle', () => {
    it('should start periodic checks and stop cleanly', () => {
      vi.useFakeTimers()

      expirationNotifier.configure({ checkIntervalMinutes: 1, enabled: true, warningDays: [30, 7, 1] })
      expirationNotifier.start()

      // Initial check fires immediately (async)
      expect(mockCredentialStorage.list).toHaveBeenCalled()

      expirationNotifier.stop()

      vi.useRealTimers()
    })

    it('should not start when disabled', () => {
      expirationNotifier.configure({ enabled: false })
      expirationNotifier.start()

      // list should not be called since service is disabled
      expect(mockCredentialStorage.list).not.toHaveBeenCalled()

      // Re-enable for other tests
      expirationNotifier.configure({ enabled: true })
    })

    it('should clear interval on stop even if not started', () => {
      // Should not throw
      expirationNotifier.stop()
    })
  })

  describe('trackCredential / untrackCredential', () => {
    it('should track a credential', async () => {
      const expiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
      await expirationNotifier.trackCredential('cred-1', expiresAt, 'did:key:holder1', 'IdentityCredential')

      expect(mockCredentialStorage.save).toHaveBeenCalledWith('cred-1', {
        credentialId: 'cred-1',
        expiresAt: expiresAt.toISOString(),
        holderDid: 'did:key:holder1',
        type: 'IdentityCredential',
      })
    })

    it('should untrack a credential and remove notification record', async () => {
      await expirationNotifier.untrackCredential('cred-1')

      expect(mockCredentialStorage.delete).toHaveBeenCalledWith('cred-1')
      expect(mockNotificationStorage.delete).toHaveBeenCalledWith('cred-1')
    })
  })

  describe('getExpiringCredentials', () => {
    it('should return credentials expiring within given days, sorted', async () => {
      const now = Date.now()
      mockCredentialStorage._store.set('cred-a', {
        credentialId: 'cred-a',
        expiresAt: new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString(),
        holderDid: 'did:key:a',
        type: 'TypeA',
      })
      mockCredentialStorage._store.set('cred-b', {
        credentialId: 'cred-b',
        expiresAt: new Date(now + 20 * 24 * 60 * 60 * 1000).toISOString(),
        holderDid: 'did:key:b',
        type: 'TypeB',
      })
      // Expired credential — should NOT appear
      mockCredentialStorage._store.set('cred-expired', {
        credentialId: 'cred-expired',
        expiresAt: new Date(now - 1000).toISOString(),
        holderDid: 'did:key:c',
        type: 'TypeC',
      })

      const result = await expirationNotifier.getExpiringCredentials(30)

      expect(result).toHaveLength(2)
      // Sorted by daysUntilExpiry ascending
      expect(result[0].credentialId).toBe('cred-a')
      expect(result[1].credentialId).toBe('cred-b')
      expect(result[0].daysUntilExpiry).toBeLessThanOrEqual(result[1].daysUntilExpiry)
    })

    it('should return empty array when no credentials are expiring', async () => {
      const result = await expirationNotifier.getExpiringCredentials(30)
      expect(result).toEqual([])
    })

    it('should not include credentials expiring beyond the threshold', async () => {
      const now = Date.now()
      mockCredentialStorage._store.set('far-future', {
        credentialId: 'far-future',
        expiresAt: new Date(now + 365 * 24 * 60 * 60 * 1000).toISOString(),
        holderDid: 'did:key:x',
        type: 'TypeX',
      })

      const result = await expirationNotifier.getExpiringCredentials(30)
      expect(result).toHaveLength(0)
    })
  })

  describe('getExpiredCredentials', () => {
    it('should return only expired credentials', async () => {
      const now = Date.now()
      mockCredentialStorage._store.set('expired-1', {
        credentialId: 'expired-1',
        expiresAt: new Date(now - 86400000).toISOString(),
        holderDid: 'did:key:a',
        type: 'TypeA',
      })
      mockCredentialStorage._store.set('active-1', {
        credentialId: 'active-1',
        expiresAt: new Date(now + 86400000).toISOString(),
        holderDid: 'did:key:b',
        type: 'TypeB',
      })

      const result = await expirationNotifier.getExpiredCredentials()

      expect(result).toHaveLength(1)
      expect(result[0].credentialId).toBe('expired-1')
      expect(result[0].daysUntilExpiry).toBe(0)
    })
  })

  describe('checkExpirations — bulk load pattern (no N+1)', () => {
    it('should bulk load all credentials and notifications in two queries', async () => {
      const now = Date.now()
      // Credential expiring in 5 days — triggers warningDay 7
      mockCredentialStorage._store.set('cred-1', {
        credentialId: 'cred-1',
        expiresAt: new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString(),
        holderDid: 'did:key:h1',
        type: 'Identity',
      })

      expirationNotifier.configure({ warningDays: [30, 7, 1], enabled: true, checkIntervalMinutes: 60 })

      // Trigger checkExpirations via start (fires immediately)
      expirationNotifier.start()

      // Wait for async initial check
      await new Promise((r) => setTimeout(r, 50))
      expirationNotifier.stop()

      // Both storages should be listed exactly once (bulk load pattern)
      expect(mockCredentialStorage.list).toHaveBeenCalledTimes(1)
      expect(mockNotificationStorage.list).toHaveBeenCalledTimes(1)
    })

    it('should send notification for expiring credential and record it', async () => {
      const now = Date.now()
      mockCredentialStorage._store.set('cred-warn', {
        credentialId: 'cred-warn',
        expiresAt: new Date(now + 6 * 24 * 60 * 60 * 1000).toISOString(),
        holderDid: 'did:key:h1',
        type: 'Identity',
      })

      expirationNotifier.configure({ warningDays: [30, 7, 1], enabled: true, checkIntervalMinutes: 999 })
      expirationNotifier.start()
      await new Promise((r) => setTimeout(r, 50))
      expirationNotifier.stop()

      // Should broadcast expiring notification
      expect(mockBroadcast).toHaveBeenCalledWith(
        'credential:expiring',
        expect.objectContaining({ credentialId: 'cred-warn' })
      )

      // Should save notification record
      const notif = mockNotificationStorage._store.get('cred-warn')
      expect(notif).toBeDefined()
      expect(notif.notifiedDays).toContain(7)
      expect(notif.notifiedDays).toContain(30)
    })

    it('should send expired notification for past-due credentials', async () => {
      const now = Date.now()
      mockCredentialStorage._store.set('cred-past', {
        credentialId: 'cred-past',
        expiresAt: new Date(now - 1000).toISOString(),
        holderDid: 'did:key:h2',
        type: 'Delegation',
      })

      expirationNotifier.configure({ warningDays: [30, 7, 1], enabled: true, checkIntervalMinutes: 999 })
      expirationNotifier.start()
      await new Promise((r) => setTimeout(r, 50))
      expirationNotifier.stop()

      expect(mockBroadcast).toHaveBeenCalledWith(
        'credential:expired',
        expect.objectContaining({ credentialId: 'cred-past' })
      )
    })

    it('should not re-notify for already notified warning days', async () => {
      const now = Date.now()
      mockCredentialStorage._store.set('cred-already', {
        credentialId: 'cred-already',
        expiresAt: new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString(),
        holderDid: 'did:key:h3',
        type: 'Cap',
      })
      // Already notified for day 7 and 30
      mockNotificationStorage._store.set('cred-already', {
        credentialId: 'cred-already',
        notifiedDays: [30, 7],
      })

      expirationNotifier.configure({ warningDays: [30, 7, 1], enabled: true, checkIntervalMinutes: 999 })
      expirationNotifier.start()
      await new Promise((r) => setTimeout(r, 50))
      expirationNotifier.stop()

      // Should NOT broadcast since already notified
      expect(mockBroadcast).not.toHaveBeenCalled()
    })
  })

  describe('onExpiring handler', () => {
    it('should call registered handlers when credential is expiring', async () => {
      const handler = vi.fn()
      expirationNotifier.onExpiring(handler)

      const now = Date.now()
      mockCredentialStorage._store.set('cred-h', {
        credentialId: 'cred-h',
        expiresAt: new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString(),
        holderDid: 'did:key:h4',
        type: 'Test',
      })

      expirationNotifier.configure({ warningDays: [7, 1], enabled: true, checkIntervalMinutes: 999 })
      expirationNotifier.start()
      await new Promise((r) => setTimeout(r, 50))
      expirationNotifier.stop()

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ credentialId: 'cred-h' })
      )
    })
  })

  describe('getStats', () => {
    it('should return correct stats', async () => {
      const now = Date.now()
      const DAY = 24 * 60 * 60 * 1000

      mockCredentialStorage._store.set('exp', {
        credentialId: 'exp',
        expiresAt: new Date(now - DAY).toISOString(),
        holderDid: 'did:key:1',
        type: 'T',
      })
      mockCredentialStorage._store.set('soon-7', {
        credentialId: 'soon-7',
        expiresAt: new Date(now + 3 * DAY).toISOString(),
        holderDid: 'did:key:2',
        type: 'T',
      })
      mockCredentialStorage._store.set('soon-30', {
        credentialId: 'soon-30',
        expiresAt: new Date(now + 15 * DAY).toISOString(),
        holderDid: 'did:key:3',
        type: 'T',
      })
      mockCredentialStorage._store.set('far', {
        credentialId: 'far',
        expiresAt: new Date(now + 365 * DAY).toISOString(),
        holderDid: 'did:key:4',
        type: 'T',
      })

      const stats = await expirationNotifier.getStats()

      expect(stats.tracked).toBe(4)
      expect(stats.expired).toBe(1)
      expect(stats.expiringWithin7Days).toBe(1)
      expect(stats.expiringWithin30Days).toBe(2) // 3-day + 15-day
    })
  })

  describe('configure', () => {
    it('should merge partial configuration', () => {
      expirationNotifier.configure({ warningDays: [14, 3] })
      // We can verify indirectly by checking that the service uses the new warningDays
      // The configure method merges; no direct getter exists, but it should not throw
    })
  })
})
