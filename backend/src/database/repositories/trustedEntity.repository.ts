import { BaseRepository } from './base.repository'
import { query } from '../connection'

export interface TrustedEntityRecord {
  did: string
  name: string
  entity_type: 'issuer' | 'verifier' | 'both'
  trust_level: 'basic' | 'verified' | 'certified' | 'trusted'
  metadata?: any
  active: boolean
  created_at: Date
  updated_at: Date
}

export class TrustedEntityRepository extends BaseRepository<TrustedEntityRecord> {
  protected tableName = 'trusted_entities'
  protected primaryKey = 'did'

  /**
   * Find active entities by type
   */
  async findActiveByType(
    entityType: 'issuer' | 'verifier' | 'both'
  ): Promise<TrustedEntityRecord[]> {
    const result = await query<TrustedEntityRecord>(
      `SELECT * FROM trusted_entities
       WHERE (entity_type = $1 OR entity_type = 'both') AND active = TRUE
       ORDER BY created_at DESC`,
      [entityType]
    )
    return result.rows
  }

  /**
   * Check if DID is a trusted issuer
   */
  async isTrustedIssuer(did: string): Promise<boolean> {
    const result = await query(
      `SELECT 1 FROM trusted_entities
       WHERE did = $1 AND (entity_type = 'issuer' OR entity_type = 'both') AND active = TRUE
       LIMIT 1`,
      [did]
    )
    return (result.rowCount || 0) > 0
  }

  /**
   * Check if DID is a trusted verifier
   */
  async isTrustedVerifier(did: string): Promise<boolean> {
    const result = await query(
      `SELECT 1 FROM trusted_entities
       WHERE did = $1 AND (entity_type = 'verifier' OR entity_type = 'both') AND active = TRUE
       LIMIT 1`,
      [did]
    )
    return (result.rowCount || 0) > 0
  }

  /**
   * Get entities by trust level
   */
  async findByTrustLevel(
    trustLevel: TrustedEntityRecord['trust_level']
  ): Promise<TrustedEntityRecord[]> {
    const result = await query<TrustedEntityRecord>(
      'SELECT * FROM trusted_entities WHERE trust_level = $1 AND active = TRUE ORDER BY name',
      [trustLevel]
    )
    return result.rows
  }

  /**
   * Deactivate entity
   */
  async deactivate(did: string): Promise<TrustedEntityRecord | null> {
    const result = await query<TrustedEntityRecord>(
      'UPDATE trusted_entities SET active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE did = $1 RETURNING *',
      [did]
    )
    return result.rows[0] || null
  }

  /**
   * Activate entity
   */
  async activate(did: string): Promise<TrustedEntityRecord | null> {
    const result = await query<TrustedEntityRecord>(
      'UPDATE trusted_entities SET active = TRUE, updated_at = CURRENT_TIMESTAMP WHERE did = $1 RETURNING *',
      [did]
    )
    return result.rows[0] || null
  }

  /**
   * Update trust level
   */
  async updateTrustLevel(
    did: string,
    trustLevel: TrustedEntityRecord['trust_level']
  ): Promise<TrustedEntityRecord | null> {
    const result = await query<TrustedEntityRecord>(
      'UPDATE trusted_entities SET trust_level = $1, updated_at = CURRENT_TIMESTAMP WHERE did = $2 RETURNING *',
      [trustLevel, did]
    )
    return result.rows[0] || null
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<{
    total: number
    active: number
    byType: Record<string, number>
    byTrustLevel: Record<string, number>
  }> {
    const total = await this.count()
    const active = await this.count({ active: true } as any)

    const typeResult = await query(`
      SELECT entity_type, COUNT(*) as count
      FROM trusted_entities WHERE active = TRUE
      GROUP BY entity_type
    `)
    const byType: Record<string, number> = {}
    for (const row of typeResult.rows) {
      byType[row.entity_type] = parseInt(row.count)
    }

    const levelResult = await query(`
      SELECT trust_level, COUNT(*) as count
      FROM trusted_entities WHERE active = TRUE
      GROUP BY trust_level
    `)
    const byTrustLevel: Record<string, number> = {}
    for (const row of levelResult.rows) {
      byTrustLevel[row.trust_level] = parseInt(row.count)
    }

    return { total, active, byType, byTrustLevel }
  }
}

export const trustedEntityRepository = new TrustedEntityRepository()
