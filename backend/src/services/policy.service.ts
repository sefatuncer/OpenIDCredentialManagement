/**
 * Policy Authorization Engine
 *
 * Evaluates fine-grained access control policies based on:
 * - User role (admin, issuer, verifier, holder)
 * - Delegation scope (actions, resources, constraints)
 * - Custom resource-level policies (stored in DB)
 *
 * Feature-flag gated: security.policy-engine
 */

import { v4 as uuidv4 } from 'uuid'
import { logger } from '../utils/logger'
import { isFeatureEnabled } from '../core/feature-flags'
import { createStorageAdapter, IStorageAdapter } from '../core/storage'
import { createAuditLog } from './audit.service'

// --- Types ---

export interface PolicyRule {
  id: string
  name: string
  description: string
  effect: 'allow' | 'deny'
  principals: {
    roles?: string[]
    dids?: string[]
  }
  actions: string[]
  resources: string[]
  conditions?: Record<string, unknown>
  priority: number
  builtIn: boolean
  createdAt: string
  updatedAt: string
}

export interface PolicyDecision {
  allowed: boolean
  reason: string
  matchedRule?: string
}

export interface PolicyEvalContext {
  principal: {
    sub: string
    role?: string
    permissions?: string[]
    delegationScope?: {
      actions: string[]
      resources: string[]
      constraints?: Record<string, unknown>
    }
  }
  action: string
  resource: string
  metadata?: Record<string, unknown>
}

// --- State ---

let policyStorage: IStorageAdapter<PolicyRule> | null = null
let policyCache: PolicyRule[] = []
let cacheExpiry = 0
const CACHE_TTL = 30_000 // 30s

function getStorage(): IStorageAdapter<PolicyRule> {
  if (!policyStorage) {
    policyStorage = createStorageAdapter<PolicyRule>('authorization_policies')
  }
  return policyStorage
}

// --- Built-in default policies ---

const DEFAULT_POLICIES: Omit<PolicyRule, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'admin-full-access',
    description: 'Administrators have full access to all resources',
    effect: 'allow',
    principals: { roles: ['admin'] },
    actions: ['*'],
    resources: ['*'],
    priority: 100,
    builtIn: true,
  },
  {
    name: 'issuer-credential-ops',
    description: 'Issuers can issue and manage credentials',
    effect: 'allow',
    principals: { roles: ['issuer'] },
    actions: ['credential:issue', 'credential:revoke', 'credential:list', 'schema:read'],
    resources: ['credentials', 'schemas'],
    priority: 90,
    builtIn: true,
  },
  {
    name: 'verifier-verification-ops',
    description: 'Verifiers can create and manage verification requests',
    effect: 'allow',
    principals: { roles: ['verifier'] },
    actions: ['verification:create', 'verification:read', 'trust:read'],
    resources: ['verifications', 'trust'],
    priority: 90,
    builtIn: true,
  },
  {
    name: 'holder-wallet-ops',
    description: 'Holders can manage their wallet and credentials',
    effect: 'allow',
    principals: { roles: ['holder'] },
    actions: ['wallet:read', 'wallet:write', 'credential:present', 'delegation:read'],
    resources: ['wallet', 'credentials', 'delegations'],
    priority: 90,
    builtIn: true,
  },
  {
    name: 'wildcard-permission-bypass',
    description: 'API keys with wildcard permissions bypass policy checks',
    effect: 'allow',
    principals: { roles: [] },
    actions: ['*'],
    resources: ['*'],
    conditions: { requireWildcardPermission: true },
    priority: 200,
    builtIn: true,
  },
]

// --- Public API ---

/**
 * Initialize policy service — seed default policies
 */
export async function initializePolicies(): Promise<void> {
  if (!isFeatureEnabled('security.policy-engine')) return

  const storage = getStorage()
  const existing = await storage.list()

  for (const def of DEFAULT_POLICIES) {
    const exists = existing.some((p) => p.name === def.name)
    if (!exists) {
      const now = new Date().toISOString()
      const policy: PolicyRule = {
        ...def,
        id: uuidv4(),
        createdAt: now,
        updatedAt: now,
      }
      await storage.save(policy.id, policy)
    }
  }

  // Warm cache
  await loadPolicies()
  logger.info('Policy engine initialized', { policyCount: policyCache.length })
}

/**
 * Evaluate a policy decision
 */
export function evaluatePolicy(ctx: PolicyEvalContext): PolicyDecision {
  if (!isFeatureEnabled('security.policy-engine')) {
    return { allowed: true, reason: 'Policy engine disabled — pass-through' }
  }

  // Wildcard permission bypass (backward compat for API keys with '*')
  if (ctx.principal.permissions?.includes('*')) {
    return { allowed: true, reason: 'Wildcard permission', matchedRule: 'wildcard-permission-bypass' }
  }

  // Refresh cache if expired
  if (Date.now() > cacheExpiry) {
    loadPolicies().catch(() => {})
  }

  // Sort by priority descending (highest priority first)
  const sorted = [...policyCache].sort((a, b) => b.priority - a.priority)

  for (const rule of sorted) {
    if (!matchesRule(rule, ctx)) continue

    // Log decision (fire-and-forget)
    logPolicyDecision(ctx, rule).catch(() => {})

    if (rule.effect === 'deny') {
      return { allowed: false, reason: `Denied by policy: ${rule.name}`, matchedRule: rule.id }
    }
    return { allowed: true, reason: `Allowed by policy: ${rule.name}`, matchedRule: rule.id }
  }

  // Check delegation scope as fallback
  if (ctx.principal.delegationScope) {
    const scopeMatch = checkDelegationScope(ctx)
    if (scopeMatch.allowed) return scopeMatch
  }

  // Default deny if policy engine is enabled and no rule matched
  return { allowed: false, reason: 'No matching policy found — default deny' }
}

/**
 * List all policies
 */
export async function listPolicies(): Promise<PolicyRule[]> {
  return await getStorage().list()
}

/**
 * Get a single policy
 */
export async function getPolicy(id: string): Promise<PolicyRule | null> {
  return (await getStorage().get(id)) || null
}

/**
 * Create a custom policy
 */
export async function createPolicy(
  input: Omit<PolicyRule, 'id' | 'builtIn' | 'createdAt' | 'updatedAt'>,
): Promise<PolicyRule> {
  const now = new Date().toISOString()
  const policy: PolicyRule = {
    ...input,
    id: uuidv4(),
    builtIn: false,
    createdAt: now,
    updatedAt: now,
  }
  await getStorage().save(policy.id, policy)
  invalidateCache()
  return policy
}

/**
 * Update a policy (cannot update built-in policies)
 */
export async function updatePolicy(
  id: string,
  updates: Partial<Omit<PolicyRule, 'id' | 'builtIn' | 'createdAt'>>,
): Promise<PolicyRule | null> {
  const existing = await getStorage().get(id)
  if (!existing) return null
  if (existing.builtIn) throw new Error('Cannot modify built-in policies')

  const updated: PolicyRule = {
    ...existing,
    ...updates,
    id: existing.id,
    builtIn: false,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  }
  await getStorage().save(id, updated)
  invalidateCache()
  return updated
}

/**
 * Delete a custom policy (cannot delete built-in)
 */
export async function deletePolicy(id: string): Promise<boolean> {
  const existing = await getStorage().get(id)
  if (!existing) return false
  if (existing.builtIn) throw new Error('Cannot delete built-in policies')

  await getStorage().delete(id)
  invalidateCache()
  return true
}

// --- Internal helpers ---

function matchesRule(rule: PolicyRule, ctx: PolicyEvalContext): boolean {
  // Check principal match (role or DID)
  const principalMatch =
    (rule.principals.roles?.length === 0 && rule.conditions?.requireWildcardPermission) ||
    (rule.principals.roles && rule.principals.roles.includes(ctx.principal.role || '')) ||
    (rule.principals.dids && rule.principals.dids.includes(ctx.principal.sub))

  if (!principalMatch) return false

  // Check action match
  const actionMatch =
    rule.actions.includes('*') || rule.actions.includes(ctx.action)

  if (!actionMatch) return false

  // Check resource match
  const resourceMatch =
    rule.resources.includes('*') || rule.resources.includes(ctx.resource)

  if (!resourceMatch) return false

  // Check wildcard permission condition
  if (rule.conditions?.requireWildcardPermission) {
    return ctx.principal.permissions?.includes('*') || false
  }

  return true
}

function checkDelegationScope(ctx: PolicyEvalContext): PolicyDecision {
  const scope = ctx.principal.delegationScope
  if (!scope) return { allowed: false, reason: 'No delegation scope' }

  const actionParts = ctx.action.split(':')
  const actionMatch = scope.actions.some(
    (a) => a === '*' || a === ctx.action || a === actionParts[0],
  )
  const resourceMatch = scope.resources.some(
    (r) => r === '*' || r === ctx.resource,
  )

  if (actionMatch && resourceMatch) {
    return { allowed: true, reason: 'Allowed by delegation scope' }
  }

  return {
    allowed: false,
    reason: `Delegation scope insufficient: required ${ctx.action} on ${ctx.resource}`,
  }
}

async function loadPolicies(): Promise<void> {
  try {
    policyCache = await getStorage().list()
    cacheExpiry = Date.now() + CACHE_TTL
  } catch (err) {
    logger.error('Failed to load policies', { error: (err as Error).message })
  }
}

function invalidateCache(): void {
  cacheExpiry = 0
}

async function logPolicyDecision(ctx: PolicyEvalContext, rule: PolicyRule): Promise<void> {
  try {
    await createAuditLog({
      eventType: 'authorization.policy',
      action: rule.effect === 'allow' ? 'policy_allow' : 'policy_deny',
      actorDid: ctx.principal.sub,
      resourceType: ctx.resource,
      resourceId: ctx.action,
      success: rule.effect === 'allow',
      details: {
        policyId: rule.id,
        policyName: rule.name,
        action: ctx.action,
        resource: ctx.resource,
        role: ctx.principal.role,
      },
    })
  } catch {
    // fire-and-forget
  }
}
