/**
 * Delegation Service
 * Handles delegation grants between agents with chain attenuation support
 */

import { v4 as uuidv4 } from 'uuid'
import { query, queryOne } from '../database/connection'
import { logger } from '../utils/logger'
import { getAgentByDid, logAgentActivity } from './agent.service'
import { eventBus } from '../core/event-bus'

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
  credentialId: string | null
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

export interface SubDelegationInput {
  delegateeDid: string
  scope: {
    actions: string[]
    resources: string[]
    constraints?: Record<string, unknown>
  }
  duration?: string
  revocable?: boolean
  maxAmount?: number
  allowedServices?: string[]
  geographicRestrictions?: string[]
}

// --- VC Integration callback (wired up in index.ts) ---

type IssueDelegationVCFn = (
  holderDid: string,
  subject: Record<string, unknown>,
  options?: { format?: string },
) => Promise<{ credentialOfferId: string; credentialOfferUri: string }>

let _issueDelegationVC: IssueDelegationVCFn | null = null

export function setDelegationIssuer(fn: IssueDelegationVCFn): void {
  _issueDelegationVC = fn
}

/**
 * Create a new delegation (root — chainDepth 0)
 */
export async function createDelegation(
  delegatorDid: string,
  input: CreateDelegationInput,
): Promise<Delegation & { credentialOfferId?: string; credentialOfferUri?: string }> {
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
    [id, delegatorDid, input.delegateeToDid, JSON.stringify(input.scope), 0, 3, input.revocable, now, expiresAt],
  )

  // Issue Delegation VC if issuer is wired up
  let credentialOfferId: string | undefined
  let credentialOfferUri: string | undefined
  if (_issueDelegationVC) {
    try {
      const vcResult = await _issueDelegationVC(input.delegateeToDid, {
        delegatorDid,
        delegateDid: input.delegateeToDid,
        scope: input.scope.actions,
        constraints: input.scope.constraints,
        attenuationLevel: 0,
      })
      credentialOfferId = vcResult.credentialOfferId
      credentialOfferUri = vcResult.credentialOfferUri
      await query(`UPDATE delegations SET credential_id = $2 WHERE id = $1`, [id, credentialOfferId])
    } catch (err) {
      logger.warn('Failed to issue delegation VC', { delegationId: id, error: err })
    }
  }

  await logAgentActivity(delegator.id, 'delegation_created', 'success', input.delegateeToDid)

  eventBus.emit('delegation.created', {
    delegationId: id,
    delegatorDid,
    delegateeDid: input.delegateeToDid,
    chainDepth: 0,
  })

  logger.info('Delegation created', { id, delegator: delegatorDid, delegatee: input.delegateeToDid })

  return {
    id,
    delegatorDid,
    delegateeDid: input.delegateeToDid,
    scope: input.scope,
    chainDepth: 0,
    maxDepth: 3,
    parentDelegationId: null,
    credentialId: credentialOfferId || null,
    revocable: input.revocable,
    issuedAt: now,
    expiresAt,
    revokedAt: null,
    revokedBy: null,
    revokeReason: null,
    credentialOfferId,
    credentialOfferUri,
  }
}

/**
 * Create a sub-delegation with scope attenuation (A→B→C)
 */
export async function createSubDelegation(
  parentDelegationId: string,
  delegatorDid: string,
  input: SubDelegationInput,
): Promise<Delegation> {
  const parent = await getDelegationById(parentDelegationId)
  if (!parent) throw new Error('Parent delegation not found')
  if (parent.delegateeDid !== delegatorDid) throw new Error('Only the delegatee of the parent can sub-delegate')
  if (parent.revokedAt) throw new Error('Parent delegation has been revoked')
  if (new Date() > parent.expiresAt) throw new Error('Parent delegation has expired')
  if (parent.chainDepth >= parent.maxDepth) throw new Error(`Maximum delegation depth (${parent.maxDepth}) reached`)

  // Attenuation: narrowed scope must be subset of parent scope
  validateScopeSubset(parent.scope, input.scope)

  const now = new Date()
  const expiresAt = calculateExpiration(input.duration || 'P30D')
  // Sub-delegation cannot outlive parent
  const effectiveExpiry = expiresAt > parent.expiresAt ? parent.expiresAt : expiresAt
  const id = uuidv4()

  await query(
    `INSERT INTO delegations
     (id, delegator_did, delegatee_did, scope, chain_depth, max_depth, parent_delegation_id, revocable, issued_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id, delegatorDid, input.delegateeDid, JSON.stringify(input.scope),
      parent.chainDepth + 1, parent.maxDepth, parentDelegationId,
      input.revocable ?? true, now, effectiveExpiry,
    ],
  )

  // Issue sub-delegation VC
  if (_issueDelegationVC) {
    try {
      const vcResult = await _issueDelegationVC(input.delegateeDid, {
        delegatorDid,
        delegateDid: input.delegateeDid,
        scope: input.scope.actions,
        constraints: input.scope.constraints,
        parentDelegationId,
        attenuationLevel: parent.chainDepth + 1,
        maxAmount: input.maxAmount,
        allowedServices: input.allowedServices,
        geographicRestrictions: input.geographicRestrictions,
      })
      await query(`UPDATE delegations SET credential_id = $2 WHERE id = $1`, [id, vcResult.credentialOfferId])
    } catch (err) {
      logger.warn('Failed to issue sub-delegation VC', { delegationId: id, error: err })
    }
  }

  eventBus.emit('delegation.created', {
    delegationId: id,
    delegatorDid,
    delegateeDid: input.delegateeDid,
    chainDepth: parent.chainDepth + 1,
    parentDelegationId,
  })

  logger.info('Sub-delegation created', { id, parent: parentDelegationId, depth: parent.chainDepth + 1 })

  return {
    id, delegatorDid, delegateeDid: input.delegateeDid, scope: input.scope,
    chainDepth: parent.chainDepth + 1, maxDepth: parent.maxDepth,
    parentDelegationId, credentialId: null,
    revocable: input.revocable ?? true,
    issuedAt: now, expiresAt: effectiveExpiry,
    revokedAt: null, revokedBy: null, revokeReason: null,
  }
}

/**
 * Get the full delegation chain from root to leaf
 */
export async function getDelegationChain(delegationId: string): Promise<Delegation[]> {
  // Single recursive CTE query: walk ancestors up, then children down
  const result = await query(
    `WITH RECURSIVE
      ancestors AS (
        SELECT d.*, 0 AS sort_key FROM delegations d WHERE d.id = $1
        UNION ALL
        SELECT p.*, -1 AS sort_key FROM delegations p JOIN ancestors a ON a.parent_delegation_id = p.id
      ),
      descendants AS (
        SELECT d.*, 1 AS sort_key FROM delegations d WHERE d.parent_delegation_id = $1
        UNION ALL
        SELECT c.*, 1 AS sort_key FROM delegations c JOIN descendants dc ON c.parent_delegation_id = dc.id
      )
    SELECT * FROM ancestors
    UNION ALL
    SELECT * FROM descendants
    ORDER BY chain_depth`,
    [delegationId],
  )

  return result.rows.map(mapDelegation)
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
    [agentDid],
  )
  const received = await query(
    `SELECT * FROM delegations WHERE delegatee_did = $1 ORDER BY issued_at DESC`,
    [agentDid],
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
 * Revoke a delegation with optional cascade (revokes all children in chain)
 */
export async function revokeDelegation(
  delegationId: string,
  revokedBy: string,
  reason?: string,
  cascade = false,
): Promise<boolean> {
  const delegation = await getDelegationById(delegationId)
  if (!delegation) return false
  if (delegation.delegatorDid !== revokedBy) return false
  if (!delegation.revocable) throw new Error('This delegation is not revocable')

  const result = await query(
    `UPDATE delegations SET revoked_at = NOW(), revoked_by = $2, revoke_reason = $3 WHERE id = $1 RETURNING id`,
    [delegationId, revokedBy, reason || null],
  )

  if (result.rows.length === 0) return false

  // Emit event for webhook notification
  eventBus.emit('delegation.revoked', {
    delegationId,
    delegatorDid: delegation.delegatorDid,
    delegateeDid: delegation.delegateeDid,
    reason,
    cascade,
  })

  // Cascade revoke children
  if (cascade) {
    const children = await query(
      `SELECT * FROM delegations WHERE parent_delegation_id = $1 AND revoked_at IS NULL`,
      [delegationId],
    )
    for (const child of children.rows) {
      const mapped = mapDelegation(child)
      await revokeDelegation(mapped.id, mapped.delegatorDid, `Cascade: parent ${delegationId} revoked`, true)
    }
  }

  const agent = await getAgentByDid(revokedBy)
  if (agent) {
    await logAgentActivity(agent.id, 'delegation_revoked', 'success', delegationId, { reason, cascade })
  }
  logger.info('Delegation revoked', { delegationId, revokedBy, cascade })
  return true
}

/**
 * Verify a delegation
 */
export async function verifyDelegation(
  delegationId: string,
  action: string,
  resource?: string,
): Promise<{ valid: boolean; inScope: boolean; errors?: string[] }> {
  const delegation = await getDelegationById(delegationId)
  if (!delegation) return { valid: false, inScope: false, errors: ['Delegation not found'] }

  const errors: string[] = []
  if (delegation.revokedAt) errors.push('Delegation has been revoked')
  if (new Date() > delegation.expiresAt) errors.push('Delegation has expired')

  const actionInScope = delegation.scope.actions.includes('*') || delegation.scope.actions.includes(action)
  if (!actionInScope) errors.push(`Action '${action}' is not in scope`)

  let resourceInScope = true
  if (resource && delegation.scope.resources.length > 0) {
    resourceInScope = delegation.scope.resources.some((r) => {
      if (r === '*') return true
      if (r.endsWith('*')) return resource.startsWith(r.slice(0, -1))
      return r === resource
    })
    if (!resourceInScope) errors.push(`Resource '${resource}' is not in scope`)
  }

  return { valid: errors.length === 0, inScope: actionInScope && resourceInScope, errors: errors.length > 0 ? errors : undefined }
}

// --- Helpers ---

function validateScopeSubset(
  parentScope: Delegation['scope'],
  childScope: SubDelegationInput['scope'],
): void {
  // Child actions must be subset of parent actions (unless parent has wildcard)
  if (!parentScope.actions.includes('*')) {
    const invalidActions = childScope.actions.filter((a) => !parentScope.actions.includes(a))
    if (invalidActions.length > 0) {
      throw new Error(`Sub-delegation actions [${invalidActions.join(', ')}] not in parent scope`)
    }
  }

  // Child resources must be subset of parent resources
  if (!parentScope.resources.includes('*')) {
    for (const cr of childScope.resources) {
      const covered = parentScope.resources.some((pr) => {
        if (pr.endsWith('*')) return cr.startsWith(pr.slice(0, -1))
        return pr === cr
      })
      if (!covered) throw new Error(`Sub-delegation resource '${cr}' not covered by parent scope`)
    }
  }
}

function calculateExpiration(duration: string): Date {
  const date = new Date()
  const match = duration.match(/^P(\d+)([DWMY])$/)
  if (!match) { date.setDate(date.getDate() + 30); return date }

  const value = parseInt(match[1], 10)
  switch (match[2]) {
    case 'D': date.setDate(date.getDate() + value); break
    case 'W': date.setDate(date.getDate() + value * 7); break
    case 'M': date.setMonth(date.getMonth() + value); break
    case 'Y': date.setFullYear(date.getFullYear() + value); break
  }
  return date
}

function mapDelegation(row: Record<string, unknown>): Delegation {
  return {
    id: row.id as string,
    delegatorDid: row.delegator_did as string,
    delegateeDid: row.delegatee_did as string,
    scope: typeof row.scope === 'string' ? JSON.parse(row.scope as string) : row.scope as Delegation['scope'],
    chainDepth: row.chain_depth as number,
    maxDepth: row.max_depth as number,
    parentDelegationId: (row.parent_delegation_id as string) || null,
    credentialId: (row.credential_id as string) || null,
    revocable: row.revocable as boolean,
    issuedAt: row.issued_at as Date,
    expiresAt: row.expires_at as Date,
    revokedAt: (row.revoked_at as Date) || null,
    revokedBy: (row.revoked_by as string) || null,
    revokeReason: (row.revoke_reason as string) || null,
  }
}
