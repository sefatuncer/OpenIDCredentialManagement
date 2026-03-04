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
    ...(token && { 'X-API-Key': token }),
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
  health: healthApi,
};
