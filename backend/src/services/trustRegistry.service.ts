import { logger } from '../utils/logger'
import {
  IStorageAdapter,
  createStorageAdapter,
  getStorageType,
} from '../core/storage'
import { eventBus } from '../core/event-bus'
import { isFeatureEnabled, requireFeature } from '../core/feature-flags'

/**
 * Trust Registry Service
 *
 * Manages trusted issuers, verifiers, and trust anchors for the
 * AI Agent Identity System.
 *
 * Now supports pluggable storage backends via IStorageAdapter.
 */

export type TrustLevel = 'untrusted' | 'basic' | 'standard' | 'elevated' | 'high'

export interface TrustedEntity {
  did: string
  name: string
  type: 'issuer' | 'verifier' | 'holder'
  trustLevel: TrustLevel
  credentialTypes: string[]
  metadata: Record<string, unknown>
  addedAt: Date
  updatedAt: Date
  expiresAt?: Date
  active: boolean
}

export interface TrustAnchor {
  id: string
  name: string
  did: string
  publicKey: string
  trustLevel: TrustLevel
  addedAt: Date
  active: boolean
}

export interface TrustPolicy {
  id: string
  name: string
  description: string
  rules: TrustRule[]
  active: boolean
}

export interface TrustRule {
  credentialType: string
  requiredTrustLevel: TrustLevel
  requiredIssuerTypes?: string[]
  maxCredentialAge?: number // in seconds
  requireRevocationCheck: boolean
}

// Storage adapters (initialized lazily)
let trustedEntitiesStorage: IStorageAdapter<TrustedEntity> | null = null
let trustAnchorsStorage: IStorageAdapter<TrustAnchor> | null = null
let trustPoliciesStorage: IStorageAdapter<TrustPolicy> | null = null

// Trust level hierarchy
const trustLevelHierarchy: Record<TrustLevel, number> = {
  untrusted: 0,
  basic: 1,
  standard: 2,
  elevated: 3,
  high: 4,
}

/**
 * Get or initialize storage adapters
 */
function getEntitiesStorage(): IStorageAdapter<TrustedEntity> {
  if (!trustedEntitiesStorage) {
    trustedEntitiesStorage = createStorageAdapter<TrustedEntity>('trusted_entities')
  }
  return trustedEntitiesStorage!
}

function getAnchorsStorage(): IStorageAdapter<TrustAnchor> {
  if (!trustAnchorsStorage) {
    trustAnchorsStorage = createStorageAdapter<TrustAnchor>('trust_anchors')
  }
  return trustAnchorsStorage!
}

function getPoliciesStorage(): IStorageAdapter<TrustPolicy> {
  if (!trustPoliciesStorage) {
    trustPoliciesStorage = createStorageAdapter<TrustPolicy>('trust_policies')
  }
  return trustPoliciesStorage!
}

/**
 * Check if trust registry feature is enabled
 */
function ensureTrustRegistryEnabled(): void {
  requireFeature('module.trust-registry')
}

/**
 * Add a trusted entity (issuer/verifier)
 */
export async function addTrustedEntity(
  entity: Omit<TrustedEntity, 'addedAt' | 'updatedAt'>
): Promise<TrustedEntity> {
  ensureTrustRegistryEnabled()

  const trustedEntity: TrustedEntity = {
    ...entity,
    addedAt: new Date(),
    updatedAt: new Date(),
  }

  await getEntitiesStorage().save(entity.did, trustedEntity)

  logger.info('Added trusted entity', {
    did: entity.did,
    name: entity.name,
    type: entity.type,
    storage: getStorageType(),
  })

  eventBus.emit('trust.entity.added', {
    did: entity.did,
    name: entity.name,
    type: entity.type,
    trustLevel: entity.trustLevel,
  })

  return trustedEntity
}

/**
 * Remove a trusted entity
 */
export async function removeTrustedEntity(did: string): Promise<boolean> {
  ensureTrustRegistryEnabled()

  const entity = await getEntitiesStorage().get(did)
  const removed = await getEntitiesStorage().delete(did)

  if (removed) {
    logger.info('Removed trusted entity', { did })

    eventBus.emit('trust.entity.removed', {
      did,
      name: entity?.name,
      type: entity?.type,
    })
  }

  return removed
}

/**
 * Update a trusted entity
 */
export async function updateTrustedEntity(
  did: string,
  updates: Partial<Omit<TrustedEntity, 'did' | 'addedAt'>>
): Promise<TrustedEntity | null> {
  ensureTrustRegistryEnabled()

  const entity = await getEntitiesStorage().get(did)
  if (!entity) {
    return null
  }

  const updated: TrustedEntity = {
    ...entity,
    ...updates,
    updatedAt: new Date(),
  }

  await getEntitiesStorage().save(did, updated)

  logger.info('Updated trusted entity', { did })

  eventBus.emit('trust.entity.updated', {
    did,
    changes: Object.keys(updates),
  })

  return updated
}

/**
 * Get a trusted entity by DID
 */
export async function getTrustedEntity(did: string): Promise<TrustedEntity | null> {
  if (!isFeatureEnabled('module.trust-registry')) {
    return null
  }
  return getEntitiesStorage().get(did)
}

/**
 * Check if an entity is trusted
 */
export async function isEntityTrusted(
  did: string,
  type?: 'issuer' | 'verifier' | 'holder'
): Promise<boolean> {
  if (!isFeatureEnabled('module.trust-registry')) {
    // If trust registry is disabled, consider all entities trusted
    return true
  }

  const entity = await getEntitiesStorage().get(did)
  if (!entity) {
    return false
  }

  if (!entity.active) {
    return false
  }

  if (entity.expiresAt && entity.expiresAt < new Date()) {
    return false
  }

  if (type && entity.type !== type) {
    return false
  }

  return true
}

/**
 * Check if an issuer is trusted for a specific credential type
 */
export async function isIssuerTrustedForCredential(
  issuerDid: string,
  credentialType: string
): Promise<boolean> {
  if (!isFeatureEnabled('module.trust-registry')) {
    return true
  }

  const entity = await getEntitiesStorage().get(issuerDid)
  if (!entity || entity.type !== 'issuer' || !entity.active) {
    return false
  }

  if (entity.expiresAt && entity.expiresAt < new Date()) {
    return false
  }

  // Check if issuer is authorized for this credential type
  if (entity.credentialTypes.includes('*')) {
    return true
  }

  return entity.credentialTypes.includes(credentialType)
}

/**
 * Get trust level for an entity
 */
export async function getEntityTrustLevel(did: string): Promise<TrustLevel> {
  if (!isFeatureEnabled('module.trust-registry')) {
    return 'standard'
  }

  const entity = await getEntitiesStorage().get(did)
  if (!entity || !entity.active) {
    return 'untrusted'
  }

  if (entity.expiresAt && entity.expiresAt < new Date()) {
    return 'untrusted'
  }

  return entity.trustLevel
}

/**
 * Check if trust level meets requirement
 */
export function meetsTrustLevel(actual: TrustLevel, required: TrustLevel): boolean {
  return trustLevelHierarchy[actual] >= trustLevelHierarchy[required]
}

/**
 * Get all trusted issuers
 */
export async function getTrustedIssuers(): Promise<TrustedEntity[]> {
  if (!isFeatureEnabled('module.trust-registry')) {
    return []
  }

  const result = await getEntitiesStorage().query({
    where: { type: 'issuer', active: true },
  })

  return result.data
}

/**
 * Get all trusted verifiers
 */
export async function getTrustedVerifiers(): Promise<TrustedEntity[]> {
  if (!isFeatureEnabled('module.trust-registry')) {
    return []
  }

  const result = await getEntitiesStorage().query({
    where: { type: 'verifier', active: true },
  })

  return result.data
}

/**
 * Add a trust anchor
 */
export async function addTrustAnchor(
  anchor: Omit<TrustAnchor, 'addedAt'>
): Promise<TrustAnchor> {
  ensureTrustRegistryEnabled()

  const trustAnchor: TrustAnchor = {
    ...anchor,
    addedAt: new Date(),
  }

  await getAnchorsStorage().save(anchor.id, trustAnchor)

  logger.info('Added trust anchor', { id: anchor.id, name: anchor.name })

  eventBus.emit('trust.anchor.added', {
    id: anchor.id,
    name: anchor.name,
    did: anchor.did,
  })

  return trustAnchor
}

/**
 * Remove a trust anchor
 */
export async function removeTrustAnchor(id: string): Promise<boolean> {
  ensureTrustRegistryEnabled()

  const removed = await getAnchorsStorage().delete(id)

  if (removed) {
    logger.info('Removed trust anchor', { id })

    eventBus.emit('trust.anchor.removed', { id })
  }

  return removed
}

/**
 * Get all trust anchors
 */
export async function getTrustAnchors(): Promise<TrustAnchor[]> {
  if (!isFeatureEnabled('module.trust-registry')) {
    return []
  }

  const result = await getAnchorsStorage().query({
    where: { active: true },
  })

  return result.data
}

/**
 * Add a trust policy
 */
export async function addTrustPolicy(policy: TrustPolicy): Promise<TrustPolicy> {
  ensureTrustRegistryEnabled()

  await getPoliciesStorage().save(policy.id, policy)

  logger.info('Added trust policy', { id: policy.id, name: policy.name })

  eventBus.emit('trust.policy.created', {
    id: policy.id,
    name: policy.name,
  })

  return policy
}

/**
 * Update a trust policy
 */
export async function updateTrustPolicy(
  policyId: string,
  updates: Partial<Omit<TrustPolicy, 'id'>>
): Promise<TrustPolicy | null> {
  ensureTrustRegistryEnabled()

  const updated = await getPoliciesStorage().update(policyId, updates)

  if (updated) {
    logger.info('Updated trust policy', { id: policyId })

    eventBus.emit('trust.policy.updated', {
      id: policyId,
      changes: Object.keys(updates),
    })
  }

  return updated
}

/**
 * Get trust policy by ID
 */
export async function getTrustPolicy(policyId: string): Promise<TrustPolicy | null> {
  if (!isFeatureEnabled('module.trust-registry')) {
    return null
  }
  return getPoliciesStorage().get(policyId)
}

/**
 * Get all trust policies
 */
export async function getAllTrustPolicies(): Promise<TrustPolicy[]> {
  if (!isFeatureEnabled('module.trust-registry')) {
    return []
  }
  return getPoliciesStorage().list()
}

/**
 * Validate a credential against trust policies
 */
export async function validateAgainstTrustPolicy(
  policyId: string,
  issuerDid: string,
  credentialType: string,
  credentialIssuanceDate: Date
): Promise<{ valid: boolean; errors: string[] }> {
  if (!isFeatureEnabled('module.trust-registry')) {
    return { valid: true, errors: [] }
  }

  const policy = await getPoliciesStorage().get(policyId)
  if (!policy || !policy.active) {
    return { valid: false, errors: ['Policy not found or inactive'] }
  }

  const errors: string[] = []

  // Find applicable rule
  const rule = policy.rules.find(
    (r) => r.credentialType === credentialType || r.credentialType === '*'
  )
  if (!rule) {
    return { valid: true, errors: [] } // No rule means no restrictions
  }

  // Check issuer trust level
  const issuerTrustLevel = await getEntityTrustLevel(issuerDid)
  if (!meetsTrustLevel(issuerTrustLevel, rule.requiredTrustLevel)) {
    errors.push(
      `Issuer trust level (${issuerTrustLevel}) does not meet required level (${rule.requiredTrustLevel})`
    )
  }

  // Check credential age
  if (rule.maxCredentialAge) {
    const ageSeconds = (Date.now() - credentialIssuanceDate.getTime()) / 1000
    if (ageSeconds > rule.maxCredentialAge) {
      errors.push(
        `Credential age (${Math.floor(ageSeconds)}s) exceeds maximum (${rule.maxCredentialAge}s)`
      )
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Get trust registry statistics
 */
export async function getTrustRegistryStats(): Promise<{
  totalEntities: number
  activeEntities: number
  trustedIssuers: number
  trustedVerifiers: number
  trustAnchors: number
  activePolicies: number
  storageType: string
}> {
  if (!isFeatureEnabled('module.trust-registry')) {
    return {
      totalEntities: 0,
      activeEntities: 0,
      trustedIssuers: 0,
      trustedVerifiers: 0,
      trustAnchors: 0,
      activePolicies: 0,
      storageType: getStorageType(),
    }
  }

  const allEntities = await getEntitiesStorage().list()
  const activeEntities = allEntities.filter((e) => e.active)

  const allAnchors = await getAnchorsStorage().list()
  const allPolicies = await getPoliciesStorage().list()

  return {
    totalEntities: allEntities.length,
    activeEntities: activeEntities.length,
    trustedIssuers: activeEntities.filter((e) => e.type === 'issuer').length,
    trustedVerifiers: activeEntities.filter((e) => e.type === 'verifier').length,
    trustAnchors: allAnchors.filter((a) => a.active).length,
    activePolicies: allPolicies.filter((p) => p.active).length,
    storageType: getStorageType(),
  }
}

/**
 * Initialize default trusted entities (for development)
 */
export function initializeDefaultTrust(): void {
  // This should be called with actual DIDs in production
  logger.info('Trust registry initialized (add trusted entities via API)', {
    storage: getStorageType(),
  })
}

/**
 * Export all trusted entities (for backup/migration)
 */
export async function exportTrustRegistry(): Promise<{
  entities: TrustedEntity[]
  anchors: TrustAnchor[]
  policies: TrustPolicy[]
}> {
  if (!isFeatureEnabled('module.trust-registry')) {
    return { entities: [], anchors: [], policies: [] }
  }

  return {
    entities: await getEntitiesStorage().list(),
    anchors: await getAnchorsStorage().list(),
    policies: await getPoliciesStorage().list(),
  }
}

/**
 * Import trust registry data (for restore/migration)
 */
export async function importTrustRegistry(data: {
  entities?: TrustedEntity[]
  anchors?: TrustAnchor[]
  policies?: TrustPolicy[]
}): Promise<void> {
  ensureTrustRegistryEnabled()

  if (data.entities) {
    for (const e of data.entities) {
      await getEntitiesStorage().save(e.did, e)
    }
  }
  if (data.anchors) {
    for (const a of data.anchors) {
      await getAnchorsStorage().save(a.id, a)
    }
  }
  if (data.policies) {
    for (const p of data.policies) {
      await getPoliciesStorage().save(p.id, p)
    }
  }

  logger.info('Trust registry imported', {
    entities: data.entities?.length || 0,
    anchors: data.anchors?.length || 0,
    policies: data.policies?.length || 0,
    storage: getStorageType(),
  })
}

/**
 * Clear all trust registry data (use with caution!)
 */
export async function clearTrustRegistry(): Promise<void> {
  ensureTrustRegistryEnabled()

  await getEntitiesStorage().clear()
  await getAnchorsStorage().clear()
  await getPoliciesStorage().clear()

  logger.warn('Trust registry cleared')
}
