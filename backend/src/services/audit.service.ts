import { v4 as uuidv4 } from 'uuid'
import { logger } from '../utils/logger'
import {
  IStorageAdapter,
  createStorageAdapter,
  getStorageType,
} from '../core/storage'
import { eventBus } from '../core/event-bus'
import { isFeatureEnabled, requireFeature } from '../core/feature-flags'

/**
 * Audit Logging Service
 *
 * Provides comprehensive audit logging for security tracking
 * and compliance purposes.
 *
 * Now supports pluggable storage backends via IStorageAdapter.
 */

export type AuditEventType =
  | 'credential.issued'
  | 'credential.received'
  | 'credential.presented'
  | 'credential.verified'
  | 'credential.revoked'
  | 'credential.unrevoked'
  | 'credential.deleted'
  | 'auth.login'
  | 'auth.logout'
  | 'auth.token_generated'
  | 'auth.token_introspected'
  | 'auth.failed'
  | 'trust.entity_added'
  | 'trust.entity_removed'
  | 'trust.entity_updated'
  | 'trust.policy_created'
  | 'trust.verification'
  | 'api.request'
  | 'api.error'
  | 'system.startup'
  | 'system.shutdown'
  | 'system.config_change'

export type AuditAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'verify'
  | 'issue'
  | 'revoke'
  | 'login'
  | 'logout'
  | 'export'
  | 'import'

export interface AuditLogEntry {
  id: string
  timestamp: Date
  eventType: AuditEventType
  actorDid?: string
  actorId?: string
  resourceType?: string
  resourceId?: string
  action: AuditAction
  details: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
  requestId?: string
  success: boolean
  errorMessage?: string
  duration?: number
}

export interface AuditQuery {
  startDate?: Date
  endDate?: Date
  eventType?: AuditEventType
  actorDid?: string
  resourceType?: string
  resourceId?: string
  action?: AuditAction
  success?: boolean
  limit?: number
  offset?: number
}

// Storage adapter (initialized lazily)
let auditStorage: IStorageAdapter<AuditLogEntry> | null = null

/**
 * Get or initialize storage adapter
 */
function getStorage(): IStorageAdapter<AuditLogEntry> {
  if (!auditStorage) {
    auditStorage = createStorageAdapter<AuditLogEntry>('audit_logs')
  }
  return auditStorage
}

/**
 * Check if audit feature is enabled
 */
function ensureAuditEnabled(): void {
  requireFeature('module.audit')
}

/**
 * Create an audit log entry
 */
export async function createAuditLog(
  entry: Omit<AuditLogEntry, 'id' | 'timestamp'>
): Promise<AuditLogEntry> {
  const auditEntry: AuditLogEntry = {
    id: uuidv4(),
    timestamp: new Date(),
    ...entry,
  }

  // Store in persistent storage if audit is enabled
  if (isFeatureEnabled('module.audit')) {
    await getStorage().save(auditEntry.id, auditEntry)
  }

  // Also log to standard logger for immediate visibility
  logger.info('Audit log', {
    auditId: auditEntry.id,
    eventType: auditEntry.eventType,
    action: auditEntry.action,
    actorDid: auditEntry.actorDid,
    resourceType: auditEntry.resourceType,
    resourceId: auditEntry.resourceId,
    success: auditEntry.success,
    requestId: auditEntry.requestId,
    storage: getStorageType(),
  })

  // Emit event for subscribers
  eventBus.emit('audit.log.created', {
    id: auditEntry.id,
    eventType: auditEntry.eventType,
    action: auditEntry.action,
    success: auditEntry.success,
  })

  return auditEntry
}

/**
 * Log credential issuance
 */
export async function logCredentialIssuance(
  issuerDid: string,
  holderDid: string,
  credentialType: string,
  credentialId: string,
  requestId?: string,
  success: boolean = true,
  error?: string
): Promise<AuditLogEntry> {
  return createAuditLog({
    eventType: 'credential.issued',
    actorDid: issuerDid,
    resourceType: credentialType,
    resourceId: credentialId,
    action: 'issue',
    details: {
      holderDid,
      credentialType,
    },
    requestId,
    success,
    errorMessage: error,
  })
}

/**
 * Log credential verification
 */
export async function logCredentialVerification(
  verifierDid: string,
  holderDid: string,
  credentialType: string,
  verified: boolean,
  requestId?: string,
  details?: Record<string, unknown>
): Promise<AuditLogEntry> {
  return createAuditLog({
    eventType: 'credential.verified',
    actorDid: verifierDid,
    resourceType: credentialType,
    action: 'verify',
    details: {
      holderDid,
      verified,
      ...details,
    },
    requestId,
    success: true,
  })
}

/**
 * Log credential revocation
 */
export async function logCredentialRevocation(
  actorDid: string,
  credentialId: string,
  reason?: string,
  requestId?: string
): Promise<AuditLogEntry> {
  return createAuditLog({
    eventType: 'credential.revoked',
    actorDid,
    resourceType: 'credential',
    resourceId: credentialId,
    action: 'revoke',
    details: {
      reason,
    },
    requestId,
    success: true,
  })
}

/**
 * Log authentication event
 */
export async function logAuthEvent(
  eventType: 'auth.login' | 'auth.logout' | 'auth.token_generated' | 'auth.failed',
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
  success: boolean = true,
  error?: string,
  requestId?: string
): Promise<AuditLogEntry> {
  return createAuditLog({
    eventType,
    actorId,
    action: eventType === 'auth.logout' ? 'logout' : 'login',
    details: {},
    ipAddress,
    userAgent,
    requestId,
    success,
    errorMessage: error,
  })
}

/**
 * Log trust registry changes
 */
export async function logTrustRegistryChange(
  eventType: 'trust.entity_added' | 'trust.entity_removed' | 'trust.entity_updated' | 'trust.policy_created',
  actorId: string,
  entityDid: string,
  action: AuditAction,
  details?: Record<string, unknown>,
  requestId?: string
): Promise<AuditLogEntry> {
  return createAuditLog({
    eventType,
    actorId,
    resourceType: 'trust_entity',
    resourceId: entityDid,
    action,
    details: details || {},
    requestId,
    success: true,
  })
}

/**
 * Log API request
 */
export async function logApiRequest(
  method: string,
  path: string,
  statusCode: number,
  duration: number,
  actorId?: string,
  ipAddress?: string,
  userAgent?: string,
  requestId?: string,
  error?: string
): Promise<AuditLogEntry> {
  const success = statusCode < 400

  return createAuditLog({
    eventType: success ? 'api.request' : 'api.error',
    actorId,
    resourceType: 'api',
    resourceId: `${method} ${path}`,
    action: 'read',
    details: {
      method,
      path,
      statusCode,
    },
    ipAddress,
    userAgent,
    requestId,
    success,
    errorMessage: error,
    duration,
  })
}

/**
 * Query audit logs
 */
export async function queryAuditLogs(query: AuditQuery): Promise<{
  logs: AuditLogEntry[]
  total: number
  hasMore: boolean
}> {
  if (!isFeatureEnabled('module.audit')) {
    return { logs: [], total: 0, hasMore: false }
  }

  // Build filter conditions
  const where: Record<string, unknown> = {}

  if (query.eventType) {
    where.eventType = query.eventType
  }
  if (query.actorDid) {
    where.actorDid = query.actorDid
  }
  if (query.resourceType) {
    where.resourceType = query.resourceType
  }
  if (query.resourceId) {
    where.resourceId = query.resourceId
  }
  if (query.action) {
    where.action = query.action
  }
  if (query.success !== undefined) {
    where.success = query.success
  }

  const result = await getStorage().query({
    where: Object.keys(where).length > 0 ? where : undefined,
    dateRange: query.startDate || query.endDate
      ? {
          field: 'timestamp',
          start: query.startDate,
          end: query.endDate,
        }
      : undefined,
    orderBy: '-timestamp',
    limit: query.limit || 100,
    offset: query.offset || 0,
  })

  return {
    logs: result.data,
    total: result.total,
    hasMore: result.hasMore,
  }
}

/**
 * Get audit log by ID
 */
export async function getAuditLog(id: string): Promise<AuditLogEntry | null> {
  if (!isFeatureEnabled('module.audit')) {
    return null
  }
  return getStorage().get(id)
}

/**
 * Get audit statistics
 */
export async function getAuditStats(since?: Date): Promise<{
  totalLogs: number
  byEventType: Record<string, number>
  byAction: Record<string, number>
  successRate: number
  recentErrors: AuditLogEntry[]
  storageType: string
}> {
  if (!isFeatureEnabled('module.audit')) {
    return {
      totalLogs: 0,
      byEventType: {},
      byAction: {},
      successRate: 100,
      recentErrors: [],
      storageType: getStorageType(),
    }
  }

  const filter = since
    ? { dateRange: { field: 'timestamp', start: since } }
    : {}

  const result = await getStorage().query({
    ...filter,
    limit: 10000, // Get a reasonable sample
  })

  const logs = result.data
  const byEventType: Record<string, number> = {}
  const byAction: Record<string, number> = {}
  let successCount = 0

  logs.forEach((log) => {
    byEventType[log.eventType] = (byEventType[log.eventType] || 0) + 1
    byAction[log.action] = (byAction[log.action] || 0) + 1
    if (log.success) successCount++
  })

  // Get recent errors
  const errorResult = await getStorage().query({
    where: { success: false },
    orderBy: '-timestamp',
    limit: 10,
  })

  return {
    totalLogs: result.total,
    byEventType,
    byAction,
    successRate: logs.length > 0 ? (successCount / logs.length) * 100 : 100,
    recentErrors: errorResult.data,
    storageType: getStorageType(),
  }
}

/**
 * Export audit logs
 */
export async function exportAuditLogs(query?: AuditQuery): Promise<AuditLogEntry[]> {
  if (!isFeatureEnabled('module.audit')) {
    return []
  }

  if (query) {
    const result = await queryAuditLogs({ ...query, limit: 100000 })
    return result.logs
  }

  // Export all
  const result = await getStorage().query({
    orderBy: '-timestamp',
    limit: 100000,
  })

  eventBus.emit('audit.log.exported', {
    count: result.data.length,
    timestamp: new Date(),
  })

  return result.data
}

/**
 * Clear old audit logs (for maintenance)
 */
export async function clearOldAuditLogs(olderThan: Date): Promise<number> {
  ensureAuditEnabled()

  // Get logs older than the cutoff
  const result = await getStorage().query({
    dateRange: {
      field: 'timestamp',
      end: olderThan,
    },
    limit: 100000,
  })

  let removed = 0
  for (const log of result.data) {
    const deleted = await getStorage().delete(log.id)
    if (deleted) removed++
  }

  if (removed > 0) {
    logger.info('Cleared old audit logs', { removed, olderThan })

    eventBus.emit('audit.log.cleared', {
      count: removed,
      olderThan,
    })
  }

  return removed
}

/**
 * Get audit log count
 */
export async function getAuditLogCount(): Promise<number> {
  if (!isFeatureEnabled('module.audit')) {
    return 0
  }
  return getStorage().count()
}

/**
 * Clear all audit logs (use with caution!)
 */
export async function clearAllAuditLogs(): Promise<void> {
  ensureAuditEnabled()

  await getStorage().clear()

  logger.warn('All audit logs cleared')

  eventBus.emit('audit.log.cleared', {
    all: true,
    timestamp: new Date(),
  })
}
