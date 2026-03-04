/**
 * Credential Expiration Notification Service
 *
 * Monitors credentials and sends notifications before expiration
 */

import { logger } from '../utils/logger'
import { wsService } from './websocket.service'

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

type NotificationHandler = (credential: ExpiringCredential) => void | Promise<void>

class ExpirationNotifierService {
  private config: NotificationConfig = {
    warningDays: [30, 7, 1],
    checkIntervalMinutes: 60,
    enabled: true,
  }

  private credentials: Map<string, { expiresAt: Date; holderDid: string; type: string }> = new Map()
  private notifiedCredentials: Map<string, number[]> = new Map() // credentialId -> notified days
  private handlers: NotificationHandler[] = []
  private checkInterval: NodeJS.Timeout | null = null

  start(): void {
    if (!this.config.enabled) {
      logger.info('Expiration notifier is disabled')
      return
    }

    logger.info('Starting expiration notification service')

    // Initial check
    this.checkExpirations()

    // Set up periodic checks
    this.checkInterval = setInterval(
      () => this.checkExpirations(),
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

  // Register a credential for expiration tracking
  trackCredential(credentialId: string, expiresAt: Date, holderDid: string, type: string): void {
    this.credentials.set(credentialId, { expiresAt, holderDid, type })
    logger.debug(`Tracking credential ${credentialId} expiring at ${expiresAt.toISOString()}`)
  }

  // Unregister a credential
  untrackCredential(credentialId: string): void {
    this.credentials.delete(credentialId)
    this.notifiedCredentials.delete(credentialId)
  }

  // Register notification handler
  onExpiring(handler: NotificationHandler): void {
    this.handlers.push(handler)
  }

  // Get all expiring credentials
  getExpiringCredentials(withinDays: number = 30): ExpiringCredential[] {
    const now = new Date()
    const expiringList: ExpiringCredential[] = []

    for (const [credentialId, data] of this.credentials) {
      const daysUntilExpiry = Math.ceil(
        (data.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )

      if (daysUntilExpiry <= withinDays && daysUntilExpiry > 0) {
        expiringList.push({
          credentialId,
          holderDid: data.holderDid,
          type: data.type,
          expiresAt: data.expiresAt,
          daysUntilExpiry,
        })
      }
    }

    return expiringList.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry)
  }

  // Get expired credentials
  getExpiredCredentials(): ExpiringCredential[] {
    const now = new Date()
    const expiredList: ExpiringCredential[] = []

    for (const [credentialId, data] of this.credentials) {
      if (data.expiresAt <= now) {
        expiredList.push({
          credentialId,
          holderDid: data.holderDid,
          type: data.type,
          expiresAt: data.expiresAt,
          daysUntilExpiry: 0,
        })
      }
    }

    return expiredList
  }

  private checkExpirations(): void {
    const now = new Date()
    logger.debug('Checking credential expirations')

    for (const [credentialId, data] of this.credentials) {
      const daysUntilExpiry = Math.ceil(
        (data.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )

      // Check each warning day
      for (const warningDay of this.config.warningDays) {
        if (daysUntilExpiry <= warningDay && daysUntilExpiry > 0) {
          // Check if already notified for this day threshold
          const notified = this.notifiedCredentials.get(credentialId) || []
          if (!notified.includes(warningDay)) {
            this.sendNotification({
              credentialId,
              holderDid: data.holderDid,
              type: data.type,
              expiresAt: data.expiresAt,
              daysUntilExpiry,
            })

            notified.push(warningDay)
            this.notifiedCredentials.set(credentialId, notified)
          }
        }
      }

      // Check for expired credentials
      if (daysUntilExpiry <= 0) {
        const notified = this.notifiedCredentials.get(credentialId) || []
        if (!notified.includes(0)) {
          this.sendExpiredNotification({
            credentialId,
            holderDid: data.holderDid,
            type: data.type,
            expiresAt: data.expiresAt,
            daysUntilExpiry: 0,
          })

          notified.push(0)
          this.notifiedCredentials.set(credentialId, notified)
        }
      }
    }
  }

  private sendNotification(credential: ExpiringCredential): void {
    logger.info(
      `Credential ${credential.credentialId} expires in ${credential.daysUntilExpiry} days`
    )

    // Call registered handlers
    for (const handler of this.handlers) {
      try {
        handler(credential)
      } catch (error) {
        logger.error('Notification handler error', error)
      }
    }

    // Send WebSocket notification
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

  // Statistics
  getStats(): {
    tracked: number
    expiringWithin30Days: number
    expiringWithin7Days: number
    expired: number
  } {
    const expiring30 = this.getExpiringCredentials(30)
    const expiring7 = this.getExpiringCredentials(7)
    const expired = this.getExpiredCredentials()

    return {
      tracked: this.credentials.size,
      expiringWithin30Days: expiring30.length,
      expiringWithin7Days: expiring7.length,
      expired: expired.length,
    }
  }
}

export const expirationNotifier = new ExpirationNotifierService()
