/**
 * Delegation Service
 * Handles delegation grants between agents
 */

import { v4 as uuidv4 } from 'uuid'
import { query, queryOne } from '../database/connection'
import { logger } from '../utils/logger'
import { getAgentByDid, logAgentActivity } from './agent.service'

export interface Delegation {
  id: string
  delegatorDid: string
  delegateeDid: string
  scope: {
    actions: string[]
    resources: string[]
    constraints?: Record<string, unknown>
  }
  chainDepth: number
  maxDepth: number
  parentDelegationId: string | null
  revocable: boolean
  issuedAt: Date
  expiresAt: Date
  revokedAt: Date | null
  revokedBy: string | null
  revokeReason: string | null
}

export interface CreateDelegationInput {
  delegateeToDid: string
  scope: {
    actions: string[]
    resources: string[]
    constraints?: Record<string, unknown>
  }
  duration: string // ISO 8601 duration (e.g., "P30D")
  revocable: boolean
  requireApproval?: boolean
}

/**
 * Create a new delegation
 */
export async function createDelegation(
  delegatorDid: string,
  input: CreateDelegationInput
): Promise<Delegation> {
  const delegator = await getAgentByDid(delegatorDid)
  if (!delegator) {
    throw new Error('Delegator agent not found')
  }

  const now = new Date()
  const expiresAt = calculateExpiration(input.duration)
  const id = uuidv4()

  await query(
    `INSERT INTO delegations
     (id, delegator_did, delegatee_did, scope, chain_depth, max_depth, revocable, issued_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      delegatorDid,
      input.delegateeToDid,
      JSON.stringify(input.scope),
      0,
      3,
      input.revocable,
      now,
      expiresAt,
    ]
  )

  await logAgentActivity(delegator.id, 'delegation_created', 'success', input.delegateeToDid)
  logger.info('Delegation created', { id, delegator: delegatorDid, delegatee: input.delegateeToDid })

  return {
    id,
    delegatorDid,
    delegateeDid: input.delegateeToDid,
    scope: input.scope,
    chainDepth: 0,
    maxDepth: 3,
    parentDelegationId: null,
    revocable: input.revocable,
    issuedAt: now,
    expiresAt,
    revokedAt: null,
    revokedBy: null,
    revokeReason: null,
  }
}

/**
 * Get delegations for an agent
 */
export async function getDelegations(agentDid: string): Promise<{
  given: Delegation[]
  received: Delegation[]
}> {
  const given = await query(
    `SELECT * FROM delegations WHERE delegator_did = $1 ORDER BY issued_at DESC`,
    [agentDid]
  )

  const received = await query(
    `SELECT * FROM delegations WHERE delegatee_did = $1 ORDER BY issued_at DESC`,
    [agentDid]
  )

  return {
    given: given.rows.map(mapDelegation),
    received: received.rows.map(mapDelegation),
  }
}

/**
 * Get delegation by ID
 */
export async function getDelegationById(id: string): Promise<Delegation | null> {
  const result = await queryOne(`SELECT * FROM delegations WHERE id = $1`, [id])
  return result ? mapDelegation(result) : null
}

/**
 * Revoke a delegation
 */
export async function revokeDelegation(
  delegationId: string,
  revokedBy: string,
  reason?: string
): Promise<boolean> {
  const delegation = await getDelegationById(delegationId)
  if (!delegation) return false

  if (delegation.delegatorDid !== revokedBy) {
    return false // Only delegator can revoke
  }

  if (!delegation.revocable) {
    throw new Error('This delegation is not revocable')
  }

  const result = await query(
    `UPDATE delegations
     SET revoked_at = NOW(), revoked_by = $2, revoke_reason = $3
     WHERE id = $1 RETURNING id`,
    [delegationId, revokedBy, reason || null]
  )

  if (result.rows.length > 0) {
    const agent = await getAgentByDid(revokedBy)
    if (agent) {
      await logAgentActivity(agent.id, 'delegation_revoked', 'success', delegationId, { reason })
    }
    logger.info('Delegation revoked', { delegationId, revokedBy })
    return true
  }

  return false
}

/**
 * Verify a delegation
 */
export async function verifyDelegation(
  delegationId: string,
  action: string,
  resource?: string
): Promise<{
  valid: boolean
  inScope: boolean
  errors?: string[]
}> {
  const delegation = await getDelegationById(delegationId)

  if (!delegation) {
    return { valid: false, inScope: false, errors: ['Delegation not found'] }
  }

  const errors: string[] = []

  if (delegation.revokedAt) {
    errors.push('Delegation has been revoked')
  }

  if (new Date() > delegation.expiresAt) {
    errors.push('Delegation has expired')
  }

  const actionInScope =
    delegation.scope.actions.includes('*') ||
    delegation.scope.actions.includes(action)

  if (!actionInScope) {
    errors.push(`Action '${action}' is not in scope`)
  }

  let resourceInScope = true
  if (resource && delegation.scope.resources.length > 0) {
    resourceInScope = delegation.scope.resources.some((r) => {
      if (r === '*') return true
      if (r.endsWith('*')) return resource.startsWith(r.slice(0, -1))
      return r === resource
    })

    if (!resourceInScope) {
      errors.push(`Resource '${resource}' is not in scope`)
    }
  }

  return {
    valid: errors.length === 0,
    inScope: actionInScope && resourceInScope,
    errors: errors.length > 0 ? errors : undefined,
  }
}

// Helper functions
function calculateExpiration(duration: string): Date {
  const date = new Date()
  const match = duration.match(/^P(\d+)([DWMY])$/)

  if (!match) {
    date.setDate(date.getDate() + 30) // Default 30 days
    return date
  }

  const value = parseInt(match[1], 10)
  const unit = match[2]

  switch (unit) {
    case 'D': date.setDate(date.getDate() + value); break
    case 'W': date.setDate(date.getDate() + value * 7); break
    case 'M': date.setMonth(date.getMonth() + value); break
    case 'Y': date.setFullYear(date.getFullYear() + value); break
  }

  return date
}

function mapDelegation(row: any): Delegation {
  return {
    id: row.id,
    delegatorDid: row.delegator_did,
    delegateeDid: row.delegatee_did,
    scope: typeof row.scope === 'string' ? JSON.parse(row.scope) : row.scope,
    chainDepth: row.chain_depth,
    maxDepth: row.max_depth,
    parentDelegationId: row.parent_delegation_id,
    revocable: row.revocable,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    revokedBy: row.revoked_by,
    revokeReason: row.revoke_reason,
  }
}
