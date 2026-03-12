/**
 * Webhook Service — CRUD for webhook subscriptions
 *
 * Delivery engine is in webhookDelivery.service.ts.
 * Storage: PostgreSQL via IStorageAdapter (webhooks)
 */

import crypto from 'crypto'
import { logger } from '../utils/logger'
import { isPrivateUrl } from '../utils/url-validation'
import { createStorageAdapter, IStorageAdapter } from '../core/storage'
import {
  deliverEvent as _deliverEvent,
  testSubscription as _testSubscription,
  getDeliveries,
  pruneDeliveries,
  invalidateSubscriptionCache,
} from './webhookDelivery.service'

export interface WebhookSubscription {
  id: string
  url: string
  secret: string
  events: string[]
  active: boolean
  createdAt: string
  updatedAt: string
  metadata?: {
    name?: string
    description?: string
    createdBy?: string
  }
}

export interface WebhookDelivery {
  id: string
  webhookId: string
  event: string
  payload: Record<string, unknown>
  status: 'pending' | 'success' | 'failed'
  attempts: number
  lastAttemptAt?: string
  responseStatus?: number
  responseBody?: string
  createdAt: string
}

const MAX_SUBSCRIPTIONS = 20

// Lazy storage initialization
let webhookStorage: IStorageAdapter<WebhookSubscription> | null = null

function getWebhookStorage(): IStorageAdapter<WebhookSubscription> {
  if (!webhookStorage) {
    webhookStorage = createStorageAdapter<WebhookSubscription>('webhooks')
  }
  return webhookStorage
}

// isPrivateUrl imported from ../utils/url-validation

// --- CRUD ---

export async function createSubscription(
  url: string,
  events: string[],
  metadata?: { name?: string; description?: string; createdBy?: string },
): Promise<WebhookSubscription> {
  if (isPrivateUrl(url)) {
    throw new Error('Webhook URL must not point to private/reserved addresses')
  }

  const all = await getWebhookStorage().list()
  if (all.length >= MAX_SUBSCRIPTIONS) {
    throw new Error(`Maximum ${MAX_SUBSCRIPTIONS} webhook subscriptions allowed`)
  }

  const now = new Date().toISOString()
  const subscription: WebhookSubscription = {
    id: `wh_${crypto.randomUUID()}`,
    url,
    secret: crypto.randomBytes(32).toString('hex'),
    events,
    active: true,
    createdAt: now,
    updatedAt: now,
    metadata,
  }

  await getWebhookStorage().save(subscription.id, subscription)
  invalidateSubscriptionCache()
  logger.info('Webhook subscription created', { id: subscription.id, url, events })
  return subscription
}

export async function updateSubscription(
  id: string,
  updates: Partial<Pick<WebhookSubscription, 'url' | 'events' | 'active' | 'metadata'>>,
): Promise<WebhookSubscription | null> {
  const existing = await getWebhookStorage().get(id)
  if (!existing) return null

  if (updates.url && isPrivateUrl(updates.url)) {
    throw new Error('Webhook URL must not point to private/reserved addresses')
  }

  const updated: WebhookSubscription = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  }

  await getWebhookStorage().save(id, updated)
  invalidateSubscriptionCache()
  logger.info('Webhook subscription updated', { id })
  return updated
}

export async function deleteSubscription(id: string): Promise<boolean> {
  const existing = await getWebhookStorage().get(id)
  if (!existing) return false

  await getWebhookStorage().delete(id)
  invalidateSubscriptionCache()
  logger.info('Webhook subscription deleted', { id })
  return true
}

export async function listSubscriptions(): Promise<WebhookSubscription[]> {
  return getWebhookStorage().list()
}

export async function getSubscription(id: string): Promise<WebhookSubscription | null> {
  return getWebhookStorage().get(id)
}

// --- Delivery (delegated to webhookDelivery.service.ts) ---

export async function deliverEvent(event: string, data: unknown): Promise<void> {
  return _deliverEvent(event, data, () => getWebhookStorage().list())
}

export async function testSubscription(id: string): Promise<{
  success: boolean
  responseStatus?: number
  latencyMs: number
}> {
  const sub = await getWebhookStorage().get(id)
  if (!sub) throw new Error('Webhook subscription not found')
  return _testSubscription(sub)
}

export { getDeliveries, pruneDeliveries }
