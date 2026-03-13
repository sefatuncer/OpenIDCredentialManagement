import type { HttpClient } from '../http'
import type { AuditEntry, AuditQuery } from '../types'

export class AuditClient {
  constructor(private http: HttpClient) {}

  /** Query audit log entries */
  async query(filters?: AuditQuery): Promise<AuditEntry[]> {
    const params = new URLSearchParams()
    if (filters?.action) params.set('action', filters.action)
    if (filters?.actor) params.set('actor', filters.actor)
    if (filters?.resource) params.set('resource', filters.resource)
    if (filters?.from) params.set('from', filters.from)
    if (filters?.to) params.set('to', filters.to)
    if (filters?.limit) params.set('limit', String(filters.limit))
    if (filters?.offset) params.set('offset', String(filters.offset))
    const query = params.toString()
    return this.http.get(`/api/v1/audit${query ? `?${query}` : ''}`)
  }

  /** Get audit entry by ID */
  async get(entryId: string): Promise<AuditEntry> {
    return this.http.get(`/api/v1/audit/${entryId}`)
  }
}
