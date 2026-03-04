import { encryptionService, encrypt, decrypt, encryptObject, decryptObject } from '../../src/services/encryption.service'

describe('EncryptionService', () => {
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
      const plaintext = 'Same text'
      const encrypted1 = encryptionService.encrypt(plaintext)
      const encrypted2 = encryptionService.encrypt(plaintext)

      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext)
      expect(encrypted1.iv).not.toBe(encrypted2.iv)
    })

    it('should fail decryption with tampered ciphertext', () => {
      const plaintext = 'Secure data'
      const encrypted = encryptionService.encrypt(plaintext)

      // Tamper with ciphertext
      encrypted.ciphertext = 'tampered' + encrypted.ciphertext.slice(8)

      expect(() => {
        encryptionService.decryptToString(encrypted)
      }).toThrow()
    })

    it('should fail decryption with wrong auth tag', () => {
      const plaintext = 'Secure data'
      const encrypted = encryptionService.encrypt(plaintext)

      // Tamper with auth tag
      const tamperedTag = Buffer.from(encrypted.authTag, 'base64')
      tamperedTag[0] ^= 0xff
      encrypted.authTag = tamperedTag.toString('base64')

      expect(() => {
        encryptionService.decryptToString(encrypted)
      }).toThrow()
    })
  })

  describe('encryptObject/decryptObject', () => {
    it('should encrypt and decrypt JSON objects', () => {
      const obj = {
        name: 'Test Agent',
        capabilities: ['read', 'write'],
        metadata: { version: '1.0' },
      }

      const encrypted = encryptionService.encryptObject(obj)
      const decrypted = encryptionService.decryptObject<typeof obj>(encrypted)

      expect(decrypted).toEqual(obj)
    })

    it('should handle nested objects', () => {
      const obj = {
        level1: {
          level2: {
            level3: { value: 'deep' },
          },
        },
      }

      const encrypted = encryptionService.encryptObject(obj)
      const decrypted = encryptionService.decryptObject(encrypted)

      expect(decrypted).toEqual(obj)
    })

    it('should handle arrays', () => {
      const arr = [1, 2, 3, { nested: true }]
      const encrypted = encryptionService.encryptObject(arr)
      const decrypted = encryptionService.decryptObject(encrypted)

      expect(decrypted).toEqual(arr)
    })
  })

  describe('password-based encryption', () => {
    it('should encrypt and decrypt with password', () => {
      const plaintext = 'Secret message'
      const password = 'strong-password-123'

      const encrypted = encryptionService.encryptWithPassword(plaintext, password)

      expect(encrypted).toHaveProperty('salt')
      expect(encrypted.ciphertext).not.toBe(plaintext)

      const decrypted = encryptionService.decryptWithPassword(encrypted, password)
      expect(decrypted).toBe(plaintext)
    })

    it('should fail with wrong password', () => {
      const plaintext = 'Secret message'
      const encrypted = encryptionService.encryptWithPassword(plaintext, 'correct-password')

      expect(() => {
        encryptionService.decryptWithPassword(encrypted, 'wrong-password')
      }).toThrow()
    })

    it('should use different salts for same password', () => {
      const plaintext = 'Same text'
      const password = 'same-password'

      const encrypted1 = encryptionService.encryptWithPassword(plaintext, password)
      const encrypted2 = encryptionService.encryptWithPassword(plaintext, password)

      expect(encrypted1.salt).not.toBe(encrypted2.salt)
    })
  })

  describe('hashing', () => {
    it('should produce consistent hash for same input', () => {
      const data = 'test data'
      const hash1 = encryptionService.hash(data)
      const hash2 = encryptionService.hash(data)

      expect(hash1).toBe(hash2)
      expect(hash1).toHaveLength(64) // SHA-256 produces 64 hex characters
    })

    it('should produce different hashes for different inputs', () => {
      const hash1 = encryptionService.hash('data1')
      const hash2 = encryptionService.hash('data2')

      expect(hash1).not.toBe(hash2)
    })
  })

  describe('HMAC', () => {
    it('should create and verify HMAC', () => {
      const data = 'Important message'
      const hmac = encryptionService.hmac(data)

      expect(encryptionService.verifyHmac(data, hmac)).toBe(true)
    })

    it('should reject tampered data', () => {
      const data = 'Important message'
      const hmac = encryptionService.hmac(data)

      expect(encryptionService.verifyHmac('Tampered message', hmac)).toBe(false)
    })

    it('should reject tampered HMAC', () => {
      const data = 'Important message'
      const hmac = encryptionService.hmac(data)
      const tamperedHmac = 'a' + hmac.slice(1)

      expect(encryptionService.verifyHmac(data, tamperedHmac)).toBe(false)
    })
  })

  describe('key management', () => {
    it('should generate valid encryption keys', () => {
      const key = encryptionService.generateKey()

      expect(key).toHaveLength(64) // 32 bytes = 64 hex characters
      expect(/^[0-9a-f]+$/i.test(key)).toBe(true)
    })

    it('should report availability', () => {
      // In test environment, key should be auto-generated
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
      const plaintext = 'Quick test'
      const encrypted = encrypt(plaintext)
      const decrypted = decrypt(encrypted)

      expect(decrypted).toBe(plaintext)
    })

    it('encryptObject/decryptObject should work', () => {
      const obj = { test: true, value: 123 }
      const encrypted = encryptObject(obj)
      const decrypted = decryptObject(encrypted)

      expect(decrypted).toEqual(obj)
    })
  })
})
