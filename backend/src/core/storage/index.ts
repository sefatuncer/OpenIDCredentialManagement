/**
 * Storage Adapters Module
 *
 * Provides pluggable storage backends for the AI Agent Identity System.
 * Supports in-memory (development), PostgreSQL (production), and Redis (caching).
 */

export * from './IStorageAdapter'
export * from './InMemoryStorageAdapter'
export * from './PostgresStorageAdapter'
export * from './RedisStorageAdapter'

import { IStorageAdapter, IStorageAdapterFactory } from './IStorageAdapter'
import { inMemoryStorageFactory } from './InMemoryStorageAdapter'
import { postgresStorageFactory } from './PostgresStorageAdapter'
import { redisStorageFactory, isRedisConfigured } from './RedisStorageAdapter'
import { logger } from '../../utils/logger'

/**
 * Storage type configuration
 */
export type StorageType = 'memory' | 'postgres' | 'redis' | 'auto'

/**
 * Current active storage factory
 */
let activeStorageFactory: IStorageAdapterFactory = inMemoryStorageFactory

/**
 * Cache storage factory (optional Redis layer)
 */
let cacheStorageFactory: IStorageAdapterFactory | null = null

/**
 * Get the active storage factory
 */
export function getStorageFactory(): IStorageAdapterFactory {
  return activeStorageFactory
}

/**
 * Get the cache storage factory (if configured)
 */
export function getCacheStorageFactory(): IStorageAdapterFactory | null {
  return cacheStorageFactory
}

/**
 * Set the active storage factory
 */
export function setStorageFactory(factory: IStorageAdapterFactory): void {
  activeStorageFactory = factory
}

/**
 * Initialize storage with the specified type
 */
export async function initializeStorage(type: StorageType = 'auto'): Promise<IStorageAdapterFactory> {
  logger.info('Initializing storage', { type })

  if (type === 'auto') {
    // Try PostgreSQL first, fall back to memory
    if (await postgresStorageFactory.isAvailable()) {
      type = 'postgres'
    } else {
      type = 'memory'
      logger.info('PostgreSQL not available, using in-memory storage')
    }
  }

  switch (type) {
    case 'postgres':
      await postgresStorageFactory.initialize()
      activeStorageFactory = postgresStorageFactory
      logger.info('Storage initialized with PostgreSQL backend')
      break

    case 'redis':
      await redisStorageFactory.initialize()
      activeStorageFactory = redisStorageFactory
      logger.info('Storage initialized with Redis backend')
      break

    case 'memory':
    default:
      await inMemoryStorageFactory.initialize()
      activeStorageFactory = inMemoryStorageFactory
      logger.info('Storage initialized with in-memory backend')
      break
  }

  // Initialize Redis as cache layer if configured and not already primary
  if (type !== 'redis' && isRedisConfigured()) {
    try {
      await redisStorageFactory.initialize()
      cacheStorageFactory = redisStorageFactory
      logger.info('Redis cache layer initialized')
    } catch (error) {
      logger.warn('Redis cache initialization failed, continuing without cache', {
        error: (error as Error).message,
      })
    }
  }

  return activeStorageFactory
}

/**
 * Shutdown storage and cleanup resources
 */
export async function shutdownStorage(): Promise<void> {
  await activeStorageFactory.shutdown()

  if (cacheStorageFactory) {
    await cacheStorageFactory.shutdown()
    cacheStorageFactory = null
  }

  logger.info('Storage shutdown complete')
}

/**
 * Create a storage adapter for the given collection
 * Uses the currently active storage factory
 */
export function createStorageAdapter<T = any>(
  collection: string
): IStorageAdapter<T> {
  return activeStorageFactory.create<T>(collection)
}

/**
 * Create a cache adapter for the given collection
 * Uses Redis if available, otherwise returns null
 */
export function createCacheAdapter<T = any>(
  collection: string
): IStorageAdapter<T> | null {
  if (!cacheStorageFactory) {
    return null
  }
  return cacheStorageFactory.create<T>(collection)
}

/**
 * Get the current storage type
 */
export function getStorageType(): string {
  return activeStorageFactory.getStorageType()
}

/**
 * Check if storage is using persistent backend
 */
export function isPersistentStorage(): boolean {
  return activeStorageFactory.getStorageType() !== 'memory'
}

/**
 * Check if cache layer is available
 */
export function isCacheAvailable(): boolean {
  return cacheStorageFactory !== null
}

/**
 * Get storage status summary
 */
export function getStorageStatus(): {
  primary: string
  cache: string | null
  persistent: boolean
} {
  return {
    primary: activeStorageFactory.getStorageType(),
    cache: cacheStorageFactory?.getStorageType() || null,
    persistent: isPersistentStorage(),
  }
}
