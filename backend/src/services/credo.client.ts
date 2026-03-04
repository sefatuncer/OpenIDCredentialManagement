import { logger } from '../utils/logger'

const CREDO_SERVICE_URL = process.env.CREDO_SERVICE_URL || 'http://localhost:4000'

interface CredoResponse<T = any> {
  success?: boolean
  error?: string
  [key: string]: any
}

async function credoFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${CREDO_SERVICE_URL}${endpoint}`

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    const data = await response.json() as CredoResponse<T>

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`)
    }

    return data as T
  } catch (error) {
    logger.error(`Credo service error: ${endpoint}`, { error: (error as Error).message })
    throw error
  }
}

// Health check
export async function checkCredoHealth(): Promise<boolean> {
  try {
    const result = await credoFetch<{ status: string }>('/health')
    return result.status === 'healthy'
  } catch {
    return false
  }
}

// Issuer endpoints
export async function getIssuerDid(): Promise<string> {
  const result = await credoFetch<{ did: string }>('/api/issuer/did')
  return result.did
}

export async function issueAgentIdentityCredential(data: {
  holderDid: string
  agentId: string
  agentType: string
  agentName: string
  capabilities?: string[]
  ownerDid: string
  trustLevel?: string
}): Promise<{ credentialOfferId: string; credentialOfferUri: string }> {
  return credoFetch('/api/issuer/credentials/agent-identity', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function issueDelegationCredential(data: {
  holderDid: string
  delegationId: string
  delegatorDid: string
  delegateDid: string
  scope: string[]
  validUntil: string
  constraints?: Record<string, any>
}): Promise<{ credentialOfferId: string; credentialOfferUri: string }> {
  return credoFetch('/api/issuer/credentials/delegation', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function issueCapabilityCredential(data: {
  holderDid: string
  capabilityId: string
  capabilityType: string
  resource: string
  actions: string[]
  conditions?: Record<string, any>
}): Promise<{ credentialOfferId: string; credentialOfferUri: string }> {
  return credoFetch('/api/issuer/credentials/capability', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

// Verifier endpoints
export async function getVerifierDid(): Promise<string> {
  const result = await credoFetch<{ did: string }>('/api/verifier/did')
  return result.did
}

export async function createVerificationRequest(type: 'agent-identity' | 'delegation' | 'combined'): Promise<{
  requestUri: string
  verificationSessionId: string
}> {
  return credoFetch(`/api/verifier/verify/${type}`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function createCustomVerificationRequest(presentationDefinition: any): Promise<{
  requestUri: string
  verificationSessionId: string
}> {
  return credoFetch('/api/verifier/verify/custom', {
    method: 'POST',
    body: JSON.stringify({ presentationDefinition }),
  })
}

export async function verifyPresentation(sessionId: string): Promise<{
  verified: boolean
  credentialSubject?: Record<string, any>
  issuerDid?: string
  errors?: string[]
}> {
  return credoFetch(`/api/verifier/sessions/${sessionId}/verify`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

// Holder endpoints
export async function getHolderDid(): Promise<string> {
  const result = await credoFetch<{ did: string }>('/api/holder/did')
  return result.did
}

export async function receiveCredentialOffer(credentialOfferUri: string): Promise<{
  credentialId: string
  credentialType: string
}> {
  return credoFetch('/api/holder/credentials/receive', {
    method: 'POST',
    body: JSON.stringify({ credentialOfferUri }),
  })
}

export async function presentCredential(
  authorizationRequestUri: string,
  credentialIds?: string[]
): Promise<{
  presentationSubmitted: boolean
  redirectUri?: string
}> {
  return credoFetch('/api/holder/credentials/present', {
    method: 'POST',
    body: JSON.stringify({ authorizationRequestUri, credentialIds }),
  })
}

export async function getStoredCredentials(): Promise<any[]> {
  const result = await credoFetch<{ credentials: any[] }>('/api/holder/credentials')
  return result.credentials
}

export async function deleteCredential(credentialId: string): Promise<void> {
  await credoFetch(`/api/holder/credentials/${credentialId}`, {
    method: 'DELETE',
  })
}

// Export as namespace
export const credoClient = {
  checkHealth: checkCredoHealth,
  issuer: {
    getDid: getIssuerDid,
    issueAgentIdentity: issueAgentIdentityCredential,
    issueDelegation: issueDelegationCredential,
    issueCapability: issueCapabilityCredential,
  },
  verifier: {
    getDid: getVerifierDid,
    createRequest: createVerificationRequest,
    createCustomRequest: createCustomVerificationRequest,
    verify: verifyPresentation,
  },
  holder: {
    getDid: getHolderDid,
    receiveOffer: receiveCredentialOffer,
    present: presentCredential,
    getCredentials: getStoredCredentials,
    deleteCredential: deleteCredential,
  },
}
