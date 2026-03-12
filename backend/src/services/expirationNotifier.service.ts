/**
 * Credential Expiration Notification Service
 *
 * Monitors credentials and sends notifications before expiration
 * Storage: PostgreSQL via IStorageAdapter (expiration_credentials, expiration_notifications)
 */

import { logger } from '../utils/logger'
import { wsService } from './websocket.service'
import { createStorageAdapter, IStorageAdapter } from '../core/storage'

export interface ExpiringCredential {
  credentialId: string
  holderDid: string
  type: string
  expiresAt: Date
  daysUntilExpiry: number
}

export interface NotificationConfig {
  warningDays: number[] // Days before expiry to warn (e.g., [30, 7, 1])
  checkIntervalMinutes: number
  enabled: boolean
}

interface TrackedCredential {
  credentialId: string
  expiresAt: string // ISO string for JSONB serialization
  holderDid: string
  type: string
}

interface NotificationRecord {
  credentialId: string
  notifiedDays: number[]
}

type NotificationHandler = (credential: ExpiringCredential) => void | Promise<void>

// Lazy storage initialization
let credentialTrackingStorage: IStorageAdapter<TrackedCredential> | null = null
let notificationStorage: IStorageAdapter<NotificationRecord> | null = null

function getCredentialTrackingStorage(): IStorageAdapter<TrackedCredential> {
  if (!credentialTrackingStorage) {
    credentialTrackingStorage = createStorageAdapter<TrackedCredential>('expiration_credentials')
  }
  return credentialTrackingStorage
}

function getNotificationStorage(): IStorageAdapter<NotificationRecord> {
  if (!notificationStorage) {
    notificationStorage = createStorageAdapter<NotificationRecord>('expiration_notifications')
  }
  return notificationStorage
}

class ExpirationNotifierService {
  private config: NotificationConfig = {
    warningDays: [30, 7, 1],
    checkIntervalMinutes: 60,
    enabled: true,
  }

  private handlers: NotificationHandler[] = []
  private checkInterval: NodeJS.Timeout | null = null

  start(): void {
    if (!this.config.enabled) {
      logger.info('Expiration notifier is disabled')
      return
    }

    logger.info('Starting expiration notification service')

    // Initial check
    this.checkExpirations().catch((err) =>
      logger.error('Expiration check failed', err)
    )

    // Set up periodic checks
    this.checkInterval = setInterval(
      () => this.checkExpirations().catch((err) =>
        logger.error('Expiration check failed', err)
      ),
      this.config.checkIntervalMinutes * 60 * 1000
    )
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
    logger.info('Expiration notification service stopped')
  }

  configure(config: Partial<NotificationConfig>): void {
    this.config = { ...this.config, ...config }
    logger.info('Expiration notifier configured', this.config)
  }

  async trackCredential(credentialId: string, expiresAt: Date, holderDid: string, type: string): Promise<void> {
    await getCredentialTrackingStorage().save(credentialId, {
      credentialId,
      expiresAt: expiresAt.toISOString(),
      holderDid,
      type,
    })
    logger.debug(`Tracking credential ${credentialId} expiring at ${expiresAt.toISOString()}`)
  }

  async untrackCredential(credentialId: string): Promise<void> {
    await getCredentialTrackingStorage().delete(credentialId)
    await getNotificationStorage().delete(credentialId)
  }

  onExpiring(handler: NotificationHandler): void {
    this.handlers.push(handler)
  }

  async getExpiringCredentials(withinDays: number = 30): Promise<ExpiringCredential[]> {
    const now = new Date()
    const all = await getCredentialTrackingStorage().list()
    const expiringList: ExpiringCredential[] = []

    for (const data of all) {
      const expiresAt = new Date(data.expiresAt)
      const daysUntilExpiry = Math.ceil(
        (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )

      if (daysUntilExpiry <= withinDays && daysUntilExpiry > 0) {
        expiringList.push({
          credentialId: data.credentialId,
          holderDid: data.holderDid,
          type: data.type,
          expiresAt,
          daysUntilExpiry,
        })
      }
    }

    return expiringList.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry)
  }

  async getExpiredCredentials(): Promise<ExpiringCredential[]> {
    const now = new Date()
    const all = await getCredentialTrackingStorage().list()
    const expiredList: ExpiringCredential[] = []

    for (const data of all) {
      const expiresAt = new Date(data.expiresAt)
      if (expiresAt <= now) {
        expiredList.push({
          credentialId: data.credentialId,
          holderDid: data.holderDid,
          type: data.type,
          expiresAt,
          daysUntilExpiry: 0,
        })
      }
    }

    return expiredList
  }

  private async checkExpirations(): Promise<void> {
    const now = new Date()
    logger.debug('Checking credential expirations')

    const all = await getCredentialTrackingStorage().list()
    const notifStorage = getNotificationStorage()

    // Bulk load all notification records to avoid N+1 queries
    const allNotifications = await notifStorage.list()
    const notifMap = new Map<string, number[]>()
    for (const record of allNotifications) {
      notifMap.set(record.credentialId, record.notifiedDays)
    }

    for (const data of all) {
      const expiresAt = new Date(data.expiresAt)
      const daysUntilExpiry = Math.ceil(
        (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )

      const credential: ExpiringCredential = {
        credentialId: data.credentialId,
        holderDid: data.holderDid,
        type: data.type,
        expiresAt,
        daysUntilExpiry,
      }

      const notified = notifMap.get(data.credentialId) || []
      let notifUpdated = false

      // Check each warning day
      for (const warningDay of this.config.warningDays) {
        if (daysUntilExpiry <= warningDay && daysUntilExpiry > 0) {
          if (!notified.includes(warningDay)) {
            this.sendNotification(credential)
            notified.push(warningDay)
            notifUpdated = true
          }
        }
      }

      // Check for expired credentials
      if (daysUntilExpiry <= 0 && !notified.includes(0)) {
        this.sendExpiredNotification({ ...credential, daysUntilExpiry: 0 })
        notified.push(0)
        notifUpdated = true
      }

      if (notifUpdated) {
        await notifStorage.save(data.credentialId, {
          credentialId: data.credentialId,
          notifiedDays: notified,
        })
      }
    }
  }

  private sendNotification(credential: ExpiringCredential): void {
    logger.info(
      `Credential ${credential.credentialId} expires in ${credential.daysUntilExpiry} days`
    )

    for (const handler of this.handlers) {
      try {
        handler(credential)
      } catch (error) {
        logger.error('Notification handler error', error)
      }
    }

    wsService.broadcast('credential:expiring' as any, {
      credentialId: credential.credentialId,
      holderDid: credential.holderDid,
      type: credential.type,
      expiresAt: credential.expiresAt.toISOString(),
      daysUntilExpiry: credential.daysUntilExpiry,
      warning: `Credential expires in ${credential.daysUntilExpiry} day(s)`,
    })
  }

  private sendExpiredNotification(credential: ExpiringCredential): void {
    logger.warn(`Credential ${credential.credentialId} has expired`)

    wsService.broadcast('credential:expired' as any, {
      credentialId: credential.credentialId,
      holderDid: credential.holderDid,
      type: credential.type,
      expiredAt: credential.expiresAt.toISOString(),
    })
  }

  async getStats(): Promise<{
    tracked: number
    expiringWithin30Days: number
    expiringWithin7Days: number
    expired: number
  }> {
    const now = new Date()
    const all = await getCredentialTrackingStorage().list()
    let expiringWithin30 = 0
    let expiringWithin7 = 0
    let expired = 0

    for (const data of all) {
      const days = Math.ceil(
        (new Date(data.expiresAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )
      if (days <= 0) expired++
      else if (days <= 7) { expiringWithin7++; expiringWithin30++ }
      else if (days <= 30) expiringWithin30++
    }

    return {
      tracked: all.length,
      expiringWithin30Days: expiringWithin30,
      expiringWithin7Days: expiringWithin7,
      expired,
    }
  }
}

export const expirationNotifier = new ExpirationNotifierService()
