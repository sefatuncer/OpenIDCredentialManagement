import { auth } from './auth';
import { env } from '../config/env';
import { toast } from '../hooks/useToast';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function ensureValidToken(): Promise<boolean> {
  if (!auth.isAuthenticated()) {
    return false;
  }

  if (auth.shouldRefreshToken()) {
    const refreshed = await auth.refreshToken();
    if (!refreshed) {
      auth.logout();
      window.location.href = '/login?reason=token_expired';
      return false;
    }
  }

  return true;
}

function handleApiError(error: string, showToast = true): void {
  if (showToast) {
    toast.error(error);
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  config: { showErrorToast?: boolean } = {}
): Promise<ApiResponse<T>> {
  const { showErrorToast = true } = config;

  const isValid = await ensureValidToken();
  if (!isValid && !endpoint.includes('/auth/')) {
    return {
      success: false,
      error: 'Invalid session',
    };
  }

  const token = auth.getToken();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...options.headers,
  };

  try {
    const response = await fetch(`${env.API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      auth.logout();
      window.location.href = '/login?reason=unauthorized';
      return {
        success: false,
        error: 'Session expired',
      };
    }

    const data = await response.json();

    if (!response.ok) {
      const errorMessage = data.error || data.message || 'Request failed';
      handleApiError(errorMessage, showErrorToast);
      return {
        success: false,
        error: errorMessage,
      };
    }

    return {
      success: true,
      data,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Connection error';
    handleApiError(errorMessage, showErrorToast);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

// Holder API
export const holderApi = {
  getDID: () => request<{ did: string }>('/holder/did', {}, { showErrorToast: false }),

  getCredentials: () => request<{ credentials: unknown[] }>('/holder/credentials', {}, { showErrorToast: false }),
};

// Issuer API
export const issuerApi = {
  getDID: () => request<{ did: string }>('/issuer/did'),

  issueAgentIdentity: (data: {
    holderDid: string;
    agentId: string;
    agentType: 'autonomous' | 'semi-autonomous' | 'supervised' | 'tool';
    agentName?: string;
    agentVersion?: string;
    capabilities?: string[];
    ownerDid: string;
    ownerName?: string;
    trustLevel?: 'basic' | 'standard' | 'elevated' | 'high';
    validUntil?: string;
  }) =>
    request<{ success: boolean; credentialOfferId: string; credentialOfferUri: string }>(
      '/issuer/credentials/agent-identity',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ),

  issueDelegation: (data: {
    holderDid: string;
    delegatorDid: string;
    delegatorName?: string;
    delegateDid: string;
    delegateName?: string;
    scope: string[];
    constraints?: Record<string, unknown>;
    purpose?: string;
    validFrom?: string;
    validUntil?: string;
    revocable?: boolean;
  }) =>
    request<{ success: boolean; credentialOfferId: string; credentialOfferUri: string }>(
      '/issuer/credentials/delegation',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ),

  issueCapability: (data: {
    holderDid: string;
    capabilityType: string;
    resource: string;
    actions: string[];
    conditions?: Record<string, unknown>;
    grantedBy?: string;
    validUntil?: string;
  }) =>
    request<{ success: boolean; credentialOfferId: string; credentialOfferUri: string }>(
      '/issuer/credentials/capability',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ),

  issueBatch: (data: {
    credentialType: string;
    format?: string;
    recipients: Array<{ holderDid: string; claims: Record<string, unknown> }>;
  }) =>
    request<{ jobId: string; totalRequests: number }>(
      '/issuer/credentials/batch',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ),

  getBatchStatus: (jobId: string) =>
    request<{
      jobId: string;
      status: 'pending' | 'processing' | 'completed' | 'failed';
      totalRequests: number;
      processedCount: number;
      successCount: number;
      failureCount: number;
    }>(`/issuer/credentials/batch/${encodeURIComponent(jobId)}`),

  getBatchResults: (jobId: string) =>
    request<{
      results: Array<{
        id: string;
        success: boolean;
        credentialId?: string;
        credential?: string;
        error?: string;
      }>;
    }>(`/issuer/credentials/batch/${encodeURIComponent(jobId)}/results`),

  issueBySchema: (data: {
    holderDid: string;
    schemaId: string;
    claims: Record<string, unknown>;
    format?: 'jwt_vc_json' | 'vc+sd-jwt';
    selectiveDisclosureClaims?: string[];
    validityDays?: number;
    revocable?: boolean;
  }) =>
    request<{ credentialOfferId: string; credentialOfferUri: string }>(
      '/issuer/credentials/schema-issue',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ),
};

// Revocation API
export const revocationApi = {
  revoke: (data: { credentialId: string; reason?: string }) =>
    request<{ success: boolean }>('/revocation/revoke', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  unrevoke: (data: { credentialId: string }) =>
    request<{ success: boolean }>('/revocation/unrevoke', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getStats: () =>
    request<{
      total: number;
      revoked: number;
      active: number;
    }>('/revocation/stats', {}, { showErrorToast: false }),

  getStatusList: () =>
    request<{
      statusLists: Array<{
        id: string;
        type: string;
        size: number;
        used: number;
      }>;
    }>('/revocation/status-list', {}, { showErrorToast: false }),

  checkStatus: (credentialId: string) =>
    request<{ revoked: boolean; revokedAt?: string }>(
      `/revocation/status/${encodeURIComponent(credentialId)}`
    ),
};

// Verifier API
export const verifierApi = {
  getDID: () => request<{ did: string }>('/verifier/did'),

  verifyAgentIdentity: (data?: { challenge?: string }) =>
    request<{
      sessionId: string;
      requestUri: string;
      qrData: string;
    }>('/verifier/verify/agent-identity', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),

  verifyDelegation: (data?: { delegatorDid?: string }) =>
    request<{
      sessionId: string;
      requestUri: string;
      qrData: string;
    }>('/verifier/verify/delegation', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),

  verifyCombined: (data?: { requiredCredentials?: string[] }) =>
    request<{
      sessionId: string;
      requestUri: string;
      qrData: string;
    }>('/verifier/verify/combined', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),

  getResult: (sessionId: string) =>
    request<{
      status: 'pending' | 'completed' | 'failed' | 'expired';
      result?: {
        verified: boolean;
        credentials: unknown[];
        holder?: string;
      };
      error?: string;
    }>(`/verifier/verify/${sessionId}/result`),
};

// Trust API
export const trustApi = {
  getTrustedIssuers: () =>
    request<{
      issuers: Array<{
        did: string;
        name?: string;
        addedAt: string;
      }>;
    }>('/trust/issuers', {}, { showErrorToast: false }),

  addTrustedIssuer: (data: { did: string; name?: string }) =>
    request<{ success: boolean }>('/trust/issuers', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  removeTrustedIssuer: (did: string) =>
    request<{ success: boolean }>(`/trust/issuers/${encodeURIComponent(did)}`, {
      method: 'DELETE',
    }),

  getPolicies: () =>
    request<{
      policies: Array<{
        id: string;
        name: string;
        rules: unknown[];
      }>;
    }>('/trust/policies', {}, { showErrorToast: false }),
};

// Audit API
export const auditApi = {
  getLogs: (params?: {
    page?: number;
    limit?: number;
    action?: string;
    from?: string;
    to?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.action) searchParams.set('action', params.action);
    if (params?.from) searchParams.set('from', params.from);
    if (params?.to) searchParams.set('to', params.to);

    const query = searchParams.toString();
    return request<{
      logs: Array<{
        id: string;
        action: string;
        actor: string;
        target?: string;
        timestamp: string;
        details?: Record<string, unknown>;
      }>;
      total: number;
      page: number;
      limit: number;
    }>(`/audit/logs${query ? `?${query}` : ''}`, {}, { showErrorToast: false });
  },

  getStats: (period?: 'day' | 'week' | 'month') =>
    request<{
      totalActions: number;
      byAction: Record<string, number>;
      byDay: Array<{ date: string; count: number }>;
    }>(`/audit/stats${period ? `?period=${period}` : ''}`, {}, { showErrorToast: false }),
};

// Schema Registry API
export const schemaApi = {
  list: () =>
    request<{
      schemas: Array<{
        id: string;
        name: string;
        version: string;
        type: string;
        description: string;
        required: string[];
        credentialSubject: {
          type: string;
          properties: Record<string, unknown>;
        };
        issuanceConfig?: {
          validityPeriod?: number;
          revocable?: boolean;
          selectiveDisclosure?: string[];
        };
        active: boolean;
        createdAt: string;
        updatedAt: string;
      }>;
    }>('/schemas'),

  get: (id: string) =>
    request<{
      schema: {
        id: string;
        name: string;
        version: string;
        type: string;
        description: string;
        required: string[];
        credentialSubject: {
          type: string;
          properties: Record<string, unknown>;
        };
        issuanceConfig?: {
          validityPeriod?: number;
          revocable?: boolean;
          selectiveDisclosure?: string[];
        };
        active: boolean;
        createdAt: string;
        updatedAt: string;
      };
    }>(`/schemas/${encodeURIComponent(id)}`),

  create: (data: {
    id: string;
    name: string;
    version: string;
    type: string;
    description: string;
    required?: string[];
    credentialSubject: {
      type: string;
      properties: Record<string, unknown>;
    };
    issuanceConfig?: {
      validityPeriod?: number;
      revocable?: boolean;
      selectiveDisclosure?: string[];
    };
  }) =>
    request<{ schema: unknown }>('/schemas', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Record<string, unknown>) =>
    request<{ schema: unknown }>(`/schemas/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deactivate: (id: string) =>
    request<{ success: boolean }>(`/schemas/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
};

// OAuth 2.0 Bridge
export const oauthBridgeApi = {
  exchangeToken: (subjectToken: string, scope?: string) =>
    request<{
      access_token: string;
      token_type: string;
      expires_in: number;
      scope: string;
      issued_token_type: string;
    }>('/oauth/token-exchange', {
      method: 'POST',
      body: JSON.stringify({
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        subject_token: subjectToken,
        subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
        ...(scope && { scope }),
      }),
    }),

  introspect: (token: string) =>
    request<{
      active: boolean;
      sub?: string;
      scope?: string;
      exp?: number;
      iat?: number;
      source_credential_type?: string;
      issuer_did?: string;
    }>('/oauth/introspect', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  getScopeMappings: () =>
    request<{
      mappings: Record<string, { field: string; example: string[] }>;
      trust_levels: Record<string, string[]>;
    }>('/oauth/scope-mappings'),
};

// Webhook API
export const webhookApi = {
  list: () =>
    request<{
      webhooks: Array<{
        id: string;
        url: string;
        secret: string;
        events: string[];
        active: boolean;
        createdAt: string;
        updatedAt: string;
        metadata?: { name?: string; description?: string };
      }>;
    }>('/webhooks'),

  get: (id: string) =>
    request<{
      webhook: {
        id: string;
        url: string;
        secret: string;
        events: string[];
        active: boolean;
        createdAt: string;
        updatedAt: string;
        metadata?: { name?: string; description?: string };
      };
    }>(`/webhooks/${encodeURIComponent(id)}`),

  create: (data: {
    url: string;
    events: string[];
    name?: string;
    description?: string;
  }) =>
    request<{
      webhook: {
        id: string;
        url: string;
        secret: string;
        events: string[];
        active: boolean;
        createdAt: string;
        metadata?: { name?: string; description?: string };
      };
    }>('/webhooks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: {
    url?: string;
    events?: string[];
    active?: boolean;
    name?: string;
    description?: string;
  }) =>
    request<{ webhook: unknown }>(`/webhooks/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<{ success: boolean }>(`/webhooks/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  test: (id: string) =>
    request<{
      success: boolean;
      responseStatus?: number;
      latencyMs: number;
    }>(`/webhooks/${encodeURIComponent(id)}/test`, {
      method: 'POST',
    }),

  deliveries: (id: string) =>
    request<{
      deliveries: Array<{
        id: string;
        webhookId: string;
        event: string;
        status: 'pending' | 'success' | 'failed';
        attempts: number;
        responseStatus?: number;
        responseBody?: string;
        createdAt: string;
        lastAttemptAt?: string;
      }>;
    }>(`/webhooks/${encodeURIComponent(id)}/deliveries`),
};

// Tenant API
export const tenantApi = {
  list: (status?: string) =>
    request<{ tenants: Array<{
      id: string; name: string; slug: string;
      status: 'active' | 'suspended' | 'pending';
      config: { maxCredentials?: number; maxIssuers?: number; maxHolders?: number; allowedCredentialTypes: string[]; features: { sdjwt: boolean; revocation: boolean; batchIssuance: boolean; webhooks: boolean }; rateLimit?: { requestsPerMinute: number; requestsPerHour: number } };
      metadata: Record<string, unknown>; createdAt: string; updatedAt: string;
    }>; total: number }>(status ? `/tenants?status=${status}` : '/tenants'),

  getStats: () =>
    request<{ totalTenants: number; activeTenants: number; suspendedTenants: number; totalCredentialsIssued: number; totalApiCalls: number; storageType: string }>('/tenants/stats'),

  get: (id: string) =>
    request<{ tenant: unknown }>(`/tenants/${encodeURIComponent(id)}`),

  create: (name: string, slug: string, config?: Record<string, unknown>) =>
    request<{ tenant: unknown }>('/tenants', {
      method: 'POST',
      body: JSON.stringify({ name, slug, config }),
    }),

  update: (id: string, updates: Record<string, unknown>) =>
    request<{ tenant: unknown }>(`/tenants/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  suspend: (id: string, reason?: string) =>
    request<{ message: string }>(`/tenants/${encodeURIComponent(id)}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  activate: (id: string) =>
    request<{ message: string }>(`/tenants/${encodeURIComponent(id)}/activate`, {
      method: 'POST',
    }),

  delete: (id: string) =>
    request<{ message: string }>(`/tenants/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  getUsage: (id: string) =>
    request<{ usage: { tenantId: string; credentialsIssued: number; credentialsRevoked: number; presentationsVerified: number; apiCalls: number; storageUsedBytes: number; updatedAt: string } }>(`/tenants/${encodeURIComponent(id)}/usage`),
};

// Health check
export const healthApi = {
  check: () => request<{ status: string }>('/health', {}, { showErrorToast: false }),
};

export default {
  holder: holderApi,
  issuer: issuerApi,
  revocation: revocationApi,
  verifier: verifierApi,
  trust: trustApi,
  audit: auditApi,
  schema: schemaApi,
  oauthBridge: oauthBridgeApi,
  webhook: webhookApi,
  tenant: tenantApi,
  health: healthApi,
};
