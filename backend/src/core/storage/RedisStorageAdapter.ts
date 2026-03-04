/**
 * Redis Storage Adapter
 *
 * Provides a Redis-based storage implementation for caching and fast access.
 * Uses JSON serialization for storing complex objects.
 */

// Conditional import for ioredis - will be undefined if not installed
let Redis: any
let RedisClient: any
try {
  const ioredis = require('ioredis')
  Redis = ioredis.default || ioredis
  RedisClient = Redis
} catch {
  // ioredis not installed - Redis adapter will not work
}
import {
  IStorageAdapter,
  IStorageAdapterFactory,
  QueryFilter,
  QueryResult,
} from './IStorageAdapter'
import { logger } from '../../utils/logger'

/**
 * Redis connection configuration
 */
export interface RedisConfig {
  host?: string
  port?: number
  password?: string
  db?: number
  keyPrefix?: string
  url?: string
  tls?: boolean
  connectTimeout?: number
  maxRetriesPerRequest?: number
}

/**
 * Get Redis configuration from environment
 */
export function getRedisConfig(): RedisConfig {
  const redisUrl = process.env.REDIS_URL

  if (redisUrl) {
    return { url: redisUrl }
  }

  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'ai_identity:',
    tls: process.env.REDIS_TLS === 'true',
    connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '10000'),
    maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES || '3'),
  }
}

/**
 * Check if ioredis is available
 */
export function isRedisModuleAvailable(): boolean {
  return Redis !== undefined
}

/**
 * Redis storage adapter
 */
export class RedisStorageAdapter<T>
  implements IStorageAdapter<T>
{
  private client: any
  private collection: string
  private keyPrefix: string

  constructor(client: any, collection: string, keyPrefix: string = '') {
    this.client = client
    this.collection = collection
    this.keyPrefix = keyPrefix
  }

  /**
   * Build full key with prefix and collection
   */
  private buildKey(key: string): string {
    return `${this.keyPrefix}${this.collection}:${key}`
  }

  /**
   * Build pattern for scanning keys
   */
  private buildPattern(prefix?: string): string {
    if (prefix) {
      return `${this.keyPrefix}${this.collection}:${prefix}*`
    }
    return `${this.keyPrefix}${this.collection}:*`
  }

  async save(key: string, data: T): Promise<void> {
    const fullKey = this.buildKey(key)
    const serialized = JSON.stringify(data, this.dateReplacer)
    await this.client.set(fullKey, serialized)
  }

  async get(key: string): Promise<T | null> {
    const fullKey = this.buildKey(key)
    const data = await this.client.get(fullKey)

    if (!data) {
      return null
    }

    return JSON.parse(data, this.dateReviver) as T
  }

  async delete(key: string): Promise<boolean> {
    const fullKey = this.buildKey(key)
    const result = await this.client.del(fullKey)
    return result > 0
  }

  async list(prefix?: string): Promise<T[]> {
    const pattern = this.buildPattern(prefix)
    const keys = await this.scanKeys(pattern)

    if (keys.length === 0) {
      return []
    }

    const values: (string | null)[] = await this.client.mget(...keys)
    return values
      .filter((v: string | null): v is string => v !== null)
      .map((v: string) => JSON.parse(v, this.dateReviver) as T)
  }

  async query(filter: QueryFilter): Promise<QueryResult<T>> {
    // Get all items first (Redis doesn't support complex queries natively)
    let items = await this.list()

    // Apply where filters
    if (filter.where) {
      items = items.filter((item) => {
        const record = item as Record<string, unknown>
        return Object.entries(filter.where!).every(([field, value]) => {
          const itemValue = record[field]
          if (Array.isArray(value)) {
            return value.includes(itemValue)
          }
          return itemValue === value
        })
      })
    }

    // Apply date range filter
    if (filter.dateRange) {
      const { field, start, end } = filter.dateRange
      items = items.filter((item) => {
        const record = item as Record<string, unknown>
        const dateValue = record[field]
        if (!(dateValue instanceof Date) && typeof dateValue !== 'string') {
          return true
        }
        const date = new Date(dateValue as string | Date)
        if (start && date < start) return false
        if (end && date > end) return false
        return true
      })
    }

    // Get total before pagination
    const total = items.length

    // Apply sorting
    if (filter.orderBy) {
      const descending = filter.orderBy.startsWith('-')
      const field = descending ? filter.orderBy.slice(1) : filter.orderBy
      items.sort((a, b) => {
        const aRec = a as Record<string, unknown>
        const bRec = b as Record<string, unknown>
        const aVal = aRec[field]
        const bVal = bRec[field]
        if (aVal === bVal) return 0
        if (aVal === null || aVal === undefined) return 1
        if (bVal === null || bVal === undefined) return -1
        const comparison = aVal < bVal ? -1 : 1
        return descending ? -comparison : comparison
      })
    }

    // Apply pagination
    const offset = filter.offset || 0
    const limit = filter.limit || 100
    items = items.slice(offset, offset + limit)

    return {
      data: items,
      total,
      hasMore: offset + items.length < total,
    }
  }

  async count(filter?: QueryFilter): Promise<number> {
    if (!filter || (!filter.where && !filter.dateRange)) {
      const pattern = this.buildPattern()
      const keys = await this.scanKeys(pattern)
      return keys.length
    }

    const result = await this.query({ ...filter, limit: undefined, offset: undefined })
    return result.total
  }

  async exists(key: string): Promise<boolean> {
    const fullKey = this.buildKey(key)
    const result = await this.client.exists(fullKey)
    return result > 0
  }

  async update(key: string, data: Partial<T>): Promise<T | null> {
    const existing = await this.get(key)
    if (!existing) {
      return null
    }

    const updated = { ...existing, ...data } as T
    await this.save(key, updated)
    return updated
  }

  async clear(): Promise<void> {
    const pattern = this.buildPattern()
    const keys = await this.scanKeys(pattern)

    if (keys.length > 0) {
      await this.client.del(...keys)
    }
  }

  getAdapterType(): string {
    return 'redis'
  }

  /**
   * Set expiration on a key (Redis-specific feature)
   */
  async setExpiration(key: string, seconds: number): Promise<void> {
    const fullKey = this.buildKey(key)
    await this.client.expire(fullKey, seconds)
  }

  /**
   * Get TTL for a key
   */
  async getTTL(key: string): Promise<number> {
    const fullKey = this.buildKey(key)
    return this.client.ttl(fullKey)
  }

  /**
   * Scan keys matching a pattern using SCAN command (cursor-based)
   */
  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = []
    let cursor = '0'

    do {
      const [nextCursor, foundKeys] = await this.client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100
      )
      cursor = nextCursor
      keys.push(...foundKeys)
    } while (cursor !== '0')

    return keys
  }

  /**
   * JSON replacer for Date objects
   */
  private dateReplacer(key: string, value: unknown): unknown {
    if (value instanceof Date) {
      return { __type: 'Date', value: value.toISOString() }
    }
    return value
  }

  /**
   * JSON reviver for Date objects
   */
  private dateReviver(key: string, value: unknown): unknown {
    if (
      typeof value === 'object' &&
      value !== null &&
      (value as any).__type === 'Date'
    ) {
      return new Date((value as any).value)
    }
    // Also handle ISO date strings
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
      return new Date(value)
    }
    return value
  }
}

/**
 * Redis storage adapter factory
 */
export class RedisStorageAdapterFactory implements IStorageAdapterFactory {
  private client: any | null = null
  private adapters: Map<string, RedisStorageAdapter<any>> = new Map()
  private config: RedisConfig
  private keyPrefix: string

  constructor(config?: RedisConfig) {
    this.config = config || getRedisConfig()
    this.keyPrefix = this.config.keyPrefix || 'ai_identity:'
  }

  /**
   * Initialize Redis connection
   */
  async initialize(): Promise<void> {
    if (!isRedisModuleAvailable()) {
      throw new Error('Redis module (ioredis) is not installed. Run: npm install ioredis')
    }

    if (this.client) {
      return
    }

    try {
      if (this.config.url) {
        this.client = new Redis(this.config.url, {
          maxRetriesPerRequest: this.config.maxRetriesPerRequest,
          connectTimeout: this.config.connectTimeout,
          lazyConnect: true,
        })
      } else {
        this.client = new Redis({
          host: this.config.host,
          port: this.config.port,
          password: this.config.password,
          db: this.config.db,
          maxRetriesPerRequest: this.config.maxRetriesPerRequest,
          connectTimeout: this.config.connectTimeout,
          tls: this.config.tls ? {} : undefined,
          lazyConnect: true,
        })
      }

      // Connect
      await this.client.connect()

      // Test connection
      await this.client.ping()

      logger.info('Redis storage adapter factory initialized', {
        host: this.config.host || 'from URL',
        db: this.config.db,
      })
    } catch (error) {
      logger.error('Failed to initialize Redis connection', { error })
      this.client = null
      throw error
    }
  }

  create<T = any>(collection: string): IStorageAdapter<T> {
    if (!this.client) {
      throw new Error('Redis not initialized. Call initialize() first.')
    }

    if (!this.adapters.has(collection)) {
      this.adapters.set(
        collection,
        new RedisStorageAdapter<T>(this.client, collection, this.keyPrefix)
      )
    }

    return this.adapters.get(collection)!
  }

  getStorageType(): string {
    return 'redis'
  }

  async isAvailable(): Promise<boolean> {
    if (!isRedisModuleAvailable()) {
      return false
    }

    if (!this.client) {
      // Try to connect
      try {
        await this.initialize()
        return true
      } catch {
        return false
      }
    }

    try {
      await this.client.ping()
      return true
    } catch {
      return false
    }
  }

  async shutdown(): Promise<void> {
    if (this.client) {
      await this.client.quit()
      this.client = null
    }
    this.adapters.clear()
    logger.info('Redis storage adapter factory shutdown')
  }

  /**
   * Get the underlying Redis client (for advanced operations)
   */
  getClient(): any | null {
    return this.client
  }

  /**
   * Get all collection names
   */
  getCollections(): string[] {
    return Array.from(this.adapters.keys())
  }

  /**
   * Flush all data (use with caution!)
   */
  async flushAll(): Promise<void> {
    if (!this.client) return

    const pattern = `${this.keyPrefix}*`
    let cursor = '0'

    do {
      const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
      cursor = nextCursor
      if (keys.length > 0) {
        await this.client.del(...keys)
      }
    } while (cursor !== '0')

    logger.warn('Redis data flushed')
  }
}

/**
 * Check if Redis is configured
 */
export function isRedisConfigured(): boolean {
  return !!(process.env.REDIS_URL || process.env.REDIS_HOST)
}

/**
 * Global Redis storage factory instance
 */
export const redisStorageFactory = new RedisStorageAdapterFactory()
