/**
 * Core Module
 *
 * Central export for all core infrastructure components of the
 * AI Agent Identity System.
 */

// Storage adapters
export * from './storage'

// Feature flags
export * from './feature-flags'

// Event bus
export * from './event-bus'

// Plugin registry
export * from './plugin-registry'

// Re-export key instances for convenience
import { eventBus } from './event-bus'
import { pluginRegistry } from './plugin-registry'
import {
  initializeStorage,
  shutdownStorage,
  getStorageFactory,
  getStorageType,
} from './storage'
import {
  initializeFeatureFlags,
  isFeatureEnabled,
  getEnabledFeatures,
} from './feature-flags'
import { logger } from '../utils/logger'

/**
 * Core initialization options
 */
export interface CoreInitOptions {
  /** Storage type to use (memory, postgres, auto) */
  storageType?: 'memory' | 'postgres' | 'auto'

  /** Initialize plugins after core init */
  initializePlugins?: boolean

  /** Skip feature flags initialization */
  skipFeatureFlags?: boolean
}

/**
 * Initialize all core infrastructure
 */
export async function initializeCore(options: CoreInitOptions = {}): Promise<void> {
  logger.info('Initializing core infrastructure...')

  // Initialize feature flags first
  if (!options.skipFeatureFlags) {
    initializeFeatureFlags()
    logger.info('Feature flags initialized', {
      enabled: getEnabledFeatures(),
    })
  }

  // Initialize storage
  const storageType = options.storageType || 'auto'
  await initializeStorage(storageType)
  logger.info('Storage initialized', { type: getStorageType() })

  // Emit system startup event
  eventBus.emit('system.startup', {
    storageType: getStorageType(),
    features: getEnabledFeatures(),
    timestamp: new Date(),
  })

  // Initialize plugins if requested
  if (options.initializePlugins) {
    await pluginRegistry.initializeAll()
  }

  logger.info('Core infrastructure initialized successfully')
}

/**
 * Shutdown all core infrastructure
 */
export async function shutdownCore(): Promise<void> {
  logger.info('Shutting down core infrastructure...')

  // Emit shutdown event
  eventBus.emit('system.shutdown', {
    timestamp: new Date(),
  })

  // Shutdown plugins first
  await pluginRegistry.shutdownAll()

  // Shutdown storage
  await shutdownStorage()

  // Clear event handlers
  eventBus.removeAllListeners()

  logger.info('Core infrastructure shutdown complete')
}

/**
 * Get core status for health checks
 */
export async function getCoreStatus(): Promise<{
  storage: { type: string; available: boolean }
  features: { enabled: string[]; total: number }
  plugins: { active: number; total: number }
  events: { subscriptions: number; historySize: number }
}> {
  const storage = getStorageFactory()

  return {
    storage: {
      type: storage.getStorageType(),
      available: await storage.isAvailable(),
    },
    features: {
      enabled: getEnabledFeatures(),
      total: Object.keys(
        await import('./feature-flags').then((m) => m.getAllFeatureFlags())
      ).length,
    },
    plugins: {
      active: pluginRegistry.getStats().active,
      total: pluginRegistry.list().length,
    },
    events: {
      subscriptions: eventBus.getSubscriptionCount(),
      historySize: eventBus.getHistory().length,
    },
  }
}

// Export instances
export { eventBus, pluginRegistry }
