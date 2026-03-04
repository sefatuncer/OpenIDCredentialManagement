import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client'

/**
 * Prometheus Metrics Service
 *
 * Provides application metrics for monitoring and alerting.
 */

// Create a custom registry
export const metricsRegistry = new Registry()

// Collect default Node.js metrics
collectDefaultMetrics({ register: metricsRegistry })

// Custom application metrics

// HTTP Request metrics
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status_code'],
  registers: [metricsRegistry],
})

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'path', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
  registers: [metricsRegistry],
})

// Credential metrics
export const credentialsIssuedTotal = new Counter({
  name: 'credentials_issued_total',
  help: 'Total number of credentials issued',
  labelNames: ['credential_type'],
  registers: [metricsRegistry],
})

export const credentialsVerifiedTotal = new Counter({
  name: 'credentials_verified_total',
  help: 'Total number of credential verifications',
  labelNames: ['credential_type', 'result'],
  registers: [metricsRegistry],
})

export const credentialsRevokedTotal = new Counter({
  name: 'credentials_revoked_total',
  help: 'Total number of credentials revoked',
  registers: [metricsRegistry],
})

export const activeCredentialsGauge = new Gauge({
  name: 'active_credentials_count',
  help: 'Current number of active (non-revoked) credentials',
  registers: [metricsRegistry],
})

// Authentication metrics
export const authAttemptsTotal = new Counter({
  name: 'auth_attempts_total',
  help: 'Total number of authentication attempts',
  labelNames: ['method', 'result'],
  registers: [metricsRegistry],
})

export const activeSessionsGauge = new Gauge({
  name: 'active_sessions_count',
  help: 'Current number of active sessions',
  registers: [metricsRegistry],
})

// Trust Registry metrics
export const trustedEntitiesGauge = new Gauge({
  name: 'trusted_entities_count',
  help: 'Current number of trusted entities',
  labelNames: ['type'],
  registers: [metricsRegistry],
})

// Rate limiting metrics
export const rateLimitHitsTotal = new Counter({
  name: 'rate_limit_hits_total',
  help: 'Total number of rate limit hits',
  labelNames: ['endpoint'],
  registers: [metricsRegistry],
})

// Error metrics
export const errorsTotal = new Counter({
  name: 'errors_total',
  help: 'Total number of errors',
  labelNames: ['type', 'code'],
  registers: [metricsRegistry],
})

// Agent health metrics
export const agentHealthGauge = new Gauge({
  name: 'agent_health',
  help: 'Health status of agents (1 = healthy, 0 = unhealthy)',
  labelNames: ['agent_type'],
  registers: [metricsRegistry],
})

// Wallet metrics
export const walletOperationsTotal = new Counter({
  name: 'wallet_operations_total',
  help: 'Total number of wallet operations',
  labelNames: ['operation', 'result'],
  registers: [metricsRegistry],
})

// AI Agent metrics
export const agentCountGauge = new Gauge({
  name: 'agent_count_total',
  help: 'Total number of AI agents',
  labelNames: ['status', 'trust_level', 'type'],
  registers: [metricsRegistry],
})

export const credentialRequestsTotal = new Counter({
  name: 'credential_requests_total',
  help: 'Total number of credential requests from external agents',
  labelNames: ['status', 'proof_type'],
  registers: [metricsRegistry],
})

export const agentActionsTotal = new Counter({
  name: 'agent_actions_total',
  help: 'Total number of agent actions',
  labelNames: ['action', 'agent_type'],
  registers: [metricsRegistry],
})

export const agentCapabilityRevocationsTotal = new Counter({
  name: 'agent_capability_revocations_total',
  help: 'Total number of capability revocations',
  labelNames: ['capability'],
  registers: [metricsRegistry],
})

export const agentTrustDowngradesTotal = new Counter({
  name: 'agent_trust_downgrades_total',
  help: 'Total number of trust level downgrades',
  labelNames: ['from_level', 'to_level'],
  registers: [metricsRegistry],
})

export const agentCredentialRevocationsTotal = new Counter({
  name: 'agent_credential_revocations_total',
  help: 'Total number of agent credential revocations',
  registers: [metricsRegistry],
})

export const agentEmergencyStopsTotal = new Counter({
  name: 'agent_emergency_stops_total',
  help: 'Total number of emergency stops',
  registers: [metricsRegistry],
})

export const agentSuspiciousActionsTotal = new Counter({
  name: 'agent_suspicious_actions_total',
  help: 'Total number of suspicious actions detected',
  labelNames: ['agent_did', 'agent_name', 'action_type'],
  registers: [metricsRegistry],
})

export const agentCapabilitiesGauge = new Gauge({
  name: 'agent_capabilities_total',
  help: 'Total capabilities across all agents',
  labelNames: ['capability'],
  registers: [metricsRegistry],
})

export const agentCountPerOrgGauge = new Gauge({
  name: 'agent_count_per_organization',
  help: 'Number of agents per organization',
  labelNames: ['organization'],
  registers: [metricsRegistry],
})

/**
 * Record HTTP request metrics
 */
export function recordHttpRequest(
  method: string,
  path: string,
  statusCode: number,
  durationSeconds: number
): void {
  const normalizedPath = normalizePath(path)
  httpRequestsTotal.inc({ method, path: normalizedPath, status_code: statusCode.toString() })
  httpRequestDuration.observe({ method, path: normalizedPath, status_code: statusCode.toString() }, durationSeconds)
}

/**
 * Record credential issuance
 */
export function recordCredentialIssuance(credentialType: string): void {
  credentialsIssuedTotal.inc({ credential_type: credentialType })
}

/**
 * Record credential verification
 */
export function recordCredentialVerification(credentialType: string, verified: boolean): void {
  credentialsVerifiedTotal.inc({ credential_type: credentialType, result: verified ? 'success' : 'failure' })
}

/**
 * Record credential revocation
 */
export function recordCredentialRevocation(): void {
  credentialsRevokedTotal.inc()
}

/**
 * Update active credentials gauge
 */
export function updateActiveCredentials(count: number): void {
  activeCredentialsGauge.set(count)
}

/**
 * Record authentication attempt
 */
export function recordAuthAttempt(method: 'jwt' | 'api_key', success: boolean): void {
  authAttemptsTotal.inc({ method, result: success ? 'success' : 'failure' })
}

/**
 * Record rate limit hit
 */
export function recordRateLimitHit(endpoint: string): void {
  rateLimitHitsTotal.inc({ endpoint: normalizePath(endpoint) })
}

/**
 * Record error
 */
export function recordError(type: string, code: string): void {
  errorsTotal.inc({ type, code })
}

/**
 * Update trusted entities gauge
 */
export function updateTrustedEntities(type: 'issuer' | 'verifier', count: number): void {
  trustedEntitiesGauge.set({ type }, count)
}

/**
 * Update agent health
 */
export function updateAgentHealth(agentType: string, healthy: boolean): void {
  agentHealthGauge.set({ agent_type: agentType }, healthy ? 1 : 0)
}

// AI Agent metric recording functions

/**
 * Record agent count by status, trust level, and type
 */
export function updateAgentCount(status: string, trustLevel: string, type: string, count: number): void {
  agentCountGauge.set({ status, trust_level: trustLevel, type }, count)
}

/**
 * Record credential request
 */
export function recordCredentialRequest(status: 'pending' | 'approved' | 'rejected', proofType: string): void {
  credentialRequestsTotal.inc({ status, proof_type: proofType })
}

/**
 * Record agent action
 */
export function recordAgentAction(action: string, agentType: string): void {
  agentActionsTotal.inc({ action, agent_type: agentType })
}

/**
 * Record capability revocation
 */
export function recordCapabilityRevocation(capability: string): void {
  agentCapabilityRevocationsTotal.inc({ capability })
}

/**
 * Record trust downgrade
 */
export function recordTrustDowngrade(fromLevel: string, toLevel: string): void {
  agentTrustDowngradesTotal.inc({ from_level: fromLevel, to_level: toLevel })
}

/**
 * Record agent credential revocation
 */
export function recordAgentCredentialRevocation(): void {
  agentCredentialRevocationsTotal.inc()
}

/**
 * Record emergency stop
 */
export function recordEmergencyStop(): void {
  agentEmergencyStopsTotal.inc()
}

/**
 * Record suspicious action
 */
export function recordSuspiciousAction(agentDid: string, agentName: string, actionType: string): void {
  agentSuspiciousActionsTotal.inc({ agent_did: agentDid, agent_name: agentName, action_type: actionType })
}

/**
 * Update capability count
 */
export function updateCapabilityCount(capability: string, count: number): void {
  agentCapabilitiesGauge.set({ capability }, count)
}

/**
 * Update agent count per organization
 */
export function updateAgentCountPerOrg(organization: string, count: number): void {
  agentCountPerOrgGauge.set({ organization }, count)
}

/**
 * Get metrics in Prometheus format
 */
export async function getMetrics(): Promise<string> {
  return metricsRegistry.metrics()
}

/**
 * Get metrics content type
 */
export function getMetricsContentType(): string {
  return metricsRegistry.contentType
}

/**
 * Normalize path for metrics (remove IDs and query strings)
 */
function normalizePath(path: string): string {
  return path
    // Remove query strings
    .split('?')[0]
    // Replace UUIDs
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    // Replace numeric IDs
    .replace(/\/\d+/g, '/:id')
    // Remove trailing slashes
    .replace(/\/$/, '') || '/'
}
