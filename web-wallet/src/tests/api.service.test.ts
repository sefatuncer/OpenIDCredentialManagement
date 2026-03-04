/**
 * API Service Unit Tests
 * Tests for generic API service functionality
 * Production-ready: All tests use proper API mocking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apiService } from '../services/api.service'

// Save original fetch
const originalFetch = global.fetch

// Create a typed mock for fetch
const mockFetch = vi.fn()

describe('API Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = mockFetch
    // Clear cached auth token
    apiService.clearAuth()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  // Helper to mock auth token response
  function mockAuthToken() {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'test-token-123' }),
    })
  }

  // Helper to mock API response
  function mockApiResponse(data: unknown, options: { ok?: boolean; status?: number } = {}) {
    const { ok = true, status = 200 } = options
    mockFetch.mockResolvedValueOnce({
      ok,
      status,
      statusText: ok ? 'OK' : 'Error',
      json: async () => data,
    })
  }

  // Helper for full auth + API flow
  function mockAuthAndApiResponse(data: unknown, options: { ok?: boolean; status?: number } = {}) {
    mockAuthToken()
    mockApiResponse(data, options)
  }

  // ============================================
  // Authentication Tests
  // ============================================
  describe('Authentication', () => {
    it('should obtain auth token on first request', async () => {
      mockAuthAndApiResponse({ message: 'success' })

      await apiService.get('/test')

      // First call should be auth token request
      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(mockFetch.mock.calls[0][0]).toContain('/auth/token')
    })

    it('should reuse cached auth token', async () => {
      mockAuthAndApiResponse({ data: 'first' })

      await apiService.get('/first')

      // Second request should reuse token
      mockApiResponse({ data: 'second' })
      await apiService.get('/second')

      // Total: 1 auth + 2 API calls = 3
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it('should clear auth token when clearAuth is called', async () => {
      mockAuthAndApiResponse({ data: 'test' })
      await apiService.get('/test')

      apiService.clearAuth()

      // Next request should get new token
      mockAuthAndApiResponse({ data: 'test2' })
      await apiService.get('/test2')

      // Should have 2 auth requests total
      const authCalls = mockFetch.mock.calls.filter(
        call => (call[0] as string).includes('/auth/token')
      )
      expect(authCalls.length).toBe(2)
    })

    it('should handle auth failure gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'invalid_client' }),
      })

      // API call without token should still work
      mockApiResponse({ error: 'Unauthorized' }, { ok: false, status: 401 })

      await expect(apiService.get('/test')).rejects.toThrow()
    })
  })

  // ============================================
  // GET Requests
  // ============================================
  describe('GET Requests', () => {
    it('should make GET request with auth header', async () => {
      mockAuthAndApiResponse({ id: 1, name: 'Test' })

      const result = await apiService.get<{ id: number; name: string }>('/users/1')

      expect(result).toEqual({ id: 1, name: 'Test' })
      expect(mockFetch.mock.calls[1][1]).toMatchObject({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token-123',
        }),
      })
    })

    it('should handle GET error responses', async () => {
      mockAuthAndApiResponse(
        { message: 'Not found' },
        { ok: false, status: 404 }
      )

      await expect(apiService.get('/users/999')).rejects.toThrow('Not found')
    })

    it('should handle network errors', async () => {
      mockAuthToken()
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await expect(apiService.get('/test')).rejects.toThrow('Network error')
    })
  })

  // ============================================
  // POST Requests
  // ============================================
  describe('POST Requests', () => {
    it('should make POST request with JSON body', async () => {
      const requestData = { name: 'New User', email: 'test@example.com' }
      const responseData = { id: 1, ...requestData }

      mockAuthAndApiResponse(responseData)

      const result = await apiService.post('/users', requestData)

      expect(result).toEqual(responseData)
      expect(mockFetch.mock.calls[1][1]).toMatchObject({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(requestData),
      })
    })

    it('should handle POST error responses', async () => {
      mockAuthAndApiResponse(
        { error: 'Validation failed' },
        { ok: false, status: 400 }
      )

      await expect(
        apiService.post('/users', { invalid: 'data' })
      ).rejects.toThrow('Validation failed')
    })
  })

  // ============================================
  // PUT Requests
  // ============================================
  describe('PUT Requests', () => {
    it('should make PUT request with JSON body', async () => {
      const updateData = { name: 'Updated Name' }
      const responseData = { id: 1, ...updateData }

      mockAuthAndApiResponse(responseData)

      const result = await apiService.put('/users/1', updateData)

      expect(result).toEqual(responseData)
      expect(mockFetch.mock.calls[1][1]).toMatchObject({
        method: 'PUT',
        body: JSON.stringify(updateData),
      })
    })
  })

  // ============================================
  // DELETE Requests
  // ============================================
  describe('DELETE Requests', () => {
    it('should make DELETE request', async () => {
      mockAuthAndApiResponse({ success: true })

      const result = await apiService.delete('/users/1')

      expect(result).toEqual({ success: true })
      expect(mockFetch.mock.calls[1][1]).toMatchObject({
        method: 'DELETE',
      })
    })

    it('should handle DELETE error responses', async () => {
      mockAuthAndApiResponse(
        { message: 'Cannot delete' },
        { ok: false, status: 403 }
      )

      await expect(apiService.delete('/users/1')).rejects.toThrow('Cannot delete')
    })
  })

  // ============================================
  // PATCH Requests
  // ============================================
  describe('PATCH Requests', () => {
    it('should make PATCH request with partial data', async () => {
      const patchData = { status: 'active' }
      const responseData = { id: 1, name: 'User', status: 'active' }

      mockAuthAndApiResponse(responseData)

      const result = await apiService.patch('/users/1', patchData)

      expect(result).toEqual(responseData)
      expect(mockFetch.mock.calls[1][1]).toMatchObject({
        method: 'PATCH',
        body: JSON.stringify(patchData),
      })
    })
  })

  // ============================================
  // URL Handling
  // ============================================
  describe('URL Handling', () => {
    it('should construct full URL from endpoint', async () => {
      mockAuthAndApiResponse({ data: 'test' })

      await apiService.get('/test/endpoint')

      const apiUrl = mockFetch.mock.calls[1][0] as string
      expect(apiUrl).toContain('/api/v1/test/endpoint')
    })

    it('should handle endpoints without leading slash', async () => {
      mockAuthAndApiResponse({ data: 'test' })

      await apiService.get('test/endpoint')

      const apiUrl = mockFetch.mock.calls[1][0] as string
      expect(apiUrl).toContain('/api/v1/test/endpoint')
    })

    it('should use absolute URLs as-is', async () => {
      mockAuthAndApiResponse({ data: 'external' })

      await apiService.get('http://external.api/data')

      const apiUrl = mockFetch.mock.calls[1][0] as string
      expect(apiUrl).toBe('http://external.api/data')
    })
  })

  // ============================================
  // Error Handling
  // ============================================
  describe('Error Handling', () => {
    it('should extract error message from response', async () => {
      mockAuthAndApiResponse(
        { message: 'Detailed error message' },
        { ok: false, status: 400 }
      )

      await expect(apiService.get('/test')).rejects.toThrow('Detailed error message')
    })

    it('should extract error from error field', async () => {
      mockAuthAndApiResponse(
        { error: 'Error from error field' },
        { ok: false, status: 500 }
      )

      await expect(apiService.get('/test')).rejects.toThrow('Error from error field')
    })

    it('should fallback to status text on parse failure', async () => {
      mockAuthToken()
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => {
          throw new Error('Invalid JSON')
        },
      })

      await expect(apiService.get('/test')).rejects.toThrow('Internal Server Error')
    })

    it('should handle empty error response', async () => {
      mockAuthAndApiResponse({}, { ok: false, status: 400 })

      await expect(apiService.get('/test')).rejects.toThrow('Request failed')
    })
  })

  // ============================================
  // Content-Type Headers
  // ============================================
  describe('Headers', () => {
    it('should include Content-Type for POST requests', async () => {
      mockAuthAndApiResponse({ success: true })

      await apiService.post('/test', { data: 'test' })

      expect(mockFetch.mock.calls[1][1].headers).toMatchObject({
        'Content-Type': 'application/json',
      })
    })

    it('should include Authorization header when token exists', async () => {
      mockAuthAndApiResponse({ data: 'test' })

      await apiService.get('/test')

      expect(mockFetch.mock.calls[1][1].headers).toMatchObject({
        Authorization: 'Bearer test-token-123',
      })
    })
  })
})
