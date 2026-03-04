import { loadConfig } from '../commands/config.commands'

class ApiClient {
  private baseUrl: string
  private apiKey?: string

  constructor() {
    const config = loadConfig()
    this.baseUrl = config.apiUrl
    this.apiKey = config.apiKey
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey
    }

    // Check for environment variable override
    const envApiKey = process.env.AI_IDENTITY_API_KEY
    if (envApiKey) {
      headers['X-API-Key'] = envApiKey
    }

    return headers
  }

  async get(path: string): Promise<any> {
    const url = `${this.baseUrl}${path}`
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
    })

    if (!response.ok) {
      const error = (await response.json().catch(() => ({ message: response.statusText }))) as { message?: string; detail?: string }
      throw new Error(error.message || error.detail || `HTTP ${response.status}`)
    }

    return response.json()
  }

  async post(path: string, body?: any): Promise<any> {
    const url = `${this.baseUrl}${path}`
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      const error = (await response.json().catch(() => ({ message: response.statusText }))) as { message?: string; detail?: string }
      throw new Error(error.message || error.detail || `HTTP ${response.status}`)
    }

    return response.json()
  }

  async put(path: string, body?: any): Promise<any> {
    const url = `${this.baseUrl}${path}`
    const response = await fetch(url, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      const error = (await response.json().catch(() => ({ message: response.statusText }))) as { message?: string; detail?: string }
      throw new Error(error.message || error.detail || `HTTP ${response.status}`)
    }

    return response.json()
  }

  async delete(path: string): Promise<any> {
    const url = `${this.baseUrl}${path}`
    const response = await fetch(url, {
      method: 'DELETE',
      headers: this.getHeaders(),
    })

    if (!response.ok) {
      const error = (await response.json().catch(() => ({ message: response.statusText }))) as { message?: string; detail?: string }
      throw new Error(error.message || error.detail || `HTTP ${response.status}`)
    }

    // Return empty object for 204 No Content
    if (response.status === 204) {
      return {}
    }

    return response.json()
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url
  }

  setApiKey(key: string): void {
    this.apiKey = key
  }
}

export const apiClient = new ApiClient()
