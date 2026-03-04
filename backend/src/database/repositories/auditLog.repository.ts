import { BaseRepository } from './base.repository'
import { query } from '../connection'

export interface AuditLogRecord {
  id: string
  event_type: string
  action: string
  actor_type?: string
  actor_id?: string
  actor_name?: string
  resource_type?: string
  resource_id?: string
  outcome?: string
  details?: any
  metadata?: any
  timestamp: Date
}

export interface AuditLogQueryOptions {
  eventType?: string
  actorId?: string
  resourceId?: string
  outcome?: string
  startDate?: Date
  endDate?: Date
  limit?: number
  offset?: number
}

export class AuditLogRepository extends BaseRepository<AuditLogRecord> {
  protected tableName = 'audit_logs'
  protected primaryKey = 'id'

  /**
   * Query audit logs with filters
   */
  async queryLogs(options: AuditLogQueryOptions): Promise<AuditLogRecord[]> {
    const conditions: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (options.eventType) {
      conditions.push(`event_type = $${paramIndex++}`)
      values.push(options.eventType)
    }

    if (options.actorId) {
      conditions.push(`actor_id = $${paramIndex++}`)
      values.push(options.actorId)
    }

    if (options.resourceId) {
      conditions.push(`resource_id = $${paramIndex++}`)
      values.push(options.resourceId)
    }

    if (options.outcome) {
      conditions.push(`outcome = $${paramIndex++}`)
      values.push(options.outcome)
    }

    if (options.startDate) {
      conditions.push(`timestamp >= $${paramIndex++}`)
      values.push(options.startDate)
    }

    if (options.endDate) {
      conditions.push(`timestamp <= $${paramIndex++}`)
      values.push(options.endDate)
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const limit = options.limit || 100
    const offset = options.offset || 0

    values.push(limit, offset)

    const result = await query<AuditLogRecord>(
      `SELECT * FROM audit_logs ${whereClause} ORDER BY timestamp DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      values
    )

    return result.rows
  }

  /**
   * Get event type statistics
   */
  async getEventStats(
    startDate?: Date,
    endDate?: Date
  ): Promise<Array<{ event_type: string; count: number }>> {
    let sql = `
      SELECT event_type, COUNT(*) as count
      FROM audit_logs
    `
    const conditions: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (startDate) {
      conditions.push(`timestamp >= $${paramIndex++}`)
      values.push(startDate)
    }

    if (endDate) {
      conditions.push(`timestamp <= $${paramIndex++}`)
      values.push(endDate)
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`
    }

    sql += ' GROUP BY event_type ORDER BY count DESC'

    const result = await query(sql, values)
    return result.rows.map((row) => ({
      event_type: row.event_type,
      count: parseInt(row.count),
    }))
  }

  /**
   * Get recent activity
   */
  async getRecentActivity(limit = 50): Promise<AuditLogRecord[]> {
    const result = await query<AuditLogRecord>(
      'SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT $1',
      [limit]
    )
    return result.rows
  }

  /**
   * Delete old logs
   */
  async deleteOldLogs(retentionDays: number): Promise<number> {
    const result = await query(
      `DELETE FROM audit_logs WHERE timestamp < CURRENT_TIMESTAMP - INTERVAL '${retentionDays} days'`
    )
    return result.rowCount || 0
  }

  /**
   * Export logs to JSON format
   */
  async exportLogs(options: AuditLogQueryOptions): Promise<string> {
    const logs = await this.queryLogs({ ...options, limit: 10000 })
    return JSON.stringify(logs, null, 2)
  }
}

export const auditLogRepository = new AuditLogRepository()
