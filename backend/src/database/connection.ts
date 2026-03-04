import { Pool, PoolConfig, QueryResult, QueryResultRow } from 'pg'
import { logger } from '../utils/logger'

let pool: Pool | null = null

export interface DatabaseConfig {
  host: string
  port: number
  database: string
  user: string
  password: string
  max?: number
  idleTimeoutMillis?: number
  connectionTimeoutMillis?: number
  ssl?: boolean | object
}

/**
 * Get database configuration from environment
 */
export function getDatabaseConfig(): DatabaseConfig {
  const databaseUrl = process.env.DATABASE_URL

  if (databaseUrl) {
    // Parse DATABASE_URL
    const url = new URL(databaseUrl)
    return {
      host: url.hostname,
      port: parseInt(url.port) || 5432,
      database: url.pathname.slice(1),
      user: url.username,
      password: url.password,
      max: parseInt(process.env.DB_POOL_MAX || '20'),
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT || '5000'),
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    }
  }

  // Validate required database configuration
  const host = process.env.DB_HOST
  const password = process.env.DB_PASSWORD
  const user = process.env.DB_USER
  const database = process.env.DB_NAME

  if (!host || !password || !user || !database) {
    throw new Error(
      'FATAL: Database configuration incomplete. Required: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME'
    )
  }

  return {
    host,
    port: parseInt(process.env.DB_PORT || '5432'),
    database,
    user,
    password,
    max: parseInt(process.env.DB_POOL_MAX || '20'),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT || '5000'),
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  }
}

/**
 * Initialize database connection pool
 */
export async function initializeDatabase(): Promise<Pool> {
  if (pool) {
    return pool
  }

  const config = getDatabaseConfig()

  const poolConfig: PoolConfig = {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    max: config.max,
    idleTimeoutMillis: config.idleTimeoutMillis,
    connectionTimeoutMillis: config.connectionTimeoutMillis,
    ssl: config.ssl,
  }

  pool = new Pool(poolConfig)

  // Test connection
  try {
    const client = await pool.connect()
    await client.query('SELECT NOW()')
    client.release()
    logger.info('Database connection established', {
      host: config.host,
      database: config.database,
    })
  } catch (error) {
    logger.error('Failed to connect to database', { error })
    throw error
  }

  // Handle pool errors
  pool.on('error', (err) => {
    logger.error('Unexpected database pool error', { error: err })
  })

  return pool
}

/**
 * Get the database pool
 */
export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database not initialized. Call initializeDatabase() first.')
  }
  return pool
}

/**
 * Execute a query
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const start = Date.now()
  const result = await getPool().query<T>(text, params)
  const duration = Date.now() - start

  if (duration > 1000) {
    logger.warn('Slow query detected', { text, duration, rows: result.rowCount })
  }

  return result
}

/**
 * Execute a query and return the first row or null
 */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: any[]
): Promise<T | null> {
  const result = await query<T>(text, params)
  return result.rows[0] || null
}

/**
 * Execute a transaction
 */
export async function transaction<T>(
  callback: (client: any) => Promise<T>
): Promise<T> {
  const client = await getPool().connect()

  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

/**
 * Close database connection
 */
export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
    logger.info('Database connection closed')
  }
}

/**
 * Check if database is connected
 */
export async function isDatabaseConnected(): Promise<boolean> {
  if (!pool) {
    return false
  }

  try {
    await pool.query('SELECT 1')
    return true
  } catch {
    return false
  }
}
