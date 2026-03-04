/**
 * PostgreSQL Storage Adapter
 *
 * Provides a PostgreSQL-based persistent storage implementation.
 * Uses JSONB for flexible schema storage while maintaining SQL querying capabilities.
 */

import {
  IStorageAdapter,
  IStorageAdapterFactory,
  ITransactionalStorageAdapter,
  QueryFilter,
  QueryResult,
} from './IStorageAdapter'
import { query, transaction, isDatabaseConnected } from '../../database/connection'
import { logger } from '../../utils/logger'

/**
 * PostgreSQL storage adapter using JSONB columns
 */
export class PostgresStorageAdapter<T>
  implements ITransactionalStorageAdapter<T>
{
  private tableName: string
  private initialized: boolean = false
  private transactionClient: any = null

  constructor(collection: string) {
    // Sanitize collection name for table use
    this.tableName = `storage_${collection.replace(/[^a-zA-Z0-9_]/g, '_')}`
  }

  /**
   * Ensure the table exists
   */
  private async ensureTable(): Promise<void> {
    if (this.initialized) return

    try {
      await query(`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          key VARCHAR(255) PRIMARY KEY,
          data JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // Create index on data for JSONB queries
      await query(`
        CREATE INDEX IF NOT EXISTS idx_${this.tableName}_data
        ON ${this.tableName} USING GIN (data)
      `)

      this.initialized = true
    } catch (error) {
      logger.error('Failed to initialize storage table', {
        table: this.tableName,
        error,
      })
      throw error
    }
  }

  async save(key: string, data: T): Promise<void> {
    await this.ensureTable()

    await query(
      `
      INSERT INTO ${this.tableName} (key, data, updated_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (key)
      DO UPDATE SET data = $2, updated_at = CURRENT_TIMESTAMP
    `,
      [key, JSON.stringify(data)]
    )
  }

  async get(key: string): Promise<T | null> {
    await this.ensureTable()

    const result = await query<{ data: T }>(
      `SELECT data FROM ${this.tableName} WHERE key = $1`,
      [key]
    )

    if (result.rows.length === 0) {
      return null
    }

    return this.parseJsonbData(result.rows[0].data)
  }

  async delete(key: string): Promise<boolean> {
    await this.ensureTable()

    const result = await query(
      `DELETE FROM ${this.tableName} WHERE key = $1`,
      [key]
    )

    return (result.rowCount || 0) > 0
  }

  async list(prefix?: string): Promise<T[]> {
    await this.ensureTable()

    let sql = `SELECT data FROM ${this.tableName}`
    const params: string[] = []

    if (prefix) {
      sql += ' WHERE key LIKE $1'
      params.push(`${prefix}%`)
    }

    sql += ' ORDER BY created_at DESC'

    const result = await query<{ data: T }>(sql, params)
    return result.rows.map((row) => this.parseJsonbData(row.data))
  }

  async query(filter: QueryFilter): Promise<QueryResult<T>> {
    await this.ensureTable()

    const conditions: string[] = []
    const params: unknown[] = []
    let paramIndex = 1

    // Build WHERE conditions from filter.where
    if (filter.where) {
      for (const [field, value] of Object.entries(filter.where)) {
        if (Array.isArray(value)) {
          conditions.push(`data->>'${field}' = ANY($${paramIndex})`)
          params.push(value)
        } else if (value === null) {
          conditions.push(`data->>'${field}' IS NULL`)
        } else {
          conditions.push(`data->>'${field}' = $${paramIndex}`)
          params.push(String(value))
        }
        paramIndex++
      }
    }

    // Date range filter
    if (filter.dateRange) {
      const { field, start, end } = filter.dateRange
      if (start) {
        conditions.push(`(data->>'${field}')::timestamp >= $${paramIndex}`)
        params.push(start.toISOString())
        paramIndex++
      }
      if (end) {
        conditions.push(`(data->>'${field}')::timestamp <= $${paramIndex}`)
        params.push(end.toISOString())
        paramIndex++
      }
    }

    // Build WHERE clause
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Count total
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`,
      params
    )
    const total = parseInt(countResult.rows[0].count)

    // Build ORDER BY
    let orderBy = 'ORDER BY created_at DESC'
    if (filter.orderBy) {
      const descending = filter.orderBy.startsWith('-')
      const field = descending ? filter.orderBy.slice(1) : filter.orderBy
      const direction = descending ? 'DESC' : 'ASC'
      orderBy = `ORDER BY data->>'${field}' ${direction}`
    }

    // Build pagination
    const limit = filter.limit || 100
    const offset = filter.offset || 0

    // Execute query
    const sql = `
      SELECT data FROM ${this.tableName}
      ${whereClause}
      ${orderBy}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `
    params.push(limit, offset)

    const result = await query<{ data: T }>(sql, params)

    return {
      data: result.rows.map((row) => this.parseJsonbData(row.data)),
      total,
      hasMore: offset + result.rows.length < total,
    }
  }

  async count(filter?: QueryFilter): Promise<number> {
    await this.ensureTable()

    if (!filter || (!filter.where && !filter.dateRange)) {
      const result = await query<{ count: string }>(
        `SELECT COUNT(*) as count FROM ${this.tableName}`
      )
      return parseInt(result.rows[0].count)
    }

    const queryResult = await this.query({ ...filter, limit: 0 })
    return queryResult.total
  }

  async exists(key: string): Promise<boolean> {
    await this.ensureTable()

    const result = await query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM ${this.tableName} WHERE key = $1)`,
      [key]
    )

    return result.rows[0].exists
  }

  async update(key: string, data: Partial<T>): Promise<T | null> {
    await this.ensureTable()

    // First get existing data
    const existing = await this.get(key)
    if (!existing) {
      return null
    }

    // Merge and save
    const updated = { ...existing, ...data } as T
    await this.save(key, updated)

    return updated
  }

  async clear(): Promise<void> {
    await this.ensureTable()
    await query(`TRUNCATE ${this.tableName}`)
  }

  getAdapterType(): string {
    return 'postgres'
  }

  // Transaction support
  async withTransaction<R>(callback: () => Promise<R>): Promise<R> {
    return transaction(async (client) => {
      this.transactionClient = client
      try {
        return await callback()
      } finally {
        this.transactionClient = null
      }
    })
  }

  async beginTransaction(): Promise<void> {
    // Transactions are managed by withTransaction
    logger.warn('Use withTransaction() for transaction management')
  }

  async commit(): Promise<void> {
    // Transactions are managed by withTransaction
    logger.warn('Use withTransaction() for transaction management')
  }

  async rollback(): Promise<void> {
    // Transactions are managed by withTransaction
    logger.warn('Use withTransaction() for transaction management')
  }

  /**
   * Parse JSONB data, handling date conversion
   */
  private parseJsonbData(data: T | string): T {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data
    return this.convertDates(parsed) as T
  }

  /**
   * Recursively convert ISO date strings to Date objects
   */
  private convertDates(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj
    if (typeof obj === 'string') {
      // Check if it's an ISO date string
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(obj)) {
        return new Date(obj)
      }
      return obj
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this.convertDates(item))
    }
    if (typeof obj === 'object') {
      const result: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.convertDates(value)
      }
      return result
    }
    return obj
  }
}

/**
 * PostgreSQL storage adapter factory
 */
export class PostgresStorageAdapterFactory implements IStorageAdapterFactory {
  private adapters: Map<string, PostgresStorageAdapter<any>> = new Map()
  private _isInitialized: boolean = false

  create<T = any>(collection: string): IStorageAdapter<T> {
    if (!this.adapters.has(collection)) {
      this.adapters.set(collection, new PostgresStorageAdapter<T>(collection))
    }
    return this.adapters.get(collection)!
  }

  getStorageType(): string {
    return 'postgres'
  }

  async isAvailable(): Promise<boolean> {
    try {
      return await isDatabaseConnected()
    } catch {
      return false
    }
  }

  async initialize(): Promise<void> {
    if (this._isInitialized) return

    const available = await this.isAvailable()
    if (!available) {
      throw new Error('PostgreSQL database is not available')
    }

    this._isInitialized = true
    logger.info('PostgreSQL storage adapter factory initialized')
  }

  async shutdown(): Promise<void> {
    this.adapters.clear()
    this._isInitialized = false
  }

  /**
   * Get all collection names
   */
  getCollections(): string[] {
    return Array.from(this.adapters.keys())
  }
}

/**
 * Global PostgreSQL storage factory instance
 */
export const postgresStorageFactory = new PostgresStorageAdapterFactory()
