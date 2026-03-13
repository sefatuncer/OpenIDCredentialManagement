import type { HttpClient } from '../http'
import type { DIDInfo, StoredCredential, PresentationRequest } from '../types'

export class HolderClient {
  constructor(private http: HttpClient) {}

  /** Get holder DID */
  async getDid(): Promise<DIDInfo> {
    return this.http.get('/api/v1/holder/did')
  }

  /** Receive a credential from an offer URI */
  async receiveCredential(offerUri: string): Promise<StoredCredential> {
    return this.http.post('/api/v1/holder/credentials/receive', { credentialOfferUri: offerUri })
  }

  /** Present a credential in response to a verification request */
  async presentCredential(req: PresentationRequest): Promise<{ status: string }> {
    return this.http.post('/api/v1/holder/credentials/present', req)
  }

  /** List all stored credentials */
  async listCredentials(): Promise<StoredCredential[]> {
    return this.http.get('/api/v1/holder/credentials')
  }

  /** Delete a credential */
  async deleteCredential(credentialId: string): Promise<void> {
    await this.http.del(`/api/v1/holder/credentials/${credentialId}`)
  }

  /** Register push notification token (mobile wallet) */
  async registerPushToken(token: string, platform: 'ios' | 'android' | 'web'): Promise<void> {
    await this.http.post('/api/v1/holder/push-token', { token, platform })
  }
}
