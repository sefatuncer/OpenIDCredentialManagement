/**
 * Encryption Service for Data at Rest
 *
 * Provides AES-256-GCM encryption for sensitive data
 */

import * as crypto from 'crypto'
import { logger } from '../utils/logger'

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

class EncryptionService {
  private masterKey: Buffer | null = null
  private keyId: string = 'default'
  private keys: Map<string, { key: Buffer; info: KeyInfo }> = new Map()

  constructor() {
    this.initializeKey()
  }

  private initializeKey(): void {
    const keyHex = process.env.ENCRYPTION_KEY
    const keyBase64 = process.env.ENCRYPTION_KEY_BASE64

    if (keyHex) {
      this.masterKey = Buffer.from(keyHex, 'hex')
    } else if (keyBase64) {
      this.masterKey = Buffer.from(keyBase64, 'base64')
    } else if (process.env.NODE_ENV === 'development') {
      // Generate a development key (NOT for production)
      this.masterKey = crypto.randomBytes(KEY_LENGTH)
      logger.warn('Using auto-generated encryption key - NOT FOR PRODUCTION')
    }

    if (this.masterKey) {
      this.keys.set(this.keyId, {
        key: this.masterKey,
        info: {
          id: this.keyId,
          createdAt: new Date(),
          algorithm: ALGORITHM,
          status: 'active',
        },
      })
      logger.info('Encryption service initialized')
    }
  }

  /**
   * Encrypt data
   */
  encrypt(plaintext: string | Buffer, keyId?: string): EncryptedData {
    const useKeyId = keyId || this.keyId
    const keyData = this.keys.get(useKeyId)

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
   * Decrypt data
   */
  decrypt(encryptedData: EncryptedData): Buffer {
    const useKeyId = encryptedData.keyId || this.keyId
    const keyData = this.keys.get(useKeyId)

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
   * Add a new key for rotation
   */
  addKey(keyId: string, keyHex: string): void {
    const key = Buffer.from(keyHex, 'hex')
    if (key.length !== KEY_LENGTH) {
      throw new Error(`Invalid key length: expected ${KEY_LENGTH} bytes`)
    }

    this.keys.set(keyId, {
      key,
      info: {
        id: keyId,
        createdAt: new Date(),
        algorithm: ALGORITHM,
        status: 'active',
      },
    })

    // Mark old active key as rotated
    for (const [id, data] of this.keys) {
      if (id !== keyId && data.info.status === 'active') {
        data.info.status = 'rotated'
      }
    }

    this.keyId = keyId
    logger.info(`New encryption key added: ${keyId}`)
  }

  /**
   * Get active key info
   */
  getActiveKeyInfo(): KeyInfo | null {
    const keyData = this.keys.get(this.keyId)
    return keyData?.info || null
  }

  /**
   * Get all key info
   */
  getAllKeysInfo(): KeyInfo[] {
    return Array.from(this.keys.values()).map((k) => k.info)
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

// Convenience functions
export const encrypt = (data: string) => encryptionService.encrypt(data)
export const decrypt = (data: EncryptedData) => encryptionService.decryptToString(data)
export const encryptObject = (obj: any) => encryptionService.encryptObject(obj)
export const decryptObject = <T>(data: EncryptedData) => encryptionService.decryptObject<T>(data)
