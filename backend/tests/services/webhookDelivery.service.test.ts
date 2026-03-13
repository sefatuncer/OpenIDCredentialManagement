/**
 * Webhook Delivery Service Tests — HMAC signatures, retry logic, SSRF, pruning
 */

import crypto from 'crypto'
import type { WebhookSubscription, WebhookDelivery } from '../../src/services/webhook.service'

// --- Shared in-memory store (survives module cache) ---

const store = new Map<string, WebhookDelivery>()

jest.mock('../../src/core/storage', () => ({
  createStorageAdapter: jest.fn(() => ({
    save: jest.fn(async (key: string, data: WebhookDelivery) => { store.set(key, data) }),
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    delete: jest.fn(async (key: string) => { store.delete(key) }),
    list: jest.fn(async () => Array.from(store.values())),
    query: jest.fn(async () => ({ data: Array.from(store.values()), total: store.size, hasMore: false })),
    count: jest.fn(async () => store.size),
    exists: jest.fn(async (key: string) => store.has(key)),
    update: jest.fn(async () => null),
    clear: jest.fn(async () => { store.clear() }),
    getAdapterType: jest.fn(() => 'memory'),
  })),
}))

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

// Mock global fetch
const mockFetch = jest.fn()
global.fetch = mockFetch as unknown as typeof fetch

// --- Import under test ---

import {
  deliverEvent,
  testSubscription,
  getDeliveries,
  pruneDeliveries,
  invalidateSubscriptionCache,
} from '../../src/services/webhookDelivery.service'

// --- Helpers ---

function makeSubscription(overrides: Partial<WebhookSubscription> = {}): WebhookSubscription {
  return {
    id: `wh_${crypto.randomUUID()}`,
    url: 'https://example.com/webhook',
    secret: crypto.randomBytes(32).toString('hex'),
    events: ['credential.issued', 'credential.revoked'],
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeFetchResponse(status: number, body = 'OK', ok?: boolean): Response {
  return {
    ok: ok ?? (status >= 200 && status < 300),
    status,
    text: jest.fn(async () => body),
    headers: new Headers(),
  } as unknown as Response
}

describe('WebhookDeliveryService', () => {
  beforeEach(() => {
    store.clear()
    jest.clearAllMocks()
    jest.useFakeTimers({ advanceTimers: true })
    invalidateSubscriptionCache()
    mockFetch.mockResolvedValue(makeFetchResponse(200))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  // --- HMAC-SHA256 signature ---
  describe('HMAC-SHA256 signature', () => {
    it('should send X-Webhook-Signature header with sha256= prefix', async () => {
      const sub = makeSubscription()
      const listFn = jest.fn(async () => [sub])
      await deliverEvent('credential.issued', { id: 'vc-1' }, listFn)
      await jest.advanceTimersByTimeAsync(100)
      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [, options] = mockFetch.mock.calls[0]
      expect(options.headers['X-Webhook-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/)
    })

    it('should produce valid HMAC that can be verified with the secret', async () => {
      const sub = makeSubscription()
      await deliverEvent('credential.issued', { id: 'vc-1' }, async () => [sub])
      await jest.advanceTimersByTimeAsync(100)
      const [, options] = mockFetch.mock.calls[0]
      const signature = options.headers['X-Webhook-Signature'].replace('sha256=', '')
      const expected = crypto.createHmac('sha256', sub.secret).update(options.body).digest('hex')
      expect(signature).toBe(expected)
    })

    it('should include X-Webhook-Id and X-Delivery-Id headers', async () => {
      const sub = makeSubscription()
      await deliverEvent('credential.issued', { id: 'vc-1' }, async () => [sub])
      await jest.advanceTimersByTimeAsync(100)
      const [, options] = mockFetch.mock.calls[0]
      expect(options.headers['X-Webhook-Id']).toBe(sub.id)
      expect(options.headers['X-Delivery-Id']).toMatch(/^del_/)
    })

    it('should include User-Agent header', async () => {
      const sub = makeSubscription()
      await deliverEvent('credential.issued', {}, async () => [sub])
      await jest.advanceTimersByTimeAsync(100)
      const [, options] = mockFetch.mock.calls[0]
      expect(options.headers['User-Agent']).toBe('OIDCM-Webhook/1.0')
    })
  })

  // --- Event matching ---
  describe('event matching', () => {
    it('should only deliver to subscriptions matching the event', async () => {
      const sub1 = makeSubscription({ events: ['credential.issued'] })
      const sub2 = makeSubscription({ events: ['credential.revoked'] })
      await deliverEvent('credential.issued', { id: 'vc-1' }, async () => [sub1, sub2])
      await jest.advanceTimersByTimeAsync(100)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('should not deliver to inactive subscriptions', async () => {
      const sub = makeSubscription({ active: false, events: ['credential.issued'] })
      await deliverEvent('credential.issued', {}, async () => [sub])
      await jest.advanceTimersByTimeAsync(100)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should deliver to multiple matching subscriptions', async () => {
      const sub1 = makeSubscription({ events: ['credential.issued'] })
      const sub2 = makeSubscription({ events: ['credential.issued'] })
      await deliverEvent('credential.issued', {}, async () => [sub1, sub2])
      await jest.advanceTimersByTimeAsync(100)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('should skip when no subscriptions match', async () => {
      await deliverEvent('credential.issued', {}, async () => [])
      await jest.advanceTimersByTimeAsync(100)
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  // --- Payload structure ---
  describe('payload structure', () => {
    it('should wrap data in event envelope', async () => {
      const sub = makeSubscription()
      await deliverEvent('credential.issued', { credentialId: 'abc' }, async () => [sub])
      await jest.advanceTimersByTimeAsync(100)
      const [, options] = mockFetch.mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body.event).toBe('credential.issued')
      expect(body.data).toEqual({ credentialId: 'abc' })
      expect(body.timestamp).toBeDefined()
    })
  })

  // --- Delivery status tracking ---
  describe('delivery status tracking', () => {
    it('should save delivery as success on 2xx response', async () => {
      mockFetch.mockResolvedValue(makeFetchResponse(200))
      const sub = makeSubscription()
      await deliverEvent('credential.issued', {}, async () => [sub])
      await jest.advanceTimersByTimeAsync(500)
      const deliveries = Array.from(store.values())
      expect(deliveries).toHaveLength(1)
      expect(deliveries[0].status).toBe('success')
      expect(deliveries[0].responseStatus).toBe(200)
    })

    it('should mark delivery as pending after first non-ok response', async () => {
      mockFetch.mockResolvedValue(makeFetchResponse(500, 'Error'))
      const sub = makeSubscription()
      await deliverEvent('credential.issued', {}, async () => [sub])
      await jest.advanceTimersByTimeAsync(500)
      const deliveries = Array.from(store.values())
      expect(deliveries).toHaveLength(1)
      expect(deliveries[0].status).toBe('pending')
      expect(deliveries[0].attempts).toBe(1)
    })

    it('should record delivery with correct fields', async () => {
      const sub = makeSubscription({ events: ['test.event'] })
      await deliverEvent('test.event', { data: 123 }, async () => [sub])
      await jest.advanceTimersByTimeAsync(500)
      const deliveries = Array.from(store.values())
      expect(deliveries.length).toBeGreaterThanOrEqual(1)
      expect(deliveries[0].id).toMatch(/^del_/)
      expect(deliveries[0].webhookId).toBe(sub.id)
      expect(deliveries[0].event).toBe('test.event')
    })
  })

  // --- Retry logic ---
  describe('retry logic', () => {
    it('should schedule retry after first failure with 1s delay', async () => {
      mockFetch.mockResolvedValue(makeFetchResponse(500, 'Error'))
      const sub = makeSubscription()
      await deliverEvent('credential.issued', {}, async () => [sub])
      await jest.advanceTimersByTimeAsync(500)
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Advance 1s for retry
      await jest.advanceTimersByTimeAsync(1100)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('should attempt retry on failure', async () => {
      // First call fails, second succeeds
      mockFetch
        .mockResolvedValueOnce(makeFetchResponse(500, 'Error'))
        .mockResolvedValueOnce(makeFetchResponse(200))
      const sub = makeSubscription()
      await deliverEvent('credential.issued', {}, async () => [sub])
      // Initial attempt
      await jest.advanceTimersByTimeAsync(500)
      expect(mockFetch).toHaveBeenCalledTimes(1)
      // After 1s retry delay
      await jest.advanceTimersByTimeAsync(1500)
      expect(mockFetch).toHaveBeenCalledTimes(2)
      // Should now be successful
      const deliveries = Array.from(store.values())
      expect(deliveries.length).toBeGreaterThanOrEqual(1)
      expect(deliveries[0].status).toBe('success')
    })
  })

  // --- getDeliveries ---
  describe('getDeliveries', () => {
    it('should return deliveries for a specific webhook', async () => {
      const whId = 'wh_test'
      store.set('del_1', { id: 'del_1', webhookId: whId, event: 'e1', payload: {}, status: 'success', attempts: 1, createdAt: '2026-01-01T00:00:00Z' } as WebhookDelivery)
      store.set('del_2', { id: 'del_2', webhookId: 'wh_other', event: 'e1', payload: {}, status: 'success', attempts: 1, createdAt: '2026-01-01T00:00:00Z' } as WebhookDelivery)

      const result = await getDeliveries(whId)
      expect(result).toHaveLength(1)
      expect(result[0].webhookId).toBe(whId)
    })

    it('should sort deliveries by createdAt descending', async () => {
      const whId = 'wh_test'
      store.set('del_1', { id: 'del_1', webhookId: whId, event: 'e1', payload: {}, status: 'success', attempts: 1, createdAt: '2026-01-01T00:00:00Z' } as WebhookDelivery)
      store.set('del_2', { id: 'del_2', webhookId: whId, event: 'e1', payload: {}, status: 'success', attempts: 1, createdAt: '2026-01-02T00:00:00Z' } as WebhookDelivery)

      const result = await getDeliveries(whId)
      expect(result[0].id).toBe('del_2')
      expect(result[1].id).toBe('del_1')
    })

    it('should limit results to 50', async () => {
      const whId = 'wh_test'
      for (let i = 0; i < 60; i++) {
        store.set(`del_${i}`, { id: `del_${i}`, webhookId: whId, event: 'e1', payload: {}, status: 'success', attempts: 1, createdAt: new Date(2026, 0, 1, 0, 0, i).toISOString() } as WebhookDelivery)
      }
      const result = await getDeliveries(whId)
      expect(result).toHaveLength(50)
    })
  })

  // --- pruneDeliveries ---
  describe('pruneDeliveries', () => {
    it('should remove oldest deliveries beyond max per webhook', async () => {
      const whId = 'wh_test'
      for (let i = 0; i < 110; i++) {
        store.set(`del_${i}`, { id: `del_${i}`, webhookId: whId, event: 'e1', payload: {}, status: 'success', attempts: 1, createdAt: new Date(2026, 0, 1, 0, 0, i).toISOString() } as WebhookDelivery)
      }
      const pruned = await pruneDeliveries(100)
      expect(pruned).toBe(10)
    })

    it('should support custom max per webhook', async () => {
      const whId = 'wh_test'
      for (let i = 0; i < 15; i++) {
        store.set(`del_${i}`, { id: `del_${i}`, webhookId: whId, event: 'e1', payload: {}, status: 'success', attempts: 1, createdAt: new Date(2026, 0, 1, 0, 0, i).toISOString() } as WebhookDelivery)
      }
      const pruned = await pruneDeliveries(10)
      expect(pruned).toBe(5)
    })
  })

  // --- testSubscription ---
  describe('testSubscription', () => {
    it('should send test event and return success/latency', async () => {
      mockFetch.mockResolvedValue(makeFetchResponse(200))
      const sub = makeSubscription()
      const result = await testSubscription(sub)
      expect(result.success).toBe(true)
      expect(result.responseStatus).toBe(200)
      expect(result.latencyMs).toBeGreaterThanOrEqual(0)
    })

    it('should return failure on non-2xx response', async () => {
      mockFetch.mockResolvedValue(makeFetchResponse(500, 'Error'))
      const sub = makeSubscription()
      const result = await testSubscription(sub)
      expect(result.success).toBe(false)
      expect(result.responseStatus).toBe(500)
    })

    it('should return failure on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))
      const sub = makeSubscription()
      const result = await testSubscription(sub)
      expect(result.success).toBe(false)
    })
  })

  // --- Subscription cache ---
  describe('subscription cache', () => {
    it('should invalidate cache', () => {
      // No throw
      expect(() => invalidateSubscriptionCache()).not.toThrow()
    })
  })
})
