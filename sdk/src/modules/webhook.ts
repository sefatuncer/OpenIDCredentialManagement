import type { HttpClient } from '../http'
import type { WebhookSubscription, WebhookCreateRequest } from '../types'

export class WebhookClient {
  constructor(private http: HttpClient) {}

  /** Create a webhook subscription */
  async create(req: WebhookCreateRequest): Promise<WebhookSubscription> {
    return this.http.post('/api/v1/webhooks', req)
  }

  /** List webhook subscriptions */
  async list(): Promise<WebhookSubscription[]> {
    return this.http.get('/api/v1/webhooks')
  }

  /** Get webhook subscription by ID */
  async get(webhookId: string): Promise<WebhookSubscription> {
    return this.http.get(`/api/v1/webhooks/${webhookId}`)
  }

  /** Update a webhook subscription */
  async update(webhookId: string, updates: Partial<WebhookCreateRequest>): Promise<WebhookSubscription> {
    return this.http.put(`/api/v1/webhooks/${webhookId}`, updates)
  }

  /** Delete a webhook subscription */
  async delete(webhookId: string): Promise<void> {
    await this.http.del(`/api/v1/webhooks/${webhookId}`)
  }
}
