/**
 * Push Notification Service Tests
 */

// Mock dependencies before imports
vi.mock('../../src/core/storage', () => {
  const mockStorage = {
    save: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
    exists: vi.fn(),
  }
  return {
    createStorageAdapter: vi.fn(() => mockStorage),
    __mockStorage: mockStorage,
  }
})

vi.mock('../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock global fetch
const mockFetch = vi.fn()
global.fetch = mockFetch as any

import {
  registerPushToken,
  removePushToken,
  sendPushNotification,
  broadcastPushNotification,
} from '../../src/services/push-notification.service'
import { createStorageAdapter } from '../../src/core/storage'

// Get the mock storage instance
const mockStorage = ((await import('../../src/core/storage')) as any).__mockStorage

describe('PushNotificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
  })

  describe('registerPushToken', () => {
    it('should save token to storage with correct key and data', async () => {
      await registerPushToken('holder-123', 'ExponentPushToken[abc123]', 'ios')

      expect(mockStorage.save).toHaveBeenCalledWith('holder-123', {
        token: 'ExponentPushToken[abc123]',
        platform: 'ios',
        registeredAt: expect.any(String),
      })
    })

    it('should save android token', async () => {
      await registerPushToken('holder-456', 'ExponentPushToken[xyz789]', 'android')

      expect(mockStorage.save).toHaveBeenCalledWith('holder-456', expect.objectContaining({
        token: 'ExponentPushToken[xyz789]',
        platform: 'android',
      }))
    })

    it('should overwrite existing token for same holder', async () => {
      await registerPushToken('holder-123', 'ExponentPushToken[old]', 'ios')
      await registerPushToken('holder-123', 'ExponentPushToken[new]', 'ios')

      expect(mockStorage.save).toHaveBeenCalledTimes(2)
      expect(mockStorage.save).toHaveBeenLastCalledWith('holder-123', expect.objectContaining({
        token: 'ExponentPushToken[new]',
      }))
    })

    it('should log registration info', async () => {
      const { logger } = await import('../../src/utils/logger') as any

      await registerPushToken('holder-789', 'ExponentPushToken[test]', 'ios')

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Push token registered for holder holder-789')
      )
    })

    it('should include ISO timestamp in registeredAt', async () => {
      const before = new Date().toISOString()
      await registerPushToken('holder-ts', 'token', 'ios')
      const after = new Date().toISOString()

      const savedData = mockStorage.save.mock.calls[0][1]
      expect(savedData.registeredAt >= before).toBe(true)
      expect(savedData.registeredAt <= after).toBe(true)
    })
  })

  describe('removePushToken', () => {
    it('should delete token from storage by holder ID', async () => {
      await removePushToken('holder-123')

      expect(mockStorage.delete).toHaveBeenCalledWith('holder-123')
    })

    it('should not throw if holder has no registered token', async () => {
      mockStorage.delete.mockResolvedValue(false)

      await expect(removePushToken('nonexistent')).resolves.toBeUndefined()
    })
  })

  describe('sendPushNotification', () => {
    const holderId = 'holder-push-1'
    const mockToken: any = {
      token: 'ExponentPushToken[send123]',
      platform: 'ios',
      registeredAt: '2026-03-12T00:00:00Z',
    }

    it('should return false if holder has no registered token', async () => {
      mockStorage.get.mockResolvedValue(null)

      const result = await sendPushNotification(holderId, 'Title', 'Body')

      expect(result).toBe(false)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should send push notification via Expo Push API', async () => {
      mockStorage.get.mockResolvedValue(mockToken)
      mockFetch.mockResolvedValue({ ok: true })

      const result = await sendPushNotification(holderId, 'Credential Revoked', 'Your credential has been revoked')

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://exp.host/--/api/v2/push/send',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: expect.any(String),
        })
      )

      // Verify body content
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.to).toBe('ExponentPushToken[send123]')
      expect(body.title).toBe('Credential Revoked')
      expect(body.body).toBe('Your credential has been revoked')
      expect(body.sound).toBe('default')
      expect(body.channelId).toBe('revocation')
    })

    it('should include data payload in push notification', async () => {
      mockStorage.get.mockResolvedValue(mockToken)
      mockFetch.mockResolvedValue({ ok: true })

      const data = { credentialId: 'cred-123', action: 'revoked' }
      await sendPushNotification(holderId, 'Alert', 'Message', data)

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.data).toEqual(data)
    })

    it('should send empty data object when no data provided', async () => {
      mockStorage.get.mockResolvedValue(mockToken)
      mockFetch.mockResolvedValue({ ok: true })

      await sendPushNotification(holderId, 'Title', 'Body')

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.data).toEqual({})
    })

    it('should return false when Expo API returns non-OK response', async () => {
      mockStorage.get.mockResolvedValue(mockToken)
      mockFetch.mockResolvedValue({ ok: false, statusText: 'Bad Request' })

      const result = await sendPushNotification(holderId, 'Title', 'Body')

      expect(result).toBe(false)
    })

    it('should return false and log error when fetch throws (silent failure)', async () => {
      const { logger } = await import('../../src/utils/logger') as any
      mockStorage.get.mockResolvedValue(mockToken)
      mockFetch.mockRejectedValue(new Error('Network error'))

      const result = await sendPushNotification(holderId, 'Title', 'Body')

      expect(result).toBe(false)
      expect(logger.error).toHaveBeenCalledWith(
        'Push notification error:',
        expect.any(Error)
      )
    })

    it('should not crash when push service is unavailable (DNS failure)', async () => {
      mockStorage.get.mockResolvedValue(mockToken)
      mockFetch.mockRejectedValue(new Error('getaddrinfo ENOTFOUND exp.host'))

      const result = await sendPushNotification(holderId, 'Title', 'Body')

      expect(result).toBe(false)
      // Should not throw, just return false
    })

    it('should not crash on timeout', async () => {
      mockStorage.get.mockResolvedValue(mockToken)
      mockFetch.mockRejectedValue(new Error('AbortError: The operation was aborted'))

      const result = await sendPushNotification(holderId, 'Title', 'Body')

      expect(result).toBe(false)
    })
  })

  describe('broadcastPushNotification', () => {
    it('should send to all registered tokens and return count of successful sends', async () => {
      mockStorage.list.mockResolvedValue([
        { token: 'ExponentPushToken[a]', platform: 'ios', registeredAt: '2026-03-12T00:00:00Z' },
        { token: 'ExponentPushToken[b]', platform: 'android', registeredAt: '2026-03-12T00:00:00Z' },
        { token: 'ExponentPushToken[c]', platform: 'ios', registeredAt: '2026-03-12T00:00:00Z' },
      ])
      mockFetch.mockResolvedValue({ ok: true })

      const result = await broadcastPushNotification('System Alert', 'Important update')

      expect(result).toBe(3)
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it('should count only successful sends', async () => {
      mockStorage.list.mockResolvedValue([
        { token: 'ExponentPushToken[a]', platform: 'ios', registeredAt: '2026-03-12T00:00:00Z' },
        { token: 'ExponentPushToken[b]', platform: 'android', registeredAt: '2026-03-12T00:00:00Z' },
      ])
      mockFetch
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: false, statusText: 'Invalid token' })

      const result = await broadcastPushNotification('Alert', 'Message')

      expect(result).toBe(1)
    })

    it('should return 0 when no tokens registered', async () => {
      mockStorage.list.mockResolvedValue([])

      const result = await broadcastPushNotification('Alert', 'Message')

      expect(result).toBe(0)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should continue sending even if one token fails', async () => {
      mockStorage.list.mockResolvedValue([
        { token: 'ExponentPushToken[fail]', platform: 'ios', registeredAt: '2026-03-12T00:00:00Z' },
        { token: 'ExponentPushToken[ok]', platform: 'ios', registeredAt: '2026-03-12T00:00:00Z' },
      ])
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ ok: true })

      const result = await broadcastPushNotification('Alert', 'Message')

      expect(result).toBe(1)
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('should include data payload in broadcast', async () => {
      mockStorage.list.mockResolvedValue([
        { token: 'ExponentPushToken[a]', platform: 'ios', registeredAt: '2026-03-12T00:00:00Z' },
      ])
      mockFetch.mockResolvedValue({ ok: true })

      const data = { type: 'system_update', version: '2.0' }
      await broadcastPushNotification('Update', 'New version available', data)

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.data).toEqual(data)
    })
  })

  describe('Storage adapter initialization', () => {
    it('should use storage adapter for token persistence', async () => {
      // Trigger lazy storage initialization by calling a function
      await registerPushToken('did:key:z6Mk123', 'token-123', 'ios')
      // Verify the save was called with correct arguments
      expect(mockStorage.save).toHaveBeenCalledWith('did:key:z6Mk123', expect.objectContaining({
        token: 'token-123',
        platform: 'ios',
      }))
    })
  })

  describe('Silent failure — no crash when push not configured', () => {
    it('should handle storage.get returning null gracefully', async () => {
      mockStorage.get.mockResolvedValue(null)

      // Should not throw
      const result = await sendPushNotification('unknown-holder', 'Title', 'Body')
      expect(result).toBe(false)
    })

    it('should handle storage.list returning empty array', async () => {
      mockStorage.list.mockResolvedValue([])

      const result = await broadcastPushNotification('Title', 'Body')
      expect(result).toBe(0)
    })

    it('should handle storage.save rejection gracefully', async () => {
      mockStorage.save.mockRejectedValue(new Error('DB connection failed'))

      await expect(
        registerPushToken('holder-err', 'token', 'ios')
      ).rejects.toThrow('DB connection failed')
      // Note: storage errors propagate (caller should handle), but push send errors are swallowed
    })
  })
})
