/**
 * Encryption Service for Data at Rest
 *
 * Provides AES-256-GCM encryption for sensitive data
 * Storage: PostgreSQL via IStorageAdapter (encryption_keys) — hybrid: DB persist + memory cache
 */

import * as crypto from 'crypto'
import { logger } from '../utils/logger'
import { createStorageAdapter, IStorageAdapter } from '../core/storage'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32 // 256 bits
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16
const SALT_LENGTH = 32

export interface EncryptedData {
  ciphertext: string
  iv: string
  authTag: string
  salt?: string
  keyId?: string
}

export interface KeyInfo {
  id: string
  createdAt: Date
  algorithm: string
  status: 'active' | 'rotated' | 'expired'
}

interface StoredKeyData {
  keyId: string
  keyBase64: string // Envelope-encrypted key material (or plaintext in dev mode)
  envelope?: { iv: string; authTag: string } // Present when envelope-encrypted
  info: {
    id: string
    createdAt: string // ISO string for JSONB
    algorithm: string
    status: 'active' | 'rotated' | 'expired'
  }
}

// Lazy storage initialization
let keyStorage: IStorageAdapter<StoredKeyData> | null = null

function getKeyStorage(): IStorageAdapter<StoredKeyData> {
  if (!keyStorage) {
    keyStorage = createStorageAdapter<StoredKeyData>('encryption_keys')
  }
  return keyStorage
}

/**
 * Derive a Key Encryption Key (KEK) from env var for envelope encryption.
 * Returns null in dev mode when no env key is set.
 */
function getKEK(): Buffer | null {
  const keyHex = process.env.ENCRYPTION_KEY
  const keyBase64 = process.env.ENCRYPTION_KEY_BASE64
  if (keyHex) return Buffer.from(keyHex, 'hex')
  if (keyBase64) return Buffer.from(keyBase64, 'base64')
  return null
}

function envelopeWrap(plainKey: Buffer, kek: Buffer): { ciphertext: string; iv: string; authTag: string } {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, kek, iv)
  const encrypted = Buffer.concat([cipher.update(plainKey), cipher.final()])
  return { ciphertext: encrypted.toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64') }
}

function envelopeUnwrap(wrapped: { ciphertext: string; iv: string; authTag: string }, kek: Buffer): Buffer {
  const decipher = crypto.createDecipheriv(ALGORITHM, kek, Buffer.from(wrapped.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(wrapped.authTag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(wrapped.ciphertext, 'base64')), decipher.final()])
}

class EncryptionService {
  private masterKey: Buffer | null = null
  private keyId: string = 'default'
  // Memory cache for sync encrypt/decrypt operations
  private keysCache: Map<string, { key: Buffer; info: KeyInfo }> = new Map()

  async initialize(): Promise<void> {
    const storage = getKeyStorage()

    const kek = getKEK()

    // Load existing keys from DB
    const storedKeys = await storage.list()
    if (storedKeys.length > 0) {
      for (const stored of storedKeys) {
        const key = stored.envelope && kek
          ? envelopeUnwrap({ ciphertext: stored.keyBase64, ...stored.envelope }, kek)
          : Buffer.from(stored.keyBase64, 'base64')
        const info: KeyInfo = {
          id: stored.info.id,
          createdAt: new Date(stored.info.createdAt),
          algorithm: stored.info.algorithm,
          status: stored.info.status,
        }
        this.keysCache.set(stored.keyId, { key, info })
        if (info.status === 'active') {
          this.masterKey = key
          this.keyId = stored.keyId
        }
      }
      logger.info(`Encryption service loaded ${storedKeys.length} key(s) from storage`)
      return
    }

    // No keys in DB — initialize from env or generate
    if (kek) {
      this.masterKey = kek
    } else if (process.env.NODE_ENV === 'development') {
      this.masterKey = crypto.randomBytes(KEY_LENGTH)
      logger.warn('Using auto-generated encryption key - NOT FOR PRODUCTION')
    }

    if (this.masterKey) {
      const info: KeyInfo = {
        id: this.keyId,
        createdAt: new Date(),
        algorithm: ALGORITHM,
        status: 'active',
      }
      this.keysCache.set(this.keyId, { key: this.masterKey, info })

      // Persist to DB with envelope encryption if KEK available
      await this.persistKey(this.keyId, this.masterKey, info)
      logger.info('Encryption service initialized and key persisted')
    }
  }

  private async persistKey(keyId: string, key: Buffer, info: KeyInfo): Promise<void> {
    const kek = getKEK()
    const storage = getKeyStorage()
    if (kek) {
      const wrapped = envelopeWrap(key, kek)
      await storage.save(keyId, {
        keyId,
        keyBase64: wrapped.ciphertext,
        envelope: { iv: wrapped.iv, authTag: wrapped.authTag },
        info: { id: info.id, createdAt: info.createdAt.toISOString(), algorithm: info.algorithm, status: info.status },
      })
    } else {
      await storage.save(keyId, {
        keyId,
        keyBase64: key.toString('base64'),
        info: { id: info.id, createdAt: info.createdAt.toISOString(), algorithm: info.algorithm, status: info.status },
      })
    }
  }

  /**
   * Encrypt data (sync — uses memory cache)
   */
  encrypt(plaintext: string | Buffer, keyId?: string): EncryptedData {
    const useKeyId = keyId || this.keyId
    const keyData = this.keysCache.get(useKeyId)

    if (!keyData) {
      throw new Error('Encryption key not configured')
    }

    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv(ALGORITHM, keyData.key, iv)

    const data = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()])
    const authTag = cipher.getAuthTag()

    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      keyId: useKeyId,
    }
  }

  /**
   * Decrypt data (sync — uses memory cache)
   */
  decrypt(encryptedData: EncryptedData): Buffer {
    const useKeyId = encryptedData.keyId || this.keyId
    const keyData = this.keysCache.get(useKeyId)

    if (!keyData) {
      throw new Error(`Encryption key not found: ${useKeyId}`)
    }

    const iv = Buffer.from(encryptedData.iv, 'base64')
    const authTag = Buffer.from(encryptedData.authTag, 'base64')
    const ciphertext = Buffer.from(encryptedData.ciphertext, 'base64')

    const decipher = crypto.createDecipheriv(ALGORITHM, keyData.key, iv)
    decipher.setAuthTag(authTag)

    return Buffer.concat([decipher.update(ciphertext), decipher.final()])
  }

  /**
   * Decrypt to string
   */
  decryptToString(encryptedData: EncryptedData): string {
    return this.decrypt(encryptedData).toString('utf8')
  }

  /**
   * Encrypt JSON object
   */
  encryptObject(obj: any, keyId?: string): EncryptedData {
    return this.encrypt(JSON.stringify(obj), keyId)
  }

  /**
   * Decrypt to JSON object
   */
  decryptObject<T = any>(encryptedData: EncryptedData): T {
    const json = this.decryptToString(encryptedData)
    return JSON.parse(json)
  }

  /**
   * Derive key from password
   */
  deriveKeyFromPassword(password: string, salt?: Buffer): { key: Buffer; salt: Buffer } {
    const useSalt = salt || crypto.randomBytes(SALT_LENGTH)
    const key = crypto.pbkdf2Sync(password, useSalt, 100000, KEY_LENGTH, 'sha256')
    return { key, salt: useSalt }
  }

  /**
   * Encrypt with password
   */
  encryptWithPassword(plaintext: string, password: string): EncryptedData & { salt: string } {
    const { key, salt } = this.deriveKeyFromPassword(password)

    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

    const encrypted = Buffer.concat([
      cipher.update(Buffer.from(plaintext, 'utf8')),
      cipher.final(),
    ])
    const authTag = cipher.getAuthTag()

    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      salt: salt.toString('base64'),
    }
  }

  /**
   * Decrypt with password
   */
  decryptWithPassword(encryptedData: EncryptedData & { salt: string }, password: string): string {
    const salt = Buffer.from(encryptedData.salt, 'base64')
    const { key } = this.deriveKeyFromPassword(password, salt)

    const iv = Buffer.from(encryptedData.iv, 'base64')
    const authTag = Buffer.from(encryptedData.authTag, 'base64')
    const ciphertext = Buffer.from(encryptedData.ciphertext, 'base64')

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  }

  /**
   * Generate a new encryption key
   */
  generateKey(): string {
    return crypto.randomBytes(KEY_LENGTH).toString('hex')
  }

  /**
   * Add a new key for rotation (async — persists to DB)
   */
  async addKey(keyId: string, keyHex: string): Promise<void> {
    const key = Buffer.from(keyHex, 'hex')
    if (key.length !== KEY_LENGTH) {
      throw new Error(`Invalid key length: expected ${KEY_LENGTH} bytes`)
    }

    const now = new Date()
    const info: KeyInfo = {
      id: keyId,
      createdAt: now,
      algorithm: ALGORITHM,
      status: 'active',
    }

    // Update memory cache
    this.keysCache.set(keyId, { key, info })

    // Mark old active keys as rotated
    for (const [id, data] of this.keysCache) {
      if (id !== keyId && data.info.status === 'active') {
        data.info.status = 'rotated'
        await this.persistKey(id, data.key, data.info)
      }
    }

    // Persist new key
    await this.persistKey(keyId, key, info)

    this.keyId = keyId
    this.masterKey = key
    logger.info(`New encryption key added: ${keyId}`)
  }

  /**
   * Get active key info (sync — uses memory cache)
   */
  getActiveKeyInfo(): KeyInfo | null {
    const keyData = this.keysCache.get(this.keyId)
    return keyData?.info || null
  }

  /**
   * Get all key info
   */
  getAllKeysInfo(): KeyInfo[] {
    return Array.from(this.keysCache.values()).map((k) => k.info)
  }

  /**
   * Hash data (one-way)
   */
  hash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex')
  }

  /**
   * Generate HMAC
   */
  hmac(data: string, secret?: string): string {
    const key = secret || this.masterKey?.toString('hex') || 'default-hmac-key'
    return crypto.createHmac('sha256', key).update(data).digest('hex')
  }

  /**
   * Verify HMAC
   */
  verifyHmac(data: string, expectedHmac: string, secret?: string): boolean {
    const computed = this.hmac(data, secret)
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(expectedHmac))
  }

  /**
   * Check if encryption is available
   */
  isAvailable(): boolean {
    return this.masterKey !== null
  }
}

export const encryptionService = new EncryptionService()

// Convenience functions (sync — use memory cache)
export const encrypt = (data: string) => encryptionService.encrypt(data)
export const decrypt = (data: EncryptedData) => encryptionService.decryptToString(data)
export const encryptObject = (obj: any) => encryptionService.encryptObject(obj)
export const decryptObject = <T>(data: EncryptedData) => encryptionService.decryptObject<T>(data)
