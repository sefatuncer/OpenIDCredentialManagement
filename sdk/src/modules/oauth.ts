import type { HttpClient } from '../http'
import type { TokenExchangeRequest, OAuthTokenResponse } from '../types'

export class OAuthBridgeClient {
  constructor(private http: HttpClient) {}

  /** Exchange a Verifiable Credential for an OAuth token (RFC 8693) */
  async exchangeToken(req: TokenExchangeRequest): Promise<OAuthTokenResponse> {
    return this.http.post('/api/v1/oauth/token', req)
  }

  /** Get supported scope mappings */
  async getScopeMappings(): Promise<Record<string, string[]>> {
    return this.http.get('/api/v1/oauth/scopes')
  }
}
