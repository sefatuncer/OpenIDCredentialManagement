/**
 * Agent Identity SDK — Main Client
 *
 * Usage:
 *   const sdk = new AgentSDK({ baseUrl: 'http://localhost:3000', apiKey: 'my-key' })
 *   const offer = await sdk.issuer.issueAgentIdentity({ ... })
 */

import { HttpClient } from './http'
import { IssuerClient } from './modules/issuer'
import { VerifierClient } from './modules/verifier'
import { HolderClient } from './modules/holder'
import { DelegationClient } from './modules/delegation'
import { WebhookClient } from './modules/webhook'
import { DIDCommClient } from './modules/didcomm'
import { OAuthBridgeClient } from './modules/oauth'
import { AuditClient } from './modules/audit'
import type { SDKConfig } from './types'

export class AgentSDK {
  private http: HttpClient

  /** Credential issuance operations */
  readonly issuer: IssuerClient
  /** Credential verification operations */
  readonly verifier: VerifierClient
  /** Wallet/holder credential management */
  readonly holder: HolderClient
  /** Delegation chain management */
  readonly delegation: DelegationClient
  /** Webhook subscription management */
  readonly webhook: WebhookClient
  /** DIDComm agent-to-agent messaging */
  readonly didcomm: DIDCommClient
  /** OAuth 2.0 bridge (VC → token exchange) */
  readonly oauth: OAuthBridgeClient
  /** Audit log queries */
  readonly audit: AuditClient

  constructor(config: SDKConfig) {
    this.http = new HttpClient(config)
    this.issuer = new IssuerClient(this.http)
    this.verifier = new VerifierClient(this.http)
    this.holder = new HolderClient(this.http)
    this.delegation = new DelegationClient(this.http)
    this.webhook = new WebhookClient(this.http)
    this.didcomm = new DIDCommClient(this.http)
    this.oauth = new OAuthBridgeClient(this.http)
    this.audit = new AuditClient(this.http)
  }

  /** Update auth token (e.g., after JWT refresh) */
  setToken(token: string): void {
    this.http.setToken(token)
  }

  /** Set tenant ID for multi-tenant operations */
  setTenantId(tenantId: string): void {
    this.http.setTenantId(tenantId)
  }

  /** Health check */
  async health(): Promise<{ status: string }> {
    return this.http.get('/health')
  }
}
