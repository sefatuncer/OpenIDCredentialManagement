import type { HttpClient } from '../http'
import type {
  DIDInfo,
  IssuanceRequest,
  CredentialOffer,
  DelegationIssuanceRequest,
  CapabilityIssuanceRequest,
  TokenResponse,
  CredentialResponse,
  BatchJob,
} from '../types'

export class IssuerClient {
  constructor(private http: HttpClient) {}

  /** Get issuer DID */
  async getDid(): Promise<DIDInfo> {
    return this.http.get('/api/v1/issuer/did')
  }

  /** Issue an Agent Identity credential */
  async issueAgentIdentity(req: IssuanceRequest): Promise<CredentialOffer> {
    return this.http.post('/api/v1/issuer/credentials/agent-identity', req)
  }

  /** Issue a Delegation credential */
  async issueDelegation(req: DelegationIssuanceRequest): Promise<CredentialOffer> {
    return this.http.post('/api/v1/issuer/credentials/delegation', req)
  }

  /** Issue a Capability credential */
  async issueCapability(req: CapabilityIssuanceRequest): Promise<CredentialOffer> {
    return this.http.post('/api/v1/issuer/credentials/capability', req)
  }

  /** Issue credential using schema-based validation */
  async issueBySchema(schemaType: string, claims: Record<string, unknown>): Promise<CredentialOffer> {
    return this.http.post('/api/v1/issuer/credentials/schema-issue', { schemaType, claims })
  }

  /** Exchange pre-authorized code for access token */
  async exchangeToken(preAuthorizedCode: string): Promise<TokenResponse> {
    return this.http.post('/api/v1/issuer/token', {
      grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
      'pre-authorized_code': preAuthorizedCode,
    })
  }

  /** Claim credential with access token */
  async claimCredential(
    _accessToken: string,
    format: string = 'jwt_vc_json',
    credentialIdentifier: string = 'AIAgentIdentityCredential',
  ): Promise<CredentialResponse> {
    return this.http.post('/api/v1/issuer/credential', {
      format,
      credential_identifier: credentialIdentifier,
    })
  }

  /** Create batch issuance job */
  async createBatchJob(credentials: IssuanceRequest[]): Promise<BatchJob> {
    return this.http.post('/api/v1/issuer/credentials/batch', { credentials })
  }

  /** Get batch job status */
  async getBatchJobStatus(jobId: string): Promise<BatchJob> {
    return this.http.get(`/api/v1/issuer/credentials/batch/${jobId}`)
  }

  /** Get batch job results */
  async getBatchJobResults(jobId: string): Promise<unknown[]> {
    return this.http.get(`/api/v1/issuer/credentials/batch/${jobId}/results`)
  }
}
