import type { HttpClient } from '../http'
import type { Delegation, DelegationChain } from '../types'

export class DelegationClient {
  constructor(private http: HttpClient) {}

  /** Create a new delegation */
  async create(delegation: {
    delegateeDid: string
    scope: string[]
    expiresIn?: number
    parentDelegationId?: string
  }): Promise<Delegation> {
    return this.http.post('/api/v1/delegations', delegation)
  }

  /** List delegations */
  async list(filters?: { status?: string; delegatorDid?: string; delegateeDid?: string }): Promise<Delegation[]> {
    const params = new URLSearchParams()
    if (filters?.status) params.set('status', filters.status)
    if (filters?.delegatorDid) params.set('delegatorDid', filters.delegatorDid)
    if (filters?.delegateeDid) params.set('delegateeDid', filters.delegateeDid)
    const query = params.toString()
    return this.http.get(`/api/v1/delegations${query ? `?${query}` : ''}`)
  }

  /** Get delegation by ID */
  async get(delegationId: string): Promise<Delegation> {
    return this.http.get(`/api/v1/delegations/${delegationId}`)
  }

  /** Revoke a delegation */
  async revoke(delegationId: string): Promise<void> {
    await this.http.post(`/api/v1/delegations/${delegationId}/revoke`, {})
  }

  /** Get delegation chain for a given delegation */
  async getChain(delegationId: string): Promise<DelegationChain> {
    return this.http.get(`/api/v1/delegations/${delegationId}/chain`)
  }
}
