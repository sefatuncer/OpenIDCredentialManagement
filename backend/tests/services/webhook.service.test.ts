/**
 * Webhook Service Tests — CRUD operations, validation, caching, secret handling
 */

import type { WebhookSubscription } from '../../src/services/webhook.service'
import type { IStorageAdapter } from '../../src/core/storage/IStorageAdapter'

// --- Shared in-memory store (survives module cache) ---

const store = new Map<string, WebhookSubscription>()

const mockAdapter: IStorageAdapter<WebhookSubscription> = {
  save: jest.fn(async (key: string, data: WebhookSubscription) => { store.set(key, data) }),
  get: jest.fn(async (key: string) => store.get(key) ?? null),
  delete: jest.fn(async (key: string) => { store.delete(key) }),
  list: jest.fn(async () => Array.from(store.values())),
  query: jest.fn(async () => ({ data: Array.from(store.values()), total: store.size, hasMore: false })),
  count: jest.fn(async () => store.size),
  exists: jest.fn(async (key: string) => store.has(key)),
  update: jest.fn(async (key: string, data: Partial<WebhookSubscription>) => {
    const existing = store.get(key)
    if (!existing) return null
    const updated = { ...existing, ...data } as WebhookSubscription
    store.set(key, updated)
    return updated
  }),
  clear: jest.fn(async () => { store.clear() }),
  getAdapterType: jest.fn(() => 'memory'),
} as unknown as IStorageAdapter<WebhookSubscription>

// --- Mock modules ---

jest.mock('../../src/core/storage', () => ({
  createStorageAdapter: jest.fn(() => mockAdapter),
}))

jest.mock('../../src/utils/url-validation', () => ({
  isPrivateUrl: jest.fn((url: string) => {
    try {
      const u = new URL(url)
      const h = u.hostname
      if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true
      if (h.startsWith('10.')) return true
      if (h.startsWith('172.16.') || h.startsWith('172.17.')) return true
      if (h.startsWith('192.168.')) return true
      if (h === '169.254.169.254') return true
      if (h.endsWith('.local') || h.endsWith('.internal')) return true
      return false
    } catch { return false }
  }),
}))

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

jest.mock('../../src/services/webhookDelivery.service', () => ({
  deliverEvent: jest.fn(),
  testSubscription: jest.fn(),
  getDeliveries: jest.fn(async () => []),
  pruneDeliveries: jest.fn(async () => 0),
  invalidateSubscriptionCache: jest.fn(),
}))

// --- Import under test (after mocks) ---

import {
  createSubscription,
  updateSubscription,
  deleteSubscription,
  listSubscriptions,
  getSubscription,
  deliverEvent,
  testSubscription,
} from '../../src/services/webhook.service'
import { invalidateSubscriptionCache } from '../../src/services/webhookDelivery.service'

describe('WebhookService', () => {
  beforeEach(() => {
    store.clear()
    jest.clearAllMocks()
  })

  // --- createSubscription ---
  describe('createSubscription', () => {
    it('should create a subscription with valid public URL', async () => {
      const sub = await createSubscription('https://example.com/webhook', ['credential.issued'], { name: 'Test Hook', createdBy: 'admin' })
      expect(sub.id).toMatch(/^wh_/)
      expect(sub.url).toBe('https://example.com/webhook')
      expect(sub.events).toEqual(['credential.issued'])
      expect(sub.active).toBe(true)
      expect(sub.secret).toHaveLength(64)
      expect(sub.metadata?.name).toBe('Test Hook')
    })

    it('should persist subscription to storage', async () => {
      const sub = await createSubscription('https://example.com/hook', ['test.event'])
      expect(store.has(sub.id)).toBe(true)
    })

    it('should generate unique secrets per subscription', async () => {
      const sub1 = await createSubscription('https://example.com/a', ['e1'])
      const sub2 = await createSubscription('https://example.com/b', ['e2'])
      expect(sub1.secret).not.toBe(sub2.secret)
    })

    it('should invalidate subscription cache on create', async () => {
      await createSubscription('https://example.com/hook', ['test'])
      expect(invalidateSubscriptionCache).toHaveBeenCalled()
    })

    it('should reject localhost URLs', async () => {
      await expect(createSubscription('http://localhost/webhook', ['test'])).rejects.toThrow('private/reserved')
    })

    it('should reject 127.0.0.1 URLs', async () => {
      await expect(createSubscription('http://127.0.0.1:8080/hook', ['test'])).rejects.toThrow('private/reserved')
    })

    it('should reject 10.x.x.x private range', async () => {
      await expect(createSubscription('http://10.0.0.1/hook', ['test'])).rejects.toThrow('private/reserved')
    })

    it('should reject 192.168.x.x private range', async () => {
      await expect(createSubscription('http://192.168.1.1/hook', ['test'])).rejects.toThrow('private/reserved')
    })

    it('should reject AWS metadata endpoint', async () => {
      await expect(createSubscription('http://169.254.169.254/latest/meta-data/', ['test'])).rejects.toThrow('private/reserved')
    })

    it('should reject .local domains', async () => {
      await expect(createSubscription('http://internal.local/hook', ['test'])).rejects.toThrow('private/reserved')
    })

    it('should enforce maximum 20 subscriptions', async () => {
      for (let i = 0; i < 20; i++) {
        await createSubscription(`https://example.com/hook${i}`, ['test'])
      }
      await expect(createSubscription('https://example.com/hook-overflow', ['test'])).rejects.toThrow('Maximum 20')
    })

    it('should allow creation after deleting below limit', async () => {
      const subs: WebhookSubscription[] = []
      for (let i = 0; i < 20; i++) {
        subs.push(await createSubscription(`https://example.com/hook${i}`, ['test']))
      }
      await deleteSubscription(subs[0].id)
      const newSub = await createSubscription('https://example.com/new-hook', ['test'])
      expect(newSub.id).toMatch(/^wh_/)
    })
  })

  // --- updateSubscription ---
  describe('updateSubscription', () => {
    it('should update URL of existing subscription', async () => {
      const sub = await createSubscription('https://example.com/old', ['test'])
      const updated = await updateSubscription(sub.id, { url: 'https://example.com/new' })
      expect(updated).not.toBeNull()
      expect(updated!.url).toBe('https://example.com/new')
    })

    it('should update events', async () => {
      const sub = await createSubscription('https://example.com/hook', ['old.event'])
      const updated = await updateSubscription(sub.id, { events: ['new.event'] })
      expect(updated!.events).toEqual(['new.event'])
    })

    it('should update active status', async () => {
      const sub = await createSubscription('https://example.com/hook', ['test'])
      const updated = await updateSubscription(sub.id, { active: false })
      expect(updated!.active).toBe(false)
    })

    it('should return null for non-existent subscription', async () => {
      const result = await updateSubscription('non-existent-id', { active: false })
      expect(result).toBeNull()
    })

    it('should reject private URL on update', async () => {
      const sub = await createSubscription('https://example.com/hook', ['test'])
      await expect(updateSubscription(sub.id, { url: 'http://127.0.0.1/hook' })).rejects.toThrow('private/reserved')
    })

    it('should preserve secret on update', async () => {
      const sub = await createSubscription('https://example.com/hook', ['test'])
      const updated = await updateSubscription(sub.id, { url: 'https://example.com/new' })
      expect(updated!.secret).toBe(sub.secret)
    })

    it('should invalidate subscription cache on update', async () => {
      const sub = await createSubscription('https://example.com/hook', ['test'])
      jest.clearAllMocks()
      await updateSubscription(sub.id, { active: false })
      expect(invalidateSubscriptionCache).toHaveBeenCalled()
    })
  })

  // --- deleteSubscription ---
  describe('deleteSubscription', () => {
    it('should delete an existing subscription', async () => {
      const sub = await createSubscription('https://example.com/hook', ['test'])
      const result = await deleteSubscription(sub.id)
      expect(result).toBe(true)
      expect(store.has(sub.id)).toBe(false)
    })

    it('should return false for non-existent subscription', async () => {
      const result = await deleteSubscription('non-existent-id')
      expect(result).toBe(false)
    })

    it('should invalidate subscription cache on delete', async () => {
      const sub = await createSubscription('https://example.com/hook', ['test'])
      jest.clearAllMocks()
      await deleteSubscription(sub.id)
      expect(invalidateSubscriptionCache).toHaveBeenCalled()
    })
  })

  // --- listSubscriptions ---
  describe('listSubscriptions', () => {
    it('should return empty array when no subscriptions exist', async () => {
      const result = await listSubscriptions()
      expect(result).toEqual([])
    })

    it('should return all subscriptions', async () => {
      await createSubscription('https://example.com/a', ['e1'])
      await createSubscription('https://example.com/b', ['e2'])
      const result = await listSubscriptions()
      expect(result).toHaveLength(2)
    })
  })

  // --- getSubscription ---
  describe('getSubscription', () => {
    it('should return subscription by ID', async () => {
      const sub = await createSubscription('https://example.com/hook', ['test'])
      const result = await getSubscription(sub.id)
      expect(result).not.toBeNull()
      expect(result!.id).toBe(sub.id)
    })

    it('should return null for non-existent ID', async () => {
      const result = await getSubscription('non-existent-id')
      expect(result).toBeNull()
    })

    it('should return full secret (64-char hex)', async () => {
      const sub = await createSubscription('https://example.com/hook', ['test'])
      const result = await getSubscription(sub.id)
      expect(result!.secret).toMatch(/^[0-9a-f]{64}$/)
    })
  })

  // --- deliverEvent / testSubscription ---
  describe('deliverEvent', () => {
    it('should delegate to webhookDelivery.service', async () => {
      const { deliverEvent: mockDeliver } = jest.requireMock('../../src/services/webhookDelivery.service')
      await deliverEvent('test.event', { foo: 'bar' })
      expect(mockDeliver).toHaveBeenCalledWith('test.event', { foo: 'bar' }, expect.any(Function))
    })
  })

  describe('testSubscription', () => {
    it('should throw if subscription not found', async () => {
      await expect(testSubscription('non-existent')).rejects.toThrow('not found')
    })

    it('should delegate to webhookDelivery.service testSubscription', async () => {
      const sub = await createSubscription('https://example.com/hook', ['test'])
      const { testSubscription: mockTest } = jest.requireMock('../../src/services/webhookDelivery.service')
      mockTest.mockResolvedValue({ success: true, responseStatus: 200, latencyMs: 42 })
      const result = await testSubscription(sub.id)
      expect(mockTest).toHaveBeenCalledWith(expect.objectContaining({ id: sub.id }))
      expect(result.success).toBe(true)
    })
  })
})
