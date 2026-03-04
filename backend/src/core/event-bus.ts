/**
 * Event Bus System
 *
 * Provides a pub/sub event system for inter-service communication
 * in the AI Agent Identity System.
 */

import { logger } from '../utils/logger'

/**
 * Event categories
 */
export type EventCategory =
  | 'credential'
  | 'verification'
  | 'trust'
  | 'audit'
  | 'system'
  | 'storage'
  | 'auth'

/**
 * Standard event types
 */
export type StandardEventType =
  // Credential events
  | 'credential.offer.created'
  | 'credential.offer.claimed'
  | 'credential.offer.expired'
  | 'credential.issued'
  | 'credential.received'
  | 'credential.revoked'
  | 'credential.unrevoked'
  | 'credential.deleted'
  // Verification events
  | 'verification.started'
  | 'verification.completed'
  | 'verification.failed'
  | 'presentation.created'
  | 'presentation.verified'
  // Trust registry events
  | 'trust.entity.added'
  | 'trust.entity.updated'
  | 'trust.entity.removed'
  | 'trust.anchor.added'
  | 'trust.anchor.removed'
  | 'trust.policy.created'
  | 'trust.policy.updated'
  // Audit events
  | 'audit.log.created'
  | 'audit.log.exported'
  | 'audit.log.cleared'
  // System events
  | 'system.startup'
  | 'system.shutdown'
  | 'system.error'
  | 'system.warning'
  // Storage events
  | 'storage.initialized'
  | 'storage.migrated'
  | 'storage.error'
  // Auth events
  | 'auth.token.issued'
  | 'auth.token.revoked'
  | 'auth.token.expired'

/**
 * Event data structure
 */
export interface Event<T = unknown> {
  id: string
  type: StandardEventType | string
  category: EventCategory
  timestamp: Date
  data: T
  source?: string
  correlationId?: string
  metadata?: Record<string, unknown>
}

/**
 * Event handler function type
 */
export type EventHandler<T = unknown> = (event: Event<T>) => void | Promise<void>

/**
 * Event subscription
 */
interface Subscription {
  id: string
  eventType: string | RegExp
  handler: EventHandler
  once: boolean
}

/**
 * Event Bus implementation
 */
export class EventBus {
  private subscriptions: Map<string, Subscription> = new Map()
  private eventHistory: Event[] = []
  private maxHistorySize: number = 1000
  private eventCounter: number = 0

  /**
   * Emit an event
   */
  emit<T>(
    type: StandardEventType | string,
    data: T,
    options?: {
      source?: string
      correlationId?: string
      metadata?: Record<string, unknown>
    }
  ): Event<T> {
    const event: Event<T> = {
      id: this.generateEventId(),
      type,
      category: this.extractCategory(type),
      timestamp: new Date(),
      data,
      source: options?.source,
      correlationId: options?.correlationId,
      metadata: options?.metadata,
    }

    // Store in history
    this.addToHistory(event)

    // Log the event
    logger.debug('Event emitted', {
      eventId: event.id,
      type: event.type,
      category: event.category,
    })

    // Notify handlers
    this.notifyHandlers(event)

    return event
  }

  /**
   * Subscribe to events of a specific type
   */
  on<T = unknown>(
    eventType: StandardEventType | string | RegExp,
    handler: EventHandler<T>
  ): () => void {
    const subscription: Subscription = {
      id: this.generateSubscriptionId(),
      eventType,
      handler: handler as EventHandler,
      once: false,
    }

    this.subscriptions.set(subscription.id, subscription)

    // Return unsubscribe function
    return () => this.off(subscription.id)
  }

  /**
   * Subscribe to an event once
   */
  once<T = unknown>(
    eventType: StandardEventType | string | RegExp,
    handler: EventHandler<T>
  ): () => void {
    const subscription: Subscription = {
      id: this.generateSubscriptionId(),
      eventType,
      handler: handler as EventHandler,
      once: true,
    }

    this.subscriptions.set(subscription.id, subscription)

    return () => this.off(subscription.id)
  }

  /**
   * Unsubscribe by subscription ID
   */
  off(subscriptionId: string): boolean {
    return this.subscriptions.delete(subscriptionId)
  }

  /**
   * Remove all handlers for a specific event type
   */
  removeAllListeners(eventType?: StandardEventType | string): void {
    if (eventType) {
      for (const [id, sub] of this.subscriptions.entries()) {
        if (this.matchesEventType(eventType, sub.eventType)) {
          this.subscriptions.delete(id)
        }
      }
    } else {
      this.subscriptions.clear()
    }
  }

  /**
   * Get event history
   */
  getHistory(filter?: {
    type?: StandardEventType | string
    category?: EventCategory
    since?: Date
    limit?: number
  }): Event[] {
    let events = [...this.eventHistory]

    if (filter?.type) {
      events = events.filter((e) => e.type === filter.type)
    }
    if (filter?.category) {
      events = events.filter((e) => e.category === filter.category)
    }
    if (filter?.since) {
      events = events.filter((e) => e.timestamp >= filter.since!)
    }

    if (filter?.limit) {
      events = events.slice(0, filter.limit)
    }

    return events
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory = []
  }

  /**
   * Get subscription count
   */
  getSubscriptionCount(): number {
    return this.subscriptions.size
  }

  /**
   * Wait for an event (promise-based)
   */
  waitFor<T = unknown>(
    eventType: StandardEventType | string,
    timeout?: number
  ): Promise<Event<T>> {
    return new Promise((resolve, reject) => {
      const unsubscribe = this.once<T>(eventType, (event) => {
        if (timer) clearTimeout(timer)
        resolve(event)
      })

      let timer: NodeJS.Timeout | undefined
      if (timeout) {
        timer = setTimeout(() => {
          unsubscribe()
          reject(new Error(`Timeout waiting for event: ${eventType}`))
        }, timeout)
      }
    })
  }

  /**
   * Private: Notify all matching handlers
   */
  private notifyHandlers(event: Event): void {
    const toRemove: string[] = []

    for (const [id, subscription] of this.subscriptions.entries()) {
      if (this.matchesEventType(event.type, subscription.eventType)) {
        try {
          const result = subscription.handler(event)

          // Handle async handlers
          if (result instanceof Promise) {
            result.catch((error) => {
              logger.error('Async event handler error', {
                eventType: event.type,
                error,
              })
            })
          }
        } catch (error) {
          logger.error('Event handler error', {
            eventType: event.type,
            subscriptionId: id,
            error,
          })
        }

        if (subscription.once) {
          toRemove.push(id)
        }
      }
    }

    // Remove one-time handlers
    for (const id of toRemove) {
      this.subscriptions.delete(id)
    }
  }

  /**
   * Private: Check if event type matches subscription
   */
  private matchesEventType(
    eventType: string,
    subscriptionType: string | RegExp
  ): boolean {
    if (subscriptionType instanceof RegExp) {
      return subscriptionType.test(eventType)
    }

    // Support wildcard matching
    if (subscriptionType.includes('*')) {
      const regex = new RegExp(
        '^' + subscriptionType.replace(/\*/g, '.*') + '$'
      )
      return regex.test(eventType)
    }

    return eventType === subscriptionType
  }

  /**
   * Private: Extract category from event type
   */
  private extractCategory(type: string): EventCategory {
    const prefix = type.split('.')[0]
    const validCategories: EventCategory[] = [
      'credential',
      'verification',
      'trust',
      'audit',
      'system',
      'storage',
      'auth',
    ]

    if (validCategories.includes(prefix as EventCategory)) {
      return prefix as EventCategory
    }

    return 'system'
  }

  /**
   * Private: Add event to history
   */
  private addToHistory(event: Event): void {
    this.eventHistory.unshift(event)

    // Trim history if needed
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(0, this.maxHistorySize)
    }
  }

  /**
   * Private: Generate unique event ID
   */
  private generateEventId(): string {
    this.eventCounter++
    return `evt_${Date.now()}_${this.eventCounter}`
  }

  /**
   * Private: Generate unique subscription ID
   */
  private generateSubscriptionId(): string {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Set max history size
   */
  setMaxHistorySize(size: number): void {
    this.maxHistorySize = size
    if (this.eventHistory.length > size) {
      this.eventHistory = this.eventHistory.slice(0, size)
    }
  }
}

/**
 * Global event bus instance
 */
export const eventBus = new EventBus()

/**
 * Convenience function to emit events
 */
export function emitEvent<T>(
  type: StandardEventType | string,
  data: T,
  options?: {
    source?: string
    correlationId?: string
    metadata?: Record<string, unknown>
  }
): Event<T> {
  return eventBus.emit(type, data, options)
}

/**
 * Convenience function to subscribe to events
 */
export function onEvent<T = unknown>(
  eventType: StandardEventType | string | RegExp,
  handler: EventHandler<T>
): () => void {
  return eventBus.on(eventType, handler)
}
