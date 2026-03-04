/**
 * AI Agent Service
 * Handles all agent-related API operations
 * Production-ready: No demo mode fallbacks
 */

import type {
  AgentIdentity,
  AgentWallet,
  AgentRegistrationRequest,
  DelegationGrant,
  DelegationRequest,
  TrustEstablishmentRequest,
  TrustLevel,
  BasicAgentCredential,
  RichAgentCredential,
  VerificationResult,
  AgentActivity,
} from '../types/agent.types';

// API Configuration
const API_BASE = '/api/v1';
const SSI_BACKEND_URL = import.meta.env.VITE_SSI_BACKEND_URL || 'http://localhost:3000';

// Auth token management
let authToken: string | null = null;

// Get credentials from environment
function getClientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = import.meta.env.VITE_CLIENT_ID || import.meta.env.VITE_WALLET_CLIENT_ID;
  const clientSecret = import.meta.env.VITE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Client credentials not configured. Set VITE_CLIENT_ID and VITE_CLIENT_SECRET.');
  }

  return { clientId, clientSecret };
}

async function getAuthToken(): Promise<string> {
  if (authToken) return authToken;

  const { clientId, clientSecret } = getClientCredentials();

  const response = await fetch('/api/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret, grantType: 'client_credentials' }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error_description || 'Authentication failed. Check your credentials.');
  }

  const data = await response.json();
  authToken = data.access_token;
  return authToken!;
}

async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAuthToken();

  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
}

// ============================================
// Agent Identity Management
// ============================================

/**
 * Register a new AI agent
 */
export async function registerAgent(request: AgentRegistrationRequest): Promise<AgentIdentity> {
  const response = await authFetch(`${API_BASE}/agents/register`, {
    method: 'POST',
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error_description || error.detail || 'Failed to register agent');
  }

  return response.json();
}

/**
 * Get agent identity by DID
 */
export async function getAgentIdentity(did: string): Promise<AgentIdentity | null> {
  const response = await authFetch(`${API_BASE}/agents/${encodeURIComponent(did)}`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error('Failed to get agent identity');
  }

  return response.json();
}

/**
 * Get current wallet (logged-in agent)
 */
export async function getMyWallet(): Promise<AgentWallet | null> {
  const response = await authFetch(`${API_BASE}/wallet`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error('Failed to get wallet');
  }

  return response.json();
}

/**
 * Update agent status
 */
export async function updateAgentStatus(
  did: string,
  status: 'active' | 'suspended'
): Promise<AgentIdentity> {
  const response = await authFetch(`${API_BASE}/agents/${encodeURIComponent(did)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    throw new Error('Failed to update agent status');
  }

  return response.json();
}

// ============================================
// Credential Management
// ============================================

/**
 * Request Basic Agent Credential (bVC)
 * Issued by security domain orchestrator
 */
export async function requestBasicCredential(securityDomain?: string): Promise<BasicAgentCredential> {
  const response = await authFetch(`${API_BASE}/agents/credentials/basic`, {
    method: 'POST',
    body: JSON.stringify({ securityDomain }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error_description || 'Failed to request basic credential');
  }

  return response.json();
}

/**
 * Request Rich Agent Credential (rVC)
 * Contains roles, capabilities, and authorizations
 */
export async function requestRichCredential(
  roles: string[],
  capabilities: string[],
  attesters?: string[]
): Promise<RichAgentCredential> {
  const response = await authFetch(`${API_BASE}/agents/credentials/rich`, {
    method: 'POST',
    body: JSON.stringify({
      roles,
      capabilities,
      requestedAttesters: attesters,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error_description || 'Failed to request rich credential');
  }

  return response.json();
}

/**
 * Get all credentials for current agent
 */
export async function getAgentCredentials(): Promise<{
  basic: BasicAgentCredential | null;
  rich: RichAgentCredential[];
  delegations: DelegationGrant[];
}> {
  const response = await authFetch(`${API_BASE}/agents/credentials`);

  if (!response.ok) {
    throw new Error('Failed to get credentials');
  }

  return response.json();
}

// ============================================
// Delegation Management
// ============================================

/**
 * Create a delegation grant for another agent
 */
export async function createDelegation(request: DelegationRequest): Promise<DelegationGrant> {
  const response = await authFetch(`${API_BASE}/delegations`, {
    method: 'POST',
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error_description || 'Failed to create delegation');
  }

  return response.json();
}

/**
 * Get all delegations (given and received)
 */
export async function getDelegations(): Promise<{
  given: DelegationGrant[];
  received: DelegationGrant[];
}> {
  const response = await authFetch(`${API_BASE}/delegations`);

  if (!response.ok) {
    throw new Error('Failed to get delegations');
  }

  return response.json();
}

/**
 * Revoke a delegation grant
 */
export async function revokeDelegation(delegationId: string, reason?: string): Promise<void> {
  const response = await authFetch(`${API_BASE}/delegations/${delegationId}/revoke`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });

  if (!response.ok) {
    throw new Error('Failed to revoke delegation');
  }
}

/**
 * Verify a delegation is valid and in scope
 */
export async function verifyDelegation(
  delegationId: string,
  action: string,
  resource: string
): Promise<{
  valid: boolean;
  inScope: boolean;
  errors?: string[];
}> {
  const response = await authFetch(`${API_BASE}/delegations/${delegationId}/verify`, {
    method: 'POST',
    body: JSON.stringify({ action, resource }),
  });

  if (!response.ok) {
    throw new Error('Failed to verify delegation');
  }

  return response.json();
}

// ============================================
// Trust Management
// ============================================

/**
 * Establish trust with another agent
 */
export async function establishTrust(request: TrustEstablishmentRequest): Promise<{
  success: boolean;
  trustRelationship: {
    agentDid: string;
    trustLevel: TrustLevel;
    mutual: boolean;
    establishedAt: string;
  };
}> {
  const response = await authFetch(`${API_BASE}/trust/establish`, {
    method: 'POST',
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error_description || 'Failed to establish trust');
  }

  return response.json();
}

/**
 * Get trusted agents list
 */
export async function getTrustedAgents(): Promise<
  Array<{
    did: string;
    name: string;
    type: string;
    trustLevel: TrustLevel;
    establishedAt: string;
    lastInteractionAt?: string;
  }>
> {
  const response = await authFetch(`${API_BASE}/trust/agents`);

  if (!response.ok) {
    throw new Error('Failed to get trusted agents');
  }

  const data = await response.json();
  return data.agents || [];
}

/**
 * Revoke trust for an agent
 */
export async function revokeTrust(agentDid: string, reason?: string): Promise<void> {
  const response = await authFetch(`${API_BASE}/trust/agents/${encodeURIComponent(agentDid)}`, {
    method: 'DELETE',
    body: JSON.stringify({ reason }),
  });

  if (!response.ok) {
    throw new Error('Failed to revoke trust');
  }
}

// ============================================
// Verification
// ============================================

/**
 * Verify an agent's identity and credentials
 */
export async function verifyAgent(agentDid: string): Promise<VerificationResult> {
  const response = await authFetch(`${API_BASE}/verify/agent`, {
    method: 'POST',
    body: JSON.stringify({ agentDid }),
  });

  if (!response.ok) {
    throw new Error('Verification failed');
  }

  return response.json();
}

/**
 * Verify an agent can perform a specific action
 */
export async function verifyAgentCapability(
  agentDid: string,
  action: string,
  resource: string
): Promise<{
  allowed: boolean;
  reason?: string;
  delegationChain?: string[];
}> {
  const response = await authFetch(`${API_BASE}/verify/capability`, {
    method: 'POST',
    body: JSON.stringify({ agentDid, action, resource }),
  });

  if (!response.ok) {
    throw new Error('Capability verification failed');
  }

  return response.json();
}

// ============================================
// Activity & Audit
// ============================================

/**
 * Get agent activity log
 */
export async function getAgentActivity(
  limit: number = 50,
  offset: number = 0
): Promise<{
  activities: AgentActivity[];
  total: number;
}> {
  const response = await authFetch(
    `${API_BASE}/agents/activity?limit=${limit}&offset=${offset}`
  );

  if (!response.ok) {
    throw new Error('Failed to get activity log');
  }

  return response.json();
}

/**
 * Log an agent action (for audit trail)
 */
export async function logAgentAction(
  action: string,
  resource?: string,
  details?: Record<string, unknown>
): Promise<void> {
  await authFetch(`${API_BASE}/agents/activity`, {
    method: 'POST',
    body: JSON.stringify({ action, resource, details }),
  });
}

// ============================================
// OpenID4VC Integration
// ============================================

/**
 * Create credential offer for agent credential
 */
export async function createAgentCredentialOffer(
  credentialType: 'AIAgentIdentityCredential' | 'DelegationCredential' | 'CapabilityCredential',
  agentData: Record<string, unknown>
): Promise<{
  credentialOfferUri: string;
  qrCodeData: string;
  expiresIn: number;
}> {
  const response = await authFetch(`${API_BASE}/openid4vci/credential-offer`, {
    method: 'POST',
    body: JSON.stringify({
      credentialTypes: [credentialType],
      agentData,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error_description || 'Failed to create credential offer');
  }

  return response.json();
}

/**
 * Accept a credential offer (for receiving credentials)
 */
export async function acceptCredentialOffer(credentialOfferUri: string): Promise<{
  credential: string;
  format: string;
}> {
  const response = await authFetch(`${API_BASE}/openid4vci/accept`, {
    method: 'POST',
    body: JSON.stringify({ credentialOfferUri }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error_description || 'Failed to accept credential offer');
  }

  return response.json();
}

// ============================================
// Utility Functions
// ============================================

/**
 * Parse and decode a JWT credential
 */
export function parseJwtCredential(jwt: string): {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
} | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;

    const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
    const payload = JSON.parse(
      decodeURIComponent(
        atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      )
    );

    return { header, payload, signature: parts[2] };
  } catch {
    return null;
  }
}

/**
 * Clear auth token (for logout)
 */
export function clearAuth(): void {
  authToken = null;
}
