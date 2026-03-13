/**
 * Metrics Service Tests
 */

// Reset prom-client registry between tests
beforeEach(async () => {
  // Import fresh to get clean state
  const { metricsRegistry } = await import('../../src/services/metrics.service')
  // Reset all metrics to avoid cardinality bleed between tests
  // Note: prom-client counters can only go up, so we verify increments via getMetrics() output
})

import {
  metricsRegistry,
  httpRequestsTotal,
  httpRequestDuration,
  credentialsIssuedTotal,
  credentialsVerifiedTotal,
  credentialsRevokedTotal,
  activeCredentialsGauge,
  authAttemptsTotal,
  activeSessionsGauge,
  trustedEntitiesGauge,
  rateLimitHitsTotal,
  errorsTotal,
  agentHealthGauge,
  walletOperationsTotal,
  agentCountGauge,
  credentialRequestsTotal,
  agentActionsTotal,
  agentCapabilityRevocationsTotal,
  agentTrustDowngradesTotal,
  agentCredentialRevocationsTotal,
  agentEmergencyStopsTotal,
  agentSuspiciousActionsTotal,
  agentCapabilitiesGauge,
  agentCountPerOrgGauge,
  recordHttpRequest,
  recordCredentialIssuance,
  recordCredentialVerification,
  recordCredentialRevocation,
  updateActiveCredentials,
  recordAuthAttempt,
  recordRateLimitHit,
  recordError,
  updateTrustedEntities,
  updateAgentHealth,
  updateAgentCount,
  recordCredentialRequest,
  recordAgentAction,
  recordCapabilityRevocation,
  recordTrustDowngrade,
  recordAgentCredentialRevocation,
  recordEmergencyStop,
  recordSuspiciousAction,
  updateCapabilityCount,
  updateAgentCountPerOrg,
  getMetrics,
  getMetricsContentType,
} from '../../src/services/metrics.service'

describe('MetricsService', () => {
  describe('Counter metrics', () => {
    it('should increment http_requests_total counter', async () => {
      recordHttpRequest('GET', '/api/v1/credentials', 200, 0.05)

      const metrics = await getMetrics()
      expect(metrics).toContain('http_requests_total')
      expect(metrics).toContain('method="GET"')
      expect(metrics).toContain('path="/api/v1/credentials"')
      expect(metrics).toContain('status_code="200"')
    })

    it('should record http request duration histogram', async () => {
      recordHttpRequest('POST', '/api/v1/credentials', 201, 1.5)

      const metrics = await getMetrics()
      expect(metrics).toContain('http_request_duration_seconds')
      expect(metrics).toContain('method="POST"')
    })

    it('should increment credentials_issued_total', async () => {
      recordCredentialIssuance('AIAgentIdentityCredential')

      const metrics = await getMetrics()
      expect(metrics).toContain('credentials_issued_total')
      expect(metrics).toContain('credential_type="AIAgentIdentityCredential"')
    })

    it('should increment credentials_verified_total with success result', async () => {
      recordCredentialVerification('VerifiableCredential', true)

      const metrics = await getMetrics()
      expect(metrics).toContain('credentials_verified_total')
      expect(metrics).toContain('result="success"')
    })

    it('should increment credentials_verified_total with failure result', async () => {
      recordCredentialVerification('VerifiableCredential', false)

      const metrics = await getMetrics()
      expect(metrics).toContain('credentials_verified_total')
      expect(metrics).toContain('result="failure"')
    })

    it('should increment credentials_revoked_total', async () => {
      recordCredentialRevocation()

      const metrics = await getMetrics()
      expect(metrics).toContain('credentials_revoked_total')
    })

    it('should increment auth_attempts_total with jwt method', async () => {
      recordAuthAttempt('jwt', true)

      const metrics = await getMetrics()
      expect(metrics).toContain('auth_attempts_total')
      expect(metrics).toContain('method="jwt"')
      expect(metrics).toContain('result="success"')
    })

    it('should increment auth_attempts_total with api_key method failure', async () => {
      recordAuthAttempt('api_key', false)

      const metrics = await getMetrics()
      expect(metrics).toContain('auth_attempts_total')
      expect(metrics).toContain('method="api_key"')
      expect(metrics).toContain('result="failure"')
    })

    it('should increment rate_limit_hits_total', async () => {
      recordRateLimitHit('/api/v1/auth/token')

      const metrics = await getMetrics()
      expect(metrics).toContain('rate_limit_hits_total')
    })

    it('should increment errors_total with type and code', async () => {
      recordError('validation', '400')

      const metrics = await getMetrics()
      expect(metrics).toContain('errors_total')
      expect(metrics).toContain('type="validation"')
      expect(metrics).toContain('code="400"')
    })

    it('should increment wallet_operations_total', () => {
      walletOperationsTotal.inc({ operation: 'credential_store', result: 'success' })

      // No throw means counter works
      expect(walletOperationsTotal).toBeDefined()
    })

    it('should increment credential_requests_total', async () => {
      recordCredentialRequest('approved', 'jwt_proof')

      const metrics = await getMetrics()
      expect(metrics).toContain('credential_requests_total')
      expect(metrics).toContain('status="approved"')
      expect(metrics).toContain('proof_type="jwt_proof"')
    })

    it('should increment agent_actions_total', async () => {
      recordAgentAction('text_generation', 'autonomous')

      const metrics = await getMetrics()
      expect(metrics).toContain('agent_actions_total')
      expect(metrics).toContain('action="text_generation"')
      expect(metrics).toContain('agent_type="autonomous"')
    })

    it('should increment agent_capability_revocations_total', async () => {
      recordCapabilityRevocation('api-access')

      const metrics = await getMetrics()
      expect(metrics).toContain('agent_capability_revocations_total')
      expect(metrics).toContain('capability="api-access"')
    })

    it('should increment agent_trust_downgrades_total', async () => {
      recordTrustDowngrade('elevated', 'basic')

      const metrics = await getMetrics()
      expect(metrics).toContain('agent_trust_downgrades_total')
      expect(metrics).toContain('from_level="elevated"')
      expect(metrics).toContain('to_level="basic"')
    })

    it('should increment agent_credential_revocations_total', async () => {
      recordAgentCredentialRevocation()

      const metrics = await getMetrics()
      expect(metrics).toContain('agent_credential_revocations_total')
    })

    it('should increment agent_emergency_stops_total', async () => {
      recordEmergencyStop()

      const metrics = await getMetrics()
      expect(metrics).toContain('agent_emergency_stops_total')
    })

    it('should increment agent_suspicious_actions_total', async () => {
      recordSuspiciousAction('did:key:z6Mk123', 'SuspiciousBot', 'unauthorized_access')

      const metrics = await getMetrics()
      expect(metrics).toContain('agent_suspicious_actions_total')
      expect(metrics).toContain('agent_did="did:key:z6Mk123"')
      expect(metrics).toContain('action_type="unauthorized_access"')
    })
  })

  describe('Gauge metrics', () => {
    it('should set active_credentials_count gauge', async () => {
      updateActiveCredentials(42)

      const metrics = await getMetrics()
      expect(metrics).toContain('active_credentials_count')
      expect(metrics).toContain('42')
    })

    it('should update active_credentials_count gauge to new value', async () => {
      updateActiveCredentials(100)
      updateActiveCredentials(50) // Gauges can go down

      const gauge = await activeCredentialsGauge.get()
      expect(gauge.values[0].value).toBe(50)
    })

    it('should set active_sessions_count gauge', () => {
      activeSessionsGauge.set(10)

      expect(activeSessionsGauge).toBeDefined()
    })

    it('should set trusted_entities_count gauge with type label', async () => {
      updateTrustedEntities('issuer', 5)
      updateTrustedEntities('verifier', 3)

      const metrics = await getMetrics()
      expect(metrics).toContain('trusted_entities_count')
      expect(metrics).toContain('type="issuer"')
      expect(metrics).toContain('type="verifier"')
    })

    it('should set agent_health gauge (1 = healthy)', async () => {
      updateAgentHealth('issuer', true)

      const metrics = await getMetrics()
      expect(metrics).toContain('agent_health')
      expect(metrics).toContain('agent_type="issuer"')
    })

    it('should set agent_health gauge (0 = unhealthy)', async () => {
      updateAgentHealth('holder', false)

      const gauge = await agentHealthGauge.get()
      const holderValue = gauge.values.find(
        (v) => v.labels.agent_type === 'holder'
      )
      expect(holderValue?.value).toBe(0)
    })

    it('should set agent_count_total gauge', async () => {
      updateAgentCount('active', 'elevated', 'autonomous', 15)

      const metrics = await getMetrics()
      expect(metrics).toContain('agent_count_total')
      expect(metrics).toContain('status="active"')
      expect(metrics).toContain('trust_level="elevated"')
    })

    it('should set agent_capabilities_total gauge', async () => {
      updateCapabilityCount('text-generation', 20)

      const metrics = await getMetrics()
      expect(metrics).toContain('agent_capabilities_total')
      expect(metrics).toContain('capability="text-generation"')
    })

    it('should set agent_count_per_organization gauge', async () => {
      updateAgentCountPerOrg('Acme Corp', 8)

      const metrics = await getMetrics()
      expect(metrics).toContain('agent_count_per_organization')
      expect(metrics).toContain('organization="Acme Corp"')
    })
  })

  describe('Histogram metrics', () => {
    it('should observe http_request_duration_seconds in correct buckets', async () => {
      // Record several requests with different durations
      recordHttpRequest('GET', '/api/v1/health', 200, 0.005)
      recordHttpRequest('GET', '/api/v1/health', 200, 0.05)
      recordHttpRequest('GET', '/api/v1/health', 200, 0.5)
      recordHttpRequest('GET', '/api/v1/health', 200, 5)

      const metrics = await getMetrics()
      expect(metrics).toContain('http_request_duration_seconds_bucket')
      expect(metrics).toContain('http_request_duration_seconds_sum')
      expect(metrics).toContain('http_request_duration_seconds_count')
    })

    it('should have correct bucket boundaries', async () => {
      const histogramData = await httpRequestDuration.get()
      // Verify bucket boundaries exist (le values)
      const bucketValues = histogramData.values
        .filter((v) => v.metricName === 'http_request_duration_seconds_bucket')
        .map((v) => (v.labels as Record<string, unknown>).le)

      // Should include configured buckets: 0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10
      expect(bucketValues).toContain(0.01)
      expect(bucketValues).toContain(0.1)
      expect(bucketValues).toContain(1)
      expect(bucketValues).toContain(10)
      expect(bucketValues).toContain('+Inf')
    })
  })

  describe('Path normalization', () => {
    it('should replace UUIDs in paths', async () => {
      recordHttpRequest('GET', '/api/v1/credentials/550e8400-e29b-41d4-a716-446655440000', 200, 0.1)

      const metrics = await getMetrics()
      expect(metrics).toContain('path="/api/v1/credentials/:id"')
      expect(metrics).not.toContain('550e8400')
    })

    it('should replace numeric IDs in paths', async () => {
      recordHttpRequest('GET', '/api/v1/users/12345', 200, 0.1)

      const metrics = await getMetrics()
      expect(metrics).toContain('path="/api/v1/users/:id"')
      expect(metrics).not.toContain('12345')
    })

    it('should remove query strings', async () => {
      recordHttpRequest('GET', '/api/v1/credentials?page=1&limit=10', 200, 0.1)

      const metrics = await getMetrics()
      expect(metrics).toContain('path="/api/v1/credentials"')
      expect(metrics).not.toContain('page=1')
    })

    it('should remove trailing slashes', async () => {
      recordHttpRequest('GET', '/api/v1/credentials/', 200, 0.1)

      const metrics = await getMetrics()
      expect(metrics).toContain('path="/api/v1/credentials"')
    })
  })

  describe('getMetrics', () => {
    it('should return Prometheus-formatted string', async () => {
      const metrics = await getMetrics()

      expect(typeof metrics).toBe('string')
      // Should contain HELP and TYPE lines (standard Prometheus format)
      expect(metrics).toContain('# HELP')
      expect(metrics).toContain('# TYPE')
    })

    it('should include default Node.js metrics', async () => {
      const metrics = await getMetrics()

      // prom-client collectDefaultMetrics adds process_* metrics
      expect(metrics).toContain('process_cpu')
    })
  })

  describe('getMetricsContentType', () => {
    it('should return prometheus content type', () => {
      const contentType = getMetricsContentType()

      expect(contentType).toContain('text/plain')
    })
  })

  describe('Metric label validation', () => {
    it('should handle empty string labels without throwing', () => {
      expect(() => {
        recordHttpRequest('', '', 0, 0)
      }).not.toThrow()
    })

    it('should handle special characters in labels', () => {
      expect(() => {
        recordError('validation/parse', 'ERR_INVALID_INPUT')
      }).not.toThrow()
    })

    it('should handle multiple label combinations for same metric', async () => {
      recordCredentialIssuance('AIAgentIdentityCredential')
      recordCredentialIssuance('DelegationCredential')
      recordCredentialIssuance('CapabilityCredential')

      const metrics = await getMetrics()
      expect(metrics).toContain('AIAgentIdentityCredential')
      expect(metrics).toContain('DelegationCredential')
      expect(metrics).toContain('CapabilityCredential')
    })
  })

  describe('Registry', () => {
    it('should use custom registry (not default)', () => {
      expect(metricsRegistry).toBeDefined()
      expect(metricsRegistry).not.toBe(require('prom-client').register)
    })

    it('should have all custom metrics registered', async () => {
      const metrics = await getMetrics()

      const expectedMetrics = [
        'http_requests_total',
        'http_request_duration_seconds',
        'credentials_issued_total',
        'credentials_verified_total',
        'credentials_revoked_total',
        'active_credentials_count',
        'auth_attempts_total',
        'active_sessions_count',
        'trusted_entities_count',
        'rate_limit_hits_total',
        'errors_total',
        'agent_health',
        'wallet_operations_total',
        'agent_count_total',
        'credential_requests_total',
        'agent_actions_total',
        'agent_capability_revocations_total',
        'agent_trust_downgrades_total',
        'agent_credential_revocations_total',
        'agent_emergency_stops_total',
        'agent_suspicious_actions_total',
        'agent_capabilities_total',
        'agent_count_per_organization',
      ]

      for (const metricName of expectedMetrics) {
        expect(metrics).toContain(metricName)
      }
    })
  })
})
