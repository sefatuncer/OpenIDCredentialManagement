/**
 * Webhook Delivery Engine — HMAC-SHA256 signed HTTP delivery with retry
 *
 * Extracted from webhook.service.ts for file size compliance (~300L limit).
 * Storage: PostgreSQL via IStorageAdapter (webhook_deliveries)
 *
 * NOTE on SSRF: isPrivateUrl() checks the hostname string at subscription
 * creation time. A public hostname could theoretically resolve to a private
 * IP at delivery time (DNS rebinding). Full mitigation requires a custom
 * DNS resolver or connect-level IP check, which is a v2 improvement.
 */

import crypto from 'crypto'
import { logger } from '../utils/logger'
import { createStorageAdapter, IStorageAdapter } from '../core/storage'
import type { WebhookSubscription, WebhookDelivery } from './webhook.service'

const MAX_RETRIES = 3
const RETRY_DELAYS = [1000, 10000, 60000] // 1s, 10s, 60s
const DELIVERY_TIMEOUT = 10000 // 10s
const MAX_DELIVERIES_PER_WEBHOOK = 100
const SUBSCRIPTION_CACHE_TTL = 30000 // 30s

let deliveryStorage: IStorageAdapter<WebhookDelivery> | null = null

function getDeliveryStorage(): IStorageAdapter<WebhookDelivery> {
  if (!deliveryStorage) {
    deliveryStorage = createStorageAdapter<WebhookDelivery>('webhook_deliveries')
  }
  return deliveryStorage
}

function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

/**
 * Send a signed HTTP POST to the webhook URL
 */
async function sendWebhook(
  url: string,
  body: string,
  headers: Record<string, string>,
): Promise<{ ok: boolean; status: number; body: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body,
      signal: controller.signal,
    })

    const responseBody = (await response.text()).substring(0, 500)
    return { ok: response.ok, status: response.status, body: responseBody }
  } finally {
    clearTimeout(timeout)
  }
}

async function attemptDelivery(
  subscription: WebhookSubscription,
  delivery: WebhookDelivery,
): Promise<void> {
  const bodyStr = JSON.stringify(delivery.payload)
  const signature = signPayload(bodyStr, subscription.secret)

  try {
    delivery.attempts++
    delivery.lastAttemptAt = new Date().toISOString()

    const result = await sendWebhook(subscription.url, bodyStr, {
      'X-Webhook-Signature': `sha256=${signature}`,
      'X-Webhook-Id': delivery.webhookId,
      'X-Delivery-Id': delivery.id,
      'User-Agent': 'OIDCM-Webhook/1.0',
    })

    delivery.responseStatus = result.status
    delivery.responseBody = result.body

    if (result.ok) {
      delivery.status = 'success'
    } else if (delivery.attempts >= MAX_RETRIES) {
      delivery.status = 'failed'
    }
  } catch (error) {
    delivery.responseBody = error instanceof Error ? error.message : 'Unknown error'
    if (delivery.attempts >= MAX_RETRIES) {
      delivery.status = 'failed'
    }
  }

  await getDeliveryStorage().save(delivery.id, delivery)
}

function scheduleRetry(subscription: WebhookSubscription, delivery: WebhookDelivery): void {
  if (delivery.attempts >= MAX_RETRIES) return

  const delay = RETRY_DELAYS[delivery.attempts - 1] || RETRY_DELAYS[RETRY_DELAYS.length - 1]
  setTimeout(() => {
    attemptDelivery(subscription, delivery).catch((err) =>
      logger.error('Webhook retry failed', { deliveryId: delivery.id, error: err }),
    )
  }, delay)
}

// --- Subscription cache (avoids DB read on every event) ---

let cachedSubscriptions: WebhookSubscription[] | null = null
let cacheTimestamp = 0

export function invalidateSubscriptionCache(): void {
  cachedSubscriptions = null
  cacheTimestamp = 0
}

async function getActiveSubscriptions(
  listFn: () => Promise<WebhookSubscription[]>,
): Promise<WebhookSubscription[]> {
  const now = Date.now()
  if (cachedSubscriptions && now - cacheTimestamp < SUBSCRIPTION_CACHE_TTL) {
    return cachedSubscriptions
  }
  cachedSubscriptions = await listFn()
  cacheTimestamp = now
  return cachedSubscriptions
}

// --- Public API ---

export async function deliverEvent(
  event: string,
  data: unknown,
  listFn: () => Promise<WebhookSubscription[]>,
): Promise<void> {
  const subscriptions = await getActiveSubscriptions(listFn)
  const matching = subscriptions.filter((s) => s.active && s.events.includes(event))

  for (const sub of matching) {
    const delivery: WebhookDelivery = {
      id: generateId('del'),
      webhookId: sub.id,
      event,
      payload: { event, data, timestamp: new Date().toISOString() },
      status: 'pending',
      attempts: 0,
      createdAt: new Date().toISOString(),
    }

    await getDeliveryStorage().save(delivery.id, delivery)

    attemptDelivery(sub, delivery).then(() => {
      if (delivery.status === 'pending') {
        scheduleRetry(sub, delivery)
      }
    }).catch((err) => {
      logger.error('Webhook delivery error', { webhookId: sub.id, event, error: err })
    })
  }
}

export async function testSubscription(subscription: WebhookSubscription): Promise<{
  success: boolean
  responseStatus?: number
  latencyMs: number
}> {
  const testPayload = {
    event: 'test',
    data: { message: 'Webhook test event', webhookId: subscription.id },
    timestamp: new Date().toISOString(),
  }

  const bodyStr = JSON.stringify(testPayload)
  const signature = signPayload(bodyStr, subscription.secret)
  const start = Date.now()

  try {
    const result = await sendWebhook(subscription.url, bodyStr, {
      'X-Webhook-Signature': `sha256=${signature}`,
      'X-Webhook-Id': subscription.id,
      'User-Agent': 'OIDCM-Webhook/1.0',
    })
    return { success: result.ok, responseStatus: result.status, latencyMs: Date.now() - start }
  } catch {
    return { success: false, latencyMs: Date.now() - start }
  }
}

export async function getDeliveries(webhookId: string): Promise<WebhookDelivery[]> {
  const all = await getDeliveryStorage().list()
  return all
    .filter((d) => d.webhookId === webhookId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 50)
}

export async function pruneDeliveries(maxPerWebhook = MAX_DELIVERIES_PER_WEBHOOK): Promise<number> {
  const all = await getDeliveryStorage().list()
  const byWebhook = new Map<string, WebhookDelivery[]>()

  for (const d of all) {
    const list = byWebhook.get(d.webhookId) || []
    list.push(d)
    byWebhook.set(d.webhookId, list)
  }

  let pruned = 0
  for (const [, deliveries] of byWebhook) {
    if (deliveries.length > maxPerWebhook) {
      deliveries.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      for (const d of deliveries.slice(maxPerWebhook)) {
        await getDeliveryStorage().delete(d.id)
        pruned++
      }
    }
  }

  if (pruned > 0) {
    logger.info(`Pruned ${pruned} old webhook deliveries`)
  }
  return pruned
}
