/**
 * HTTP Client — minimal fetch wrapper with auth and error handling.
 * Zero external dependencies (uses Node.js native fetch).
 */

import type { SDKConfig } from './types'

export class HttpClient {
  private baseUrl: string
  private headers: Record<string, string>
  private timeout: number

  constructor(config: SDKConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.timeout = config.timeout ?? 30000

    this.headers = { 'Content-Type': 'application/json' }
    if (config.apiKey) this.headers['X-API-Key'] = config.apiKey
    if (config.token) this.headers['Authorization'] = `Bearer ${config.token}`
    if (config.tenantId) this.headers['X-Tenant-ID'] = config.tenantId
  }

  /** Update auth token (e.g., after token refresh) */
  setToken(token: string): void {
    this.headers['Authorization'] = `Bearer ${token}`
  }

  /** Update tenant ID */
  setTenantId(tenantId: string): void {
    this.headers['X-Tenant-ID'] = tenantId
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path)
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body)
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, body)
  }

  async del<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path)
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeout)

    try {
      const res = await fetch(url, {
        method,
        headers: this.headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })

      if (!res.ok) {
        const errorBody = await res.text().catch(() => '')
        let detail = errorBody
        try {
          const parsed = JSON.parse(errorBody)
          detail = parsed.detail || parsed.message || parsed.error || errorBody
        } catch {
          // Keep raw text
        }
        throw new SDKError(res.status, detail, path)
      }

      const text = await res.text()
      if (!text) return {} as T
      return JSON.parse(text) as T
    } catch (err) {
      if (err instanceof SDKError) throw err
      if (err instanceof Error && err.name === 'AbortError') {
        throw new SDKError(0, `Request timeout (${this.timeout}ms)`, path)
      }
      throw new SDKError(0, String(err), path)
    } finally {
      clearTimeout(timer)
    }
  }
}

export class SDKError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
    public readonly path: string,
  ) {
    super(`SDK Error [${status}] ${path}: ${detail}`)
    this.name = 'SDKError'
  }
}
