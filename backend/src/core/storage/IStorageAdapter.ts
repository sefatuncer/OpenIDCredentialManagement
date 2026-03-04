/**
 * Storage Adapter Interface
 *
 * Provides an abstraction layer for data persistence, allowing the system
 * to switch between different storage backends (in-memory, PostgreSQL, Redis, etc.)
 */

/**
 * Query filter options for listing/querying data
 */
export interface QueryFilter {
  /** Filter by field values */
  where?: Record<string, unknown>
  /** Sort by field (prefix with - for descending) */
  orderBy?: string
  /** Maximum number of results */
  limit?: number
  /** Number of results to skip */
  offset?: number
  /** Date range filter */
  dateRange?: {
    field: string
    start?: Date
    end?: Date
  }
}

/**
 * Query result with pagination metadata
 */
export interface QueryResult<T> {
  data: T[]
  total: number
  hasMore: boolean
}

/**
 * Storage adapter interface for generic data persistence
 */
export interface IStorageAdapter<T> {
  /**
   * Save a value with the given key
   */
  save(key: string, data: T): Promise<void>

  /**
   * Get a value by key
   */
  get(key: string): Promise<T | null>

  /**
   * Delete a value by key
   */
  delete(key: string): Promise<boolean>

  /**
   * List all values, optionally filtered by prefix
   */
  list(prefix?: string): Promise<T[]>

  /**
   * Query values with filters
   */
  query(filter: QueryFilter): Promise<QueryResult<T>>

  /**
   * Count values matching optional filter
   */
  count(filter?: QueryFilter): Promise<number>

  /**
   * Check if a key exists
   */
  exists(key: string): Promise<boolean>

  /**
   * Update a value (partial update)
   */
  update(key: string, data: Partial<T>): Promise<T | null>

  /**
   * Clear all data (use with caution)
   */
  clear(): Promise<void>

  /**
   * Get adapter name/type
   */
  getAdapterType(): string
}

/**
 * Storage adapter factory interface
 */
export interface IStorageAdapterFactory {
  /**
   * Create a storage adapter for the given collection/table
   * Note: T should be a Record-like object type for proper serialization
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  create<T = any>(collection: string): IStorageAdapter<T>

  /**
   * Get the storage type (memory, postgres, redis)
   */
  getStorageType(): string

  /**
   * Check if the storage backend is available
   */
  isAvailable(): Promise<boolean>

  /**
   * Initialize the storage backend
   */
  initialize(): Promise<void>

  /**
   * Close connections and cleanup
   */
  shutdown(): Promise<void>
}

/**
 * Transaction support interface (optional)
 */
export interface ITransactionalStorageAdapter<T> extends IStorageAdapter<T> {
  /**
   * Execute operations within a transaction
   */
  withTransaction<R>(callback: () => Promise<R>): Promise<R>

  /**
   * Begin a transaction
   */
  beginTransaction(): Promise<void>

  /**
   * Commit the current transaction
   */
  commit(): Promise<void>

  /**
   * Rollback the current transaction
   */
  rollback(): Promise<void>
}

/**
 * Storage events for monitoring and debugging
 */
export type StorageEvent =
  | 'save'
  | 'get'
  | 'delete'
  | 'list'
  | 'query'
  | 'update'
  | 'clear'
  | 'error'

export interface StorageEventData {
  event: StorageEvent
  collection: string
  key?: string
  duration?: number
  success: boolean
  error?: Error
}
