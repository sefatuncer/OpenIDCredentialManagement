/**
 * @openid-credential/agent-sdk
 *
 * TypeScript SDK for AI Agent Identity — credential issuance,
 * verification, delegation, DIDComm, and OAuth bridge.
 *
 * @example
 * ```typescript
 * import { AgentSDK } from '@openid-credential/agent-sdk'
 *
 * const sdk = new AgentSDK({
 *   baseUrl: 'http://localhost:3000',
 *   apiKey: 'your-api-key',
 * })
 *
 * // Issue a credential
 * const offer = await sdk.issuer.issueAgentIdentity({
 *   holderDid: 'did:key:z6Mk...',
 *   agentType: 'autonomous',
 *   agentName: 'My Agent',
 *   ownerDid: 'did:key:z6Mk...',
 * })
 * ```
 */

// Main client
export { AgentSDK } from './client'

// HTTP utilities
export { HttpClient, SDKError } from './http'

// Module clients
export { IssuerClient } from './modules/issuer'
export { VerifierClient } from './modules/verifier'
export { HolderClient } from './modules/holder'
export { DelegationClient } from './modules/delegation'
export { WebhookClient } from './modules/webhook'
export { DIDCommClient } from './modules/didcomm'
export { OAuthBridgeClient } from './modules/oauth'
export { AuditClient } from './modules/audit'

// Types
export type {
  SDKConfig,
  DIDInfo,
  CredentialFormat,
  CredentialOffer,
  IssuanceRequest,
  DelegationIssuanceRequest,
  CapabilityIssuanceRequest,
  TokenResponse,
  CredentialResponse,
  StoredCredential,
  BatchJob,
  VerificationRequest,
  VerificationResult,
  PresentationRequest,
  Delegation,
  DelegationChain,
  WebhookSubscription,
  WebhookCreateRequest,
  DIDCommInvitation,
  DIDCommConnection,
  DIDCommMessage,
  TokenExchangeRequest,
  OAuthTokenResponse,
  AuditEntry,
  AuditQuery,
  PaginatedResponse,
} from './types'
