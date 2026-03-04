/**
 * Generic API Service
 * Provides base HTTP methods for API communication
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';
const SSI_BACKEND_URL = import.meta.env.VITE_SSI_BACKEND_URL || 'http://localhost:3000';

// Auth token management
let authToken: string | null = null;

// Get credentials from environment variables
function getClientCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = import.meta.env.VITE_CLIENT_ID || 'web-wallet';
  const clientSecret = import.meta.env.VITE_CLIENT_SECRET;

  if (!clientSecret) {
    console.error('VITE_CLIENT_SECRET environment variable is required');
    return null;
  }

  return { clientId, clientSecret };
}

async function getAuthToken(): Promise<string | null> {
  if (authToken) return authToken;

  const credentials = getClientCredentials();
  if (!credentials) {
    return null;
  }

  try {
    const response = await fetch(`${SSI_BACKEND_URL}/api/v1/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });

    if (!response.ok) {
      console.error('Authentication failed. Check your credentials.');
      return null;
    }

    const data = await response.json();
    authToken = data.access_token;
    return authToken;
  } catch (error) {
    console.error('Auth token request failed:', error);
    return null;
  }
}

class ApiService {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl;
  }

  private async getHeaders(): Promise<HeadersInit> {
    const token = await getAuthToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  private getFullUrl(endpoint: string): string {
    // If endpoint starts with http, use it as is
    if (endpoint.startsWith('http')) {
      return endpoint;
    }

    // Use backend URL for API calls
    const base = SSI_BACKEND_URL + '/api/v1';
    return `${base}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
  }

  async get<T>(endpoint: string): Promise<T> {
    const url = this.getFullUrl(endpoint);
    const headers = await this.getHeaders();

    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || error.error || 'Request failed');
    }

    return response.json();
  }

  async post<T>(endpoint: string, data: unknown): Promise<T> {
    const url = this.getFullUrl(endpoint);
    const headers = await this.getHeaders();

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || error.error || 'Request failed');
    }

    return response.json();
  }

  async put<T>(endpoint: string, data: unknown): Promise<T> {
    const url = this.getFullUrl(endpoint);
    const headers = await this.getHeaders();

    const response = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || error.error || 'Request failed');
    }

    return response.json();
  }

  async delete<T>(endpoint: string): Promise<T> {
    const url = this.getFullUrl(endpoint);
    const headers = await this.getHeaders();

    const response = await fetch(url, {
      method: 'DELETE',
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || error.error || 'Request failed');
    }

    return response.json();
  }

  async patch<T>(endpoint: string, data: unknown): Promise<T> {
    const url = this.getFullUrl(endpoint);
    const headers = await this.getHeaders();

    const response = await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || error.error || 'Request failed');
    }

    return response.json();
  }

  clearAuth(): void {
    authToken = null;
  }
}

export const apiService = new ApiService();
