import { query, transaction } from '../connection'
import { QueryResult, QueryResultRow } from 'pg'

/**
 * Base repository class with common CRUD operations
 */
export abstract class BaseRepository<T extends QueryResultRow> {
  protected abstract tableName: string
  protected abstract primaryKey: string

  /**
   * Find all records
   */
  async findAll(limit = 100, offset = 0): Promise<T[]> {
    const result = await query<T>(
      `SELECT * FROM ${this.tableName} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    )
    return result.rows
  }

  /**
   * Find by primary key
   */
  async findById(id: string): Promise<T | null> {
    const result = await query<T>(
      `SELECT * FROM ${this.tableName} WHERE ${this.primaryKey} = $1`,
      [id]
    )
    return result.rows[0] || null
  }

  /**
   * Find by conditions
   */
  async findBy(conditions: Partial<T>): Promise<T[]> {
    const keys = Object.keys(conditions)
    const values = Object.values(conditions)

    if (keys.length === 0) {
      return this.findAll()
    }

    const whereClause = keys
      .map((key, index) => `${key} = $${index + 1}`)
      .join(' AND ')

    const result = await query<T>(
      `SELECT * FROM ${this.tableName} WHERE ${whereClause}`,
      values
    )
    return result.rows
  }

  /**
   * Find one by conditions
   */
  async findOneBy(conditions: Partial<T>): Promise<T | null> {
    const results = await this.findBy(conditions)
    return results[0] || null
  }

  /**
   * Insert a record
   */
  async insert(data: Partial<T>): Promise<T> {
    const keys = Object.keys(data)
    const values = Object.values(data)
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ')
    const columns = keys.join(', ')

    const result = await query<T>(
      `INSERT INTO ${this.tableName} (${columns}) VALUES (${placeholders}) RETURNING *`,
      values
    )
    return result.rows[0]
  }

  /**
   * Update a record
   */
  async update(id: string, data: Partial<T>): Promise<T | null> {
    const keys = Object.keys(data)
    const values = Object.values(data)

    if (keys.length === 0) {
      return this.findById(id)
    }

    const setClause = keys
      .map((key, index) => `${key} = $${index + 1}`)
      .join(', ')

    const result = await query<T>(
      `UPDATE ${this.tableName} SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE ${this.primaryKey} = $${keys.length + 1} RETURNING *`,
      [...values, id]
    )
    return result.rows[0] || null
  }

  /**
   * Delete a record
   */
  async delete(id: string): Promise<boolean> {
    const result = await query(
      `DELETE FROM ${this.tableName} WHERE ${this.primaryKey} = $1`,
      [id]
    )
    return (result.rowCount || 0) > 0
  }

  /**
   * Count records
   */
  async count(conditions?: Partial<T>): Promise<number> {
    if (!conditions || Object.keys(conditions).length === 0) {
      const result = await query(`SELECT COUNT(*) FROM ${this.tableName}`)
      return parseInt(result.rows[0].count)
    }

    const keys = Object.keys(conditions)
    const values = Object.values(conditions)
    const whereClause = keys
      .map((key, index) => `${key} = $${index + 1}`)
      .join(' AND ')

    const result = await query(
      `SELECT COUNT(*) FROM ${this.tableName} WHERE ${whereClause}`,
      values
    )
    return parseInt(result.rows[0].count)
  }

  /**
   * Check if record exists
   */
  async exists(id: string): Promise<boolean> {
    const result = await query(
      `SELECT 1 FROM ${this.tableName} WHERE ${this.primaryKey} = $1 LIMIT 1`,
      [id]
    )
    return (result.rowCount || 0) > 0
  }

  /**
   * Execute raw query
   */
  async raw<R extends QueryResultRow = QueryResultRow>(sql: string, params?: any[]): Promise<QueryResult<R>> {
    return query<R>(sql, params)
  }

  /**
   * Execute in transaction
   */
  async withTransaction<R>(callback: (client: any) => Promise<R>): Promise<R> {
    return transaction(callback)
  }
}
