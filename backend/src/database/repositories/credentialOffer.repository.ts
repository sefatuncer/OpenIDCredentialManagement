import { BaseRepository } from './base.repository'
import { query } from '../connection'

export interface CredentialOfferRecord {
  id: string
  credential_types: string[]
  pre_authorized_code: string
  offer_data: any
  claimed: boolean
  created_at: Date
  expires_at: Date
  claimed_at?: Date
  metadata?: any
}

export class CredentialOfferRepository extends BaseRepository<CredentialOfferRecord> {
  protected tableName = 'credential_offers'
  protected primaryKey = 'id'

  /**
   * Find by pre-authorized code
   */
  async findByCode(code: string): Promise<CredentialOfferRecord | null> {
    const result = await query<CredentialOfferRecord>(
      'SELECT * FROM credential_offers WHERE pre_authorized_code = $1',
      [code]
    )
    return result.rows[0] || null
  }

  /**
   * Mark offer as claimed
   */
  async markClaimed(id: string): Promise<CredentialOfferRecord | null> {
    const result = await query<CredentialOfferRecord>(
      'UPDATE credential_offers SET claimed = TRUE, claimed_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
      [id]
    )
    return result.rows[0] || null
  }

  /**
   * Find active (non-expired, non-claimed) offers
   */
  async findActive(): Promise<CredentialOfferRecord[]> {
    const result = await query<CredentialOfferRecord>(
      'SELECT * FROM credential_offers WHERE claimed = FALSE AND expires_at > CURRENT_TIMESTAMP ORDER BY created_at DESC'
    )
    return result.rows
  }

  /**
   * Delete expired offers
   */
  async deleteExpired(): Promise<number> {
    const result = await query(
      'DELETE FROM credential_offers WHERE expires_at < CURRENT_TIMESTAMP AND claimed = FALSE'
    )
    return result.rowCount || 0
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<{
    total: number
    active: number
    claimed: number
    expired: number
  }> {
    const result = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE claimed = FALSE AND expires_at > CURRENT_TIMESTAMP) as active,
        COUNT(*) FILTER (WHERE claimed = TRUE) as claimed,
        COUNT(*) FILTER (WHERE expires_at < CURRENT_TIMESTAMP AND claimed = FALSE) as expired
      FROM credential_offers
    `)

    return {
      total: parseInt(result.rows[0].total),
      active: parseInt(result.rows[0].active),
      claimed: parseInt(result.rows[0].claimed),
      expired: parseInt(result.rows[0].expired),
    }
  }
}

export const credentialOfferRepository = new CredentialOfferRepository()
