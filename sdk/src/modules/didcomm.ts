import type { HttpClient } from '../http'
import type { DIDCommInvitation, DIDCommConnection, DIDCommMessage } from '../types'

export class DIDCommClient {
  constructor(private http: HttpClient) {}

  /** Create an out-of-band invitation */
  async createInvitation(): Promise<DIDCommInvitation> {
    return this.http.post('/api/v1/didcomm/invitations', {})
  }

  /** Receive an invitation by URL */
  async receiveInvitation(invitationUrl: string): Promise<DIDCommConnection> {
    return this.http.post('/api/v1/didcomm/invitations/receive', { invitationUrl })
  }

  /** List connections */
  async listConnections(): Promise<DIDCommConnection[]> {
    return this.http.get('/api/v1/didcomm/connections')
  }

  /** Get connection by ID */
  async getConnection(connectionId: string): Promise<DIDCommConnection> {
    return this.http.get(`/api/v1/didcomm/connections/${connectionId}`)
  }

  /** Send a basic message */
  async sendMessage(connectionId: string, content: string): Promise<void> {
    await this.http.post('/api/v1/didcomm/messages', { connectionId, content })
  }

  /** Get messages for a connection */
  async getMessages(connectionId: string): Promise<DIDCommMessage[]> {
    return this.http.get(`/api/v1/didcomm/messages/${connectionId}`)
  }
}
