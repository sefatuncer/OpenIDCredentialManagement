const API_BASE = '/api/v1'

interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

interface CredentialOffer {
  offerId: string
  credentialOffer: {
    credential_issuer: string
    credential_configuration_ids: string[]
    grants: {
      'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
        'pre-authorized_code': string
      }
    }
  }
  credentialOfferUri: string
  qrCodeData: string
}

interface Credential {
  id: string
  type: string[]
  issuer: string
  issuanceDate: string
  expirationDate?: string
  credentialSubject: Record<string, unknown>
  jwt?: string
  status: 'valid' | 'revoked' | 'expired'
}

let authToken: string | null = null

// Get credentials from environment or throw error
function getClientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = import.meta.env.VITE_CLIENT_ID
  const clientSecret = import.meta.env.VITE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('Client credentials not configured. Set VITE_CLIENT_ID and VITE_CLIENT_SECRET environment variables.')
  }

  return { clientId, clientSecret }
}

async function getAuthToken(): Promise<string> {
  if (authToken) return authToken

  const { clientId, clientSecret } = getClientCredentials()

  const response = await fetch('/api/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret }),
  })

  if (!response.ok) {
    throw new Error('Failed to get auth token. Check your credentials.')
  }

  const data: TokenResponse = await response.json()
  authToken = data.access_token
  return authToken
}

async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAuthToken()
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  })
}

export async function createCredentialOffer(
  credentialTypes: string[],
  agentData?: Record<string, unknown>
): Promise<CredentialOffer> {
  const response = await authFetch(`${API_BASE}/openid4vci/credential-offer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      credentialTypes,
      agentData,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error_description || 'Failed to create credential offer')
  }

  return response.json()
}

export async function getCredentialOffers(): Promise<{ offers: CredentialOffer[] }> {
  const response = await authFetch(`${API_BASE}/openid4vci/credential-offers`)
  if (!response.ok) {
    throw new Error('Failed to get credential offers')
  }
  return response.json()
}

export async function issueCredentialDirect(
  credentialType: string,
  subjectData: Record<string, unknown>
): Promise<{ credential: string; format: string }> {
  const response = await authFetch(`${API_BASE}/issuer/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: credentialType,
      subjectData,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error_description || error.detail || 'Failed to issue credential')
  }

  return response.json()
}

export async function getHolderCredentials(): Promise<Credential[]> {
  const response = await authFetch(`${API_BASE}/holder/credentials`)
  if (!response.ok) {
    return []
  }
  const data = await response.json()
  return data.credentials || []
}

export async function getIssuerMetadata(): Promise<Record<string, unknown>> {
  const response = await fetch('/.well-known/openid-credential-issuer')
  if (!response.ok) {
    throw new Error('Failed to get issuer metadata')
  }
  return response.json()
}

export async function verifyCredential(credential: string): Promise<{
  valid: boolean
  checks: { signature: boolean; expiration: boolean; revocation: boolean }
}> {
  const response = await authFetch(`${API_BASE}/verifier/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  })

  if (!response.ok) {
    throw new Error('Verification failed')
  }

  return response.json()
}

export function parseJwt(token: string): Record<string, unknown> | null {
  try {
    const base64Url = token.split('.')[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
    return JSON.parse(jsonPayload)
  } catch {
    return null
  }
}
