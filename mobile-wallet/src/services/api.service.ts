/**
 * API Service — React Native adapted
 * Fetch-based HTTP client with token management via secure storage.
 */

import Constants from 'expo-constants'
import { secureGet, secureSet, secureDelete } from './secure-storage.service'

const extra = Constants.expoConfig?.extra ?? {}
const API_BASE_URL = extra.apiUrl || 'http://localhost:3000'

const AUTH_TOKEN_KEY = 'auth_token'

let cachedToken: string | null = null

function getClientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = extra.clientId || 'web-wallet'
  const clientSecret = extra.clientSecret || ''
  return { clientId, clientSecret }
}

async function getAuthToken(): Promise<string | null> {
  if (cachedToken) return cachedToken

  const stored = await secureGet(AUTH_TOKEN_KEY)
  if (stored) {
    cachedToken = stored
    return cachedToken
  }

  const { clientId, clientSecret } = getClientCredentials()
  if (!clientSecret) return null

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, clientSecret }),
    })

    if (!response.ok) return null

    const data = await response.json()
    cachedToken = data.access_token
    if (cachedToken) {
      await secureSet(AUTH_TOKEN_KEY, cachedToken)
    }
    return cachedToken
  } catch {
    return null
  }
}

async function getHeaders(): Promise<HeadersInit> {
  const token = await getAuthToken()
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

function getFullUrl(endpoint: string): string {
  if (endpoint.startsWith('http')) return endpoint
  return `${API_BASE_URL}/api/v1${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`
}

async function request<T>(method: string, endpoint: string, data?: unknown): Promise<T> {
  const url = getFullUrl(endpoint)
  const headers = await getHeaders()

  const options: RequestInit = { method, headers }
  if (data !== undefined) {
    options.body = JSON.stringify(data)
  }

  const response = await fetch(url, options)

  if (response.status === 401) {
    // Token expired — clear and retry once
    cachedToken = null
    await secureDelete(AUTH_TOKEN_KEY)
    const retryHeaders = await getHeaders()
    const retry = await fetch(url, { ...options, headers: retryHeaders })
    if (!retry.ok) {
      const err = await retry.json().catch(() => ({ message: retry.statusText }))
      throw new Error(err.message || err.error || 'Request failed')
    }
    return retry.json()
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: response.statusText }))
    throw new Error(err.message || err.error || 'Request failed')
  }

  return response.json()
}

class ApiService {
  async get<T>(endpoint: string): Promise<T> {
    return request<T>('GET', endpoint)
  }

  async post<T>(endpoint: string, data: unknown): Promise<T> {
    return request<T>('POST', endpoint, data)
  }

  async put<T>(endpoint: string, data: unknown): Promise<T> {
    return request<T>('PUT', endpoint, data)
  }

  async patch<T>(endpoint: string, data: unknown): Promise<T> {
    return request<T>('PATCH', endpoint, data)
  }

  async delete<T>(endpoint: string): Promise<T> {
    return request<T>('DELETE', endpoint)
  }

  async clearAuth(): Promise<void> {
    cachedToken = null
    await secureDelete(AUTH_TOKEN_KEY)
  }
}

export const apiService = new ApiService()

export const delegationApi = {
  async getChain(delegationId: string) {
    return apiService.get<{ chain: Array<Record<string, unknown>>; depth: number }>(
      `/delegations/${delegationId}/chain`
    )
  },
  async verify(delegationId: string, action: string, resource?: string) {
    return apiService.post<{ valid: boolean; inScope: boolean; errors?: string[] }>(
      `/delegations/${delegationId}/verify`,
      { action, resource }
    )
  },
}
