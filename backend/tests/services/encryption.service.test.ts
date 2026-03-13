jest.mock('../../src/core/storage', () => {
  const store = new Map<string, unknown>()
  return {
    createStorageAdapter: jest.fn(() => ({
      save: jest.fn(async (key: string, data: unknown) => { store.set(key, data) }),
      get: jest.fn(async (key: string) => store.get(key) ?? null),
      delete: jest.fn(async (key: string) => store.delete(key)),
      list: jest.fn(async () => Array.from(store.values())),
      query: jest.fn(async () => ({ data: Array.from(store.values()), total: store.size, hasMore: false })),
      count: jest.fn(async () => store.size),
      exists: jest.fn(async (key: string) => store.has(key)),
      update: jest.fn(async () => null),
      clear: jest.fn(async () => { store.clear() }),
      getAdapterType: jest.fn(() => 'memory'),
    })),
  }
})

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

// Set a test encryption key (32 bytes hex = 64 chars)
process.env.ENCRYPTION_KEY = 'a'.repeat(64)

import { encryptionService, encrypt, decrypt, encryptObject, decryptObject } from '../../src/services/encryption.service'

describe('EncryptionService', () => {
  beforeAll(async () => {
    await encryptionService.initialize()
  })

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt a string', () => {
      const plaintext = 'Hello, World!'
      const encrypted = encryptionService.encrypt(plaintext)

      expect(encrypted).toHaveProperty('ciphertext')
      expect(encrypted).toHaveProperty('iv')
      expect(encrypted).toHaveProperty('authTag')
      expect(encrypted.ciphertext).not.toBe(plaintext)

      const decrypted = encryptionService.decryptToString(encrypted)
      expect(decrypted).toBe(plaintext)
    })

    it('should encrypt and decrypt UTF-8 content', () => {
      const plaintext = 'Merhaba Dünya! 你好世界 🌍'
      const encrypted = encryptionService.encrypt(plaintext)
      const decrypted = encryptionService.decryptToString(encrypted)
      expect(decrypted).toBe(plaintext)
    })

    it('should produce different ciphertext for same plaintext (random IV)', () => {
      const encrypted1 = encryptionService.encrypt('Same text')
      const encrypted2 = encryptionService.encrypt('Same text')
      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext)
      expect(encrypted1.iv).not.toBe(encrypted2.iv)
    })

    it('should fail decryption with tampered ciphertext', () => {
      const encrypted = encryptionService.encrypt('Secure data')
      encrypted.ciphertext = 'tampered' + encrypted.ciphertext.slice(8)
      expect(() => encryptionService.decryptToString(encrypted)).toThrow()
    })

    it('should fail decryption with wrong auth tag', () => {
      const encrypted = encryptionService.encrypt('Secure data')
      const tamperedTag = Buffer.from(encrypted.authTag, 'base64')
      tamperedTag[0] ^= 0xff
      encrypted.authTag = tamperedTag.toString('base64')
      expect(() => encryptionService.decryptToString(encrypted)).toThrow()
    })
  })

  describe('encryptObject/decryptObject', () => {
    it('should encrypt and decrypt JSON objects', () => {
      const obj = { name: 'Test Agent', capabilities: ['read', 'write'] }
      const encrypted = encryptionService.encryptObject(obj)
      const decrypted = encryptionService.decryptObject<typeof obj>(encrypted)
      expect(decrypted).toEqual(obj)
    })

    it('should handle nested objects', () => {
      const obj = { level1: { level2: { level3: { value: 'deep' } } } }
      const encrypted = encryptionService.encryptObject(obj)
      expect(encryptionService.decryptObject(encrypted)).toEqual(obj)
    })

    it('should handle arrays', () => {
      const arr = [1, 2, 3, { nested: true }]
      const encrypted = encryptionService.encryptObject(arr)
      expect(encryptionService.decryptObject(encrypted)).toEqual(arr)
    })
  })

  describe('password-based encryption', () => {
    it('should encrypt and decrypt with password', () => {
      const encrypted = encryptionService.encryptWithPassword('Secret message', 'strong-password-123')
      expect(encrypted).toHaveProperty('salt')
      const decrypted = encryptionService.decryptWithPassword(encrypted, 'strong-password-123')
      expect(decrypted).toBe('Secret message')
    })

    it('should fail with wrong password', () => {
      const encrypted = encryptionService.encryptWithPassword('Secret', 'correct-password')
      expect(() => encryptionService.decryptWithPassword(encrypted, 'wrong-password')).toThrow()
    })

    it('should use different salts for same password', () => {
      const e1 = encryptionService.encryptWithPassword('Same text', 'same-password')
      const e2 = encryptionService.encryptWithPassword('Same text', 'same-password')
      expect(e1.salt).not.toBe(e2.salt)
    })
  })

  describe('hashing', () => {
    it('should produce consistent hash for same input', () => {
      const hash1 = encryptionService.hash('test data')
      const hash2 = encryptionService.hash('test data')
      expect(hash1).toBe(hash2)
      expect(hash1).toHaveLength(64)
    })

    it('should produce different hashes for different inputs', () => {
      expect(encryptionService.hash('data1')).not.toBe(encryptionService.hash('data2'))
    })
  })

  describe('HMAC', () => {
    it('should create and verify HMAC', () => {
      const hmac = encryptionService.hmac('Important message')
      expect(encryptionService.verifyHmac('Important message', hmac)).toBe(true)
    })

    it('should reject tampered data', () => {
      const hmac = encryptionService.hmac('Important message')
      expect(encryptionService.verifyHmac('Tampered message', hmac)).toBe(false)
    })

    it('should reject tampered HMAC', () => {
      const hmac = encryptionService.hmac('Important message')
      expect(encryptionService.verifyHmac('Important message', 'a' + hmac.slice(1))).toBe(false)
    })
  })

  describe('key management', () => {
    it('should generate valid encryption keys', () => {
      const key = encryptionService.generateKey()
      expect(key).toHaveLength(64)
      expect(/^[0-9a-f]+$/i.test(key)).toBe(true)
    })

    it('should report availability', () => {
      expect(encryptionService.isAvailable()).toBe(true)
    })

    it('should return key info', () => {
      const keyInfo = encryptionService.getActiveKeyInfo()
      expect(keyInfo).not.toBeNull()
      expect(keyInfo?.status).toBe('active')
      expect(keyInfo?.algorithm).toBe('aes-256-gcm')
    })
  })

  describe('convenience functions', () => {
    it('encrypt/decrypt should work', () => {
      const encrypted = encrypt('Quick test')
      expect(decrypt(encrypted)).toBe('Quick test')
    })

    it('encryptObject/decryptObject should work', () => {
      const obj = { test: true, value: 123 }
      expect(decryptObject(encryptObject(obj))).toEqual(obj)
    })
  })
})
