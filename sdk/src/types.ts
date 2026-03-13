/**
 * Agent Identity SDK — Type Definitions
 */

// ─── Configuration ────────────────────────────────────────────────────────

export interface SDKConfig {
  /** Backend base URL (e.g., "http://localhost:3000") */
  baseUrl: string
  /** API key for authentication */
  apiKey?: string
  /** JWT token for authentication */
  token?: string
  /** Request timeout in ms (default: 30000) */
  timeout?: number
  /** Tenant ID for multi-tenant deployments */
  tenantId?: string
}

// ─── Common ───────────────────────────────────────────────────────────────

export interface DIDInfo {
  did: string
  didDocument?: Record<string, unknown>
}

export interface PaginatedResponse<T> {
  items: T[]
  total?: number
  page?: number
  limit?: number
}

// ─── Credentials ──────────────────────────────────────────────────────────

export type CredentialFormat = 'jwt_vc_json' | 'vc+sd-jwt'

export interface CredentialOffer {
  credentialOfferUri?: string
  credential_offer_uri?: string
  'pre-authorized_code'?: string
  preAuthorizedCode?: string
  grants?: Record<string, unknown>
}

export interface IssuanceRequest {
  holderDid: string
  agentType: 'autonomous' | 'semi-autonomous' | 'supervised'
  agentName: string
  ownerDid: string
  format?: CredentialFormat
  capabilities?: string[]
  trustLevel?: number
}

export interface DelegationIssuanceRequest {
  delegatorDid: string
  delegateeDid: string
  scope: string[]
  expiresIn?: number
  parentDelegationId?: string
}

export interface CapabilityIssuanceRequest {
  holderDid: string
  resourceType: string
  actions: string[]
  constraints?: Record<string, unknown>
}

export interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

export interface CredentialResponse {
  credential: string
  format: CredentialFormat
  c_nonce?: string
}

export interface StoredCredential {
  id: string
  type: string
  format: CredentialFormat
  credential: string
  issuedAt: string
  expiresAt?: string
  isSDJWT?: boolean
  claims?: Record<string, unknown>
}

export interface BatchJob {
  jobId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  total: number
  succeeded: number
  failed: number
}

// ─── Verification ─────────────────────────────────────────────────────────

export interface VerificationRequest {
  requestUri: string
  sessionId: string
}

export interface VerificationResult {
  status: 'pending' | 'completed' | 'expired' | 'failed'
  verified?: boolean
  claims?: Record<string, unknown>
  presentedCredentials?: unknown[]
}

export interface PresentationRequest {
  requestUri: string
  credentialId?: string
  disclosedClaims?: string[]
}

// ─── Delegation ───────────────────────────────────────────────────────────

export interface Delegation {
  id: string
  delegatorDid: string
  delegateeDid: string
  scope: string[]
  status: 'active' | 'revoked' | 'expired'
  parentDelegationId?: string
  credentialId?: string
  createdAt: string
  expiresAt?: string
}

export interface DelegationChain {
  chain: Delegation[]
  depth: number
}

// ─── Webhook ──────────────────────────────────────────────────────────────

export interface WebhookSubscription {
  id: string
  url: string
  events: string[]
  secret?: string
  status: 'active' | 'paused'
  createdAt: string
}

export interface WebhookCreateRequest {
  url: string
  events: string[]
  secret: string
}

// ─── DIDComm ──────────────────────────────────────────────────────────────

export interface DIDCommInvitation {
  invitationUrl: string
  outOfBandId: string
}

export interface DIDCommConnection {
  id: string
  state: string
  theirDid?: string
  createdAt: string
}

export interface DIDCommMessage {
  connectionId: string
  content: string
}

// ─── OAuth Bridge ─────────────────────────────────────────────────────────

export interface TokenExchangeRequest {
  subjectToken: string
  subjectTokenType: string
  scope?: string
}

export interface OAuthTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  scope?: string
}

// ─── Audit ────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string
  action: string
  actor: string
  resource: string
  timestamp: string
  details?: Record<string, unknown>
}

export interface AuditQuery {
  action?: string
  actor?: string
  resource?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
}
