/**
 * Multi-Tenant Service
 *
 * Provides tenant isolation and management for the credential system
 * Uses storage adapters for persistent data storage
 */

import { logger } from '../utils/logger'
import {
  IStorageAdapter,
  getStorageFactory,
  createStorageAdapter,
} from '../core/storage'
import { eventBus } from '../core/event-bus'

export interface Tenant {
  id: string
  name: string
  slug: string
  status: 'active' | 'suspended' | 'pending'
  config: TenantConfig
  metadata: Record<string, any>
  createdAt: Date
  updatedAt: Date
}

export interface TenantConfig {
  maxCredentials?: number
  maxIssuers?: number
  maxHolders?: number
  allowedCredentialTypes: string[]
  features: {
    sdjwt: boolean
    revocation: boolean
    batchIssuance: boolean
    webhooks: boolean
  }
  rateLimit?: {
    requestsPerMinute: number
    requestsPerHour: number
  }
  customBranding?: {
    logo?: string
    primaryColor?: string
    name?: string
  }
}

export interface TenantUsage {
  tenantId: string
  credentialsIssued: number
  credentialsRevoked: number
  presentationsVerified: number
  apiCalls: number
  storageUsedBytes: number
  updatedAt: Date
}

const defaultConfig: TenantConfig = {
  maxCredentials: 10000,
  maxIssuers: 10,
  maxHolders: 1000,
  allowedCredentialTypes: [
    'AIAgentIdentityCredential',
    'DelegationCredential',
    'CapabilityCredential',
  ],
  features: {
    sdjwt: true,
    revocation: true,
    batchIssuance: false,
    webhooks: false,
  },
  rateLimit: {
    requestsPerMinute: 100,
    requestsPerHour: 5000,
  },
}

// Storage adapters
let tenantsStorage: IStorageAdapter<Tenant> | null = null
let usageStorage: IStorageAdapter<TenantUsage> | null = null

// Current tenant context (per-request, not persisted)
let currentTenantId: string | null = null

/**
 * Get tenants storage adapter
 */
function getTenantsStorage(): IStorageAdapter<Tenant> {
  if (!tenantsStorage) {
    tenantsStorage = createStorageAdapter<Tenant>('tenants')
  }
  return tenantsStorage
}

/**
 * Get usage storage adapter
 */
function getUsageStorage(): IStorageAdapter<TenantUsage> {
  if (!usageStorage) {
    usageStorage = createStorageAdapter<TenantUsage>('tenant_usage')
  }
  return usageStorage
}

/**
 * Create a new tenant
 */
export async function createTenant(
  name: string,
  slug: string,
  config: Partial<TenantConfig> = {}
): Promise<Tenant> {
  // Validate slug
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error('Slug must contain only lowercase letters, numbers, and hyphens')
  }

  // Check if slug already exists
  const existingBySlug = await getTenantBySlug(slug)
  if (existingBySlug) {
    throw new Error(`Tenant with slug "${slug}" already exists`)
  }

  const id = `tenant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  const now = new Date()

  const tenant: Tenant = {
    id,
    name,
    slug,
    status: 'active',
    config: { ...defaultConfig, ...config },
    metadata: {},
    createdAt: now,
    updatedAt: now,
  }

  // Save tenant
  await getTenantsStorage().save(id, tenant)

  // Initialize usage
  const usage: TenantUsage = {
    tenantId: id,
    credentialsIssued: 0,
    credentialsRevoked: 0,
    presentationsVerified: 0,
    apiCalls: 0,
    storageUsedBytes: 0,
    updatedAt: now,
  }
  await getUsageStorage().save(id, usage)

  // Emit event
  eventBus.emit('tenant.created', { tenant })

  logger.info(`Tenant created: ${name} (${slug})`)
  return tenant
}

/**
 * Get tenant by ID
 */
export async function getTenant(id: string): Promise<Tenant | null> {
  return getTenantsStorage().get(id)
}

/**
 * Get tenant by slug
 */
export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  const result = await getTenantsStorage().query({
    where: { slug },
    limit: 1,
  })
  return result.data.length > 0 ? result.data[0] : null
}

/**
 * List all tenants
 */
export async function listTenants(status?: Tenant['status']): Promise<Tenant[]> {
  if (status) {
    const result = await getTenantsStorage().query({
      where: { status },
    })
    return result.data
  }
  return getTenantsStorage().list()
}

/**
 * Update tenant
 */
export async function updateTenant(
  id: string,
  updates: Partial<Pick<Tenant, 'name' | 'config' | 'metadata'>>
): Promise<Tenant | null> {
  const tenant = await getTenantsStorage().get(id)
  if (!tenant) {
    throw new Error(`Tenant not found: ${id}`)
  }

  if (updates.name) {
    tenant.name = updates.name
  }

  if (updates.config) {
    tenant.config = { ...tenant.config, ...updates.config }
  }

  if (updates.metadata) {
    tenant.metadata = { ...tenant.metadata, ...updates.metadata }
  }

  tenant.updatedAt = new Date()

  await getTenantsStorage().save(id, tenant)

  // Emit event
  eventBus.emit('tenant.updated', { tenant })

  logger.info(`Tenant updated: ${tenant.name}`)
  return tenant
}

/**
 * Suspend tenant
 */
export async function suspendTenant(id: string, reason?: string): Promise<void> {
  const tenant = await getTenantsStorage().get(id)
  if (!tenant) {
    throw new Error(`Tenant not found: ${id}`)
  }

  tenant.status = 'suspended'
  tenant.metadata.suspendedReason = reason
  tenant.metadata.suspendedAt = new Date().toISOString()
  tenant.updatedAt = new Date()

  await getTenantsStorage().save(id, tenant)

  // Emit event
  eventBus.emit('tenant.suspended', { tenant, reason })

  logger.warn(`Tenant suspended: ${tenant.name} - ${reason}`)
}

/**
 * Activate tenant
 */
export async function activateTenant(id: string): Promise<void> {
  const tenant = await getTenantsStorage().get(id)
  if (!tenant) {
    throw new Error(`Tenant not found: ${id}`)
  }

  tenant.status = 'active'
  delete tenant.metadata.suspendedReason
  delete tenant.metadata.suspendedAt
  tenant.updatedAt = new Date()

  await getTenantsStorage().save(id, tenant)

  // Emit event
  eventBus.emit('tenant.activated', { tenant })

  logger.info(`Tenant activated: ${tenant.name}`)
}

/**
 * Delete tenant
 */
export async function deleteTenant(id: string): Promise<boolean> {
  const tenant = await getTenantsStorage().get(id)
  if (!tenant) {
    return false
  }

  await getTenantsStorage().delete(id)
  await getUsageStorage().delete(id)

  // Emit event
  eventBus.emit('tenant.deleted', { tenantId: id, tenantName: tenant.name })

  logger.info(`Tenant deleted: ${tenant.name}`)
  return true
}

/**
 * Set current tenant context
 */
export async function setCurrentTenant(id: string | null): Promise<void> {
  if (id) {
    const exists = await getTenantsStorage().exists(id)
    if (!exists) {
      throw new Error(`Tenant not found: ${id}`)
    }
  }
  currentTenantId = id
}

/**
 * Get current tenant
 */
export async function getCurrentTenant(): Promise<Tenant | null> {
  return currentTenantId ? getTenantsStorage().get(currentTenantId) : null
}

/**
 * Get tenant usage
 */
export async function getUsage(tenantId: string): Promise<TenantUsage | null> {
  return getUsageStorage().get(tenantId)
}

/**
 * Increment usage counter
 */
export async function incrementUsage(
  tenantId: string,
  metric: keyof Omit<TenantUsage, 'tenantId' | 'updatedAt'>,
  amount: number = 1
): Promise<void> {
  const usage = await getUsageStorage().get(tenantId)
  if (usage) {
    (usage[metric] as number) += amount
    usage.updatedAt = new Date()
    await getUsageStorage().save(tenantId, usage)
  }
}

/**
 * Check if tenant can perform action
 */
export async function canPerformAction(
  tenantId: string,
  action: string
): Promise<{ allowed: boolean; reason?: string }> {
  const tenant = await getTenantsStorage().get(tenantId)
  if (!tenant) {
    return { allowed: false, reason: 'Tenant not found' }
  }

  if (tenant.status !== 'active') {
    return { allowed: false, reason: `Tenant is ${tenant.status}` }
  }

  const usage = await getUsageStorage().get(tenantId)
  if (!usage) {
    return { allowed: false, reason: 'Usage data not found' }
  }

  // Check limits based on action
  switch (action) {
    case 'issue_credential':
      if (tenant.config.maxCredentials && usage.credentialsIssued >= tenant.config.maxCredentials) {
        return { allowed: false, reason: 'Credential limit reached' }
      }
      break

    case 'batch_issuance':
      if (!tenant.config.features.batchIssuance) {
        return { allowed: false, reason: 'Batch issuance not enabled for this tenant' }
      }
      break

    case 'sdjwt':
      if (!tenant.config.features.sdjwt) {
        return { allowed: false, reason: 'SD-JWT not enabled for this tenant' }
      }
      break

    case 'revocation':
      if (!tenant.config.features.revocation) {
        return { allowed: false, reason: 'Revocation not enabled for this tenant' }
      }
      break
  }

  return { allowed: true }
}

/**
 * Check if credential type is allowed for tenant
 */
export async function isCredentialTypeAllowed(
  tenantId: string,
  credentialType: string
): Promise<boolean> {
  const tenant = await getTenantsStorage().get(tenantId)
  if (!tenant) return false

  return tenant.config.allowedCredentialTypes.includes(credentialType)
}

/**
 * Get tenant rate limits
 */
export async function getRateLimits(
  tenantId: string
): Promise<TenantConfig['rateLimit'] | null> {
  const tenant = await getTenantsStorage().get(tenantId)
  return tenant?.config.rateLimit || null
}

/**
 * Get statistics
 */
export async function getStats(): Promise<{
  totalTenants: number
  activeTenants: number
  suspendedTenants: number
  totalCredentialsIssued: number
  totalApiCalls: number
  storageType: string
}> {
  const tenants = await getTenantsStorage().list()
  const usages = await getUsageStorage().list()

  return {
    totalTenants: tenants.length,
    activeTenants: tenants.filter((t) => t.status === 'active').length,
    suspendedTenants: tenants.filter((t) => t.status === 'suspended').length,
    totalCredentialsIssued: usages.reduce((sum, u) => sum + u.credentialsIssued, 0),
    totalApiCalls: usages.reduce((sum, u) => sum + u.apiCalls, 0),
    storageType: getStorageFactory().getStorageType(),
  }
}

/**
 * Middleware helper: extract tenant from request
 */
export async function extractTenantFromRequest(req: {
  headers?: Record<string, string | string[] | undefined>
  hostname?: string
  query?: Record<string, any>
}): Promise<Tenant | null> {
  // Try X-Tenant-ID header
  const tenantId = req.headers?.['x-tenant-id']
  if (typeof tenantId === 'string') {
    const tenant = await getTenantsStorage().get(tenantId)
    if (tenant) return tenant
  }

  // Try X-Tenant-Slug header
  const tenantSlug = req.headers?.['x-tenant-slug']
  if (typeof tenantSlug === 'string') {
    const tenant = await getTenantBySlug(tenantSlug)
    if (tenant) return tenant
  }

  // Try subdomain (e.g., tenant.example.com)
  const hostname = req.hostname
  if (hostname) {
    const subdomain = hostname.split('.')[0]
    const tenant = await getTenantBySlug(subdomain)
    if (tenant) return tenant
  }

  // Try query parameter
  const queryTenantId = req.query?.tenantId
  if (typeof queryTenantId === 'string') {
    const tenant = await getTenantsStorage().get(queryTenantId)
    if (tenant) return tenant
  }

  return null
}

// Legacy class export for backward compatibility
export class MultiTenantService {
  async createTenant(name: string, slug: string, config?: Partial<TenantConfig>) {
    return createTenant(name, slug, config)
  }
  async getTenant(id: string) {
    return getTenant(id)
  }
  async getTenantBySlug(slug: string) {
    return getTenantBySlug(slug)
  }
  async listTenants(status?: Tenant['status']) {
    return listTenants(status)
  }
  async updateTenant(id: string, updates: Partial<Pick<Tenant, 'name' | 'config' | 'metadata'>>) {
    return updateTenant(id, updates)
  }
  async suspendTenant(id: string, reason?: string) {
    return suspendTenant(id, reason)
  }
  async activateTenant(id: string) {
    return activateTenant(id)
  }
  async deleteTenant(id: string) {
    return deleteTenant(id)
  }
  async setCurrentTenant(id: string | null) {
    return setCurrentTenant(id)
  }
  async getCurrentTenant() {
    return getCurrentTenant()
  }
  async getUsage(tenantId: string) {
    return getUsage(tenantId)
  }
  async incrementUsage(tenantId: string, metric: keyof Omit<TenantUsage, 'tenantId' | 'updatedAt'>, amount?: number) {
    return incrementUsage(tenantId, metric, amount)
  }
  async canPerformAction(tenantId: string, action: string) {
    return canPerformAction(tenantId, action)
  }
  async isCredentialTypeAllowed(tenantId: string, credentialType: string) {
    return isCredentialTypeAllowed(tenantId, credentialType)
  }
  async getRateLimits(tenantId: string) {
    return getRateLimits(tenantId)
  }
  async getStats() {
    return getStats()
  }
  async extractTenantFromRequest(req: Parameters<typeof extractTenantFromRequest>[0]) {
    return extractTenantFromRequest(req)
  }
}

export const multiTenantService = new MultiTenantService()
