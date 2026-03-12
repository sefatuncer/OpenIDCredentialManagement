/**
 * Agent Service — React Native adapted
 * All agent-related API operations using shared apiService.
 */

import { apiService } from './api.service'
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
} from '../types/agent.types'

// --- Agent Identity ---

export async function registerAgent(request: AgentRegistrationRequest): Promise<AgentIdentity> {
  return apiService.post<AgentIdentity>('/agents/register', request)
}

export async function getAgentIdentity(did: string): Promise<AgentIdentity | null> {
  try {
    return await apiService.get<AgentIdentity>(`/agents/${encodeURIComponent(did)}`)
  } catch {
    return null
  }
}

export async function getWallet(agentDid: string): Promise<AgentWallet | null> {
  try {
    return await apiService.get<AgentWallet>(`/wallet/${encodeURIComponent(agentDid)}`)
  } catch {
    return null
  }
}

export async function updateAgentStatus(
  did: string,
  status: 'active' | 'suspended'
): Promise<AgentIdentity> {
  return apiService.patch<AgentIdentity>(`/agents/${encodeURIComponent(did)}`, { status })
}

// --- Credentials ---

export async function requestBasicCredential(
  agentDid: string,
  securityDomain?: string
): Promise<BasicAgentCredential> {
  return apiService.post<BasicAgentCredential>(
    `/wallet/${encodeURIComponent(agentDid)}/credentials/basic`,
    { securityDomain }
  )
}

export async function requestRichCredential(
  agentDid: string,
  roles: string[],
  capabilities: string[],
  attesters?: string[]
): Promise<RichAgentCredential> {
  return apiService.post<RichAgentCredential>(
    `/wallet/${encodeURIComponent(agentDid)}/credentials/rich`,
    { roles, capabilities, requestedAttesters: attesters }
  )
}

export async function getAgentCredentials(agentDid: string): Promise<{
  basic: BasicAgentCredential | null
  rich: RichAgentCredential[]
  delegations: DelegationGrant[]
}> {
  return apiService.get(`/wallet/${encodeURIComponent(agentDid)}/credentials`)
}

// --- Delegations ---

export async function createDelegation(request: DelegationRequest): Promise<DelegationGrant> {
  return apiService.post<DelegationGrant>('/delegations', request)
}

export async function getDelegations(): Promise<{
  given: DelegationGrant[]
  received: DelegationGrant[]
}> {
  return apiService.get('/delegations')
}

export async function revokeDelegation(delegationId: string, reason?: string): Promise<void> {
  await apiService.post(`/delegations/${delegationId}/revoke`, { reason })
}

// --- Trust ---

export async function establishTrust(request: TrustEstablishmentRequest): Promise<{
  success: boolean
  trustRelationship: {
    agentDid: string
    trustLevel: TrustLevel
    mutual: boolean
    establishedAt: string
  }
}> {
  return apiService.post('/trust/establish', request)
}

export async function getTrustedAgents(): Promise<
  Array<{
    did: string
    name: string
    type: string
    trustLevel: TrustLevel
    establishedAt: string
    lastInteractionAt?: string
  }>
> {
  const data = await apiService.get<{ agents: Array<Record<string, unknown>> }>('/trust/agents')
  return (data.agents || []) as Awaited<ReturnType<typeof getTrustedAgents>>
}

export async function revokeTrust(agentDid: string, reason?: string): Promise<void> {
  await apiService.delete(`/trust/agents/${encodeURIComponent(agentDid)}`)
}

// --- Verification ---

export async function verifyAgent(agentDid: string): Promise<VerificationResult> {
  return apiService.post<VerificationResult>('/verify/agent', { agentDid })
}

// --- Activity ---

export async function getAgentActivity(
  limit = 50,
  offset = 0
): Promise<{ activities: AgentActivity[]; total: number }> {
  return apiService.get(`/agents/activity?limit=${limit}&offset=${offset}`)
}

// --- OpenID4VC ---

export async function createAgentCredentialOffer(
  credentialType: 'AIAgentIdentityCredential' | 'DelegationCredential' | 'CapabilityCredential',
  agentData: Record<string, unknown>
): Promise<{ credentialOfferUri: string; qrCodeData: string; expiresIn: number }> {
  return apiService.post('/openid4vci/credential-offer', {
    credentialTypes: [credentialType],
    agentData,
  })
}

export async function acceptCredentialOffer(
  credentialOfferUri: string
): Promise<{ credential: string; format: string }> {
  return apiService.post('/openid4vci/accept', { credentialOfferUri })
}

export function parseJwtCredential(jwt: string): {
  header: Record<string, unknown>
  payload: Record<string, unknown>
  signature: string
} | null {
  try {
    const parts = jwt.split('.')
    if (parts.length !== 3) return null

    const decodeBase64 = (s: string) => {
      const base64 = s.replace(/-/g, '+').replace(/_/g, '/')
      return atob(base64)
    }

    const header = JSON.parse(decodeBase64(parts[0]))
    const payload = JSON.parse(decodeBase64(parts[1]))

    return { header, payload, signature: parts[2] }
  } catch {
    return null
  }
}
