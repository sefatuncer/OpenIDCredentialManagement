/**
 * Push Notification Service
 * Sends push notifications via Expo Push API for revocation alerts.
 * Stores push tokens in PostgreSQL via IStorageAdapter.
 */

import { logger } from '../utils/logger'
import { createStorageAdapter, IStorageAdapter } from '../core/storage'

interface PushToken {
  token: string
  platform: string
  registeredAt: string
  lastUsedAt?: string
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

let tokenStorage: IStorageAdapter<PushToken> | null = null

function getStorage(): IStorageAdapter<PushToken> {
  if (!tokenStorage) {
    tokenStorage = createStorageAdapter<PushToken>('push_tokens')
  }
  return tokenStorage
}

/**
 * Register a push token for a holder
 */
export async function registerPushToken(
  holderId: string,
  token: string,
  platform: string
): Promise<void> {
  const storage = getStorage()
  await storage.save(holderId, {
    token,
    platform,
    registeredAt: new Date().toISOString(),
  })
  logger.info(`Push token registered for holder ${holderId} (${platform})`)
}

/**
 * Remove a push token
 */
export async function removePushToken(holderId: string): Promise<void> {
  const storage = getStorage()
  await storage.delete(holderId)
}

/**
 * Send push notification to a specific holder
 */
export async function sendPushNotification(
  holderId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<boolean> {
  const storage = getStorage()
  const tokenData = await storage.get(holderId)
  if (!tokenData) return false

  return sendToToken(tokenData.token, title, body, data)
}

/**
 * Send push notification to all registered tokens
 */
export async function broadcastPushNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<number> {
  const storage = getStorage()
  const allTokens = await storage.list()
  let sent = 0

  for (const tokenData of allTokens) {
    const success = await sendToToken(tokenData.token, title, body, data)
    if (success) sent++
  }

  return sent
}

async function sendToToken(
  token: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<boolean> {
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        title,
        body,
        data: data || {},
        sound: 'default',
        channelId: 'revocation',
      }),
    })

    if (!response.ok) {
      logger.error(`Push notification failed: ${response.statusText}`)
      return false
    }

    return true
  } catch (error) {
    logger.error('Push notification error:', error)
    return false
  }
}
