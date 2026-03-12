/**
 * Wallet Key Service
 * Generates and manages Ed25519 key pairs for client-side VP signing.
 * Keys are encrypted with AES-GCM-256 before storing in sessionStorage.
 */

import * as jose from 'jose'

const WALLET_KEY_STORAGE_KEY = 'wallet_keypair_encrypted'
const WALLET_ENC_KEY_STORAGE = 'wallet_keypair_enckey'

interface WalletKeyData {
  publicJwk: jose.JWK
  privateJwk: jose.JWK
  did: string
  kid: string
}

let cachedKeyData: WalletKeyData | null = null

// --- Encryption helpers (same pattern as Credentials.tsx) ---

async function getEncryptionKey(): Promise<CryptoKey> {
  const stored = sessionStorage.getItem(WALLET_ENC_KEY_STORAGE)
  if (stored) {
    const keyData = JSON.parse(stored)
    return crypto.subtle.importKey(
      'jwk', keyData, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
    )
  }

  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
  )
  const exported = await crypto.subtle.exportKey('jwk', key)
  sessionStorage.setItem(WALLET_ENC_KEY_STORAGE, JSON.stringify(exported))
  return key
}

async function encryptData(data: string): Promise<string> {
  const key = await getEncryptionKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, new TextEncoder().encode(data)
  )
  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), iv.length)
  return btoa(String.fromCharCode(...combined))
}

async function decryptData(encryptedData: string): Promise<string> {
  const key = await getEncryptionKey()
  const combined = new Uint8Array(
    atob(encryptedData).split('').map(c => c.charCodeAt(0))
  )
  const iv = combined.slice(0, 12)
  const encrypted = combined.slice(12)
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv }, key, encrypted
  )
  return new TextDecoder().decode(decrypted)
}

// --- Base58btc encoding ---

function base58btcEncode(bytes: Uint8Array): string {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

  if (bytes.length === 0) return ''

  let zeros = 0
  while (zeros < bytes.length && bytes[zeros] === 0) {
    zeros++
  }

  const size = Math.ceil(bytes.length * 138 / 100) + 1
  const b58 = new Uint8Array(size)

  let length = 0
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i]
    let j = 0
    for (let k = size - 1; k >= 0 && (carry !== 0 || j < length); k--, j++) {
      carry += 256 * b58[k]
      b58[k] = carry % 58
      carry = Math.floor(carry / 58)
    }
    length = j
  }

  let i = size - length
  while (i < size && b58[i] === 0) {
    i++
  }

  let result = ALPHABET[0].repeat(zeros)
  for (; i < size; i++) {
    result += ALPHABET[b58[i]]
  }

  return result
}

// --- DID:key derivation ---

function deriveDidKey(publicJwk: jose.JWK): { did: string; kid: string } {
  const xBytes = jose.base64url.decode(publicJwk.x!)
  // Ed25519 multicodec prefix: 0xed01
  const multicodecBytes = new Uint8Array([0xed, 0x01, ...xBytes])
  const multibaseEncoded = base58btcEncode(multicodecBytes)

  const did = `did:key:z${multibaseEncoded}`
  const kid = `${did}#z${multibaseEncoded}`

  return { did, kid }
}

// --- Key management ---

async function generateWalletKeyPair(): Promise<WalletKeyData> {
  const { publicKey, privateKey } = await jose.generateKeyPair('EdDSA', { crv: 'Ed25519' })

  const publicJwk = await jose.exportJWK(publicKey)
  const privateJwk = await jose.exportJWK(privateKey)

  const { did, kid } = deriveDidKey(publicJwk)

  return { publicJwk, privateJwk, did, kid }
}

export async function getOrCreateWalletKey(): Promise<WalletKeyData> {
  if (cachedKeyData) return cachedKeyData

  // Try loading from encrypted sessionStorage
  const stored = sessionStorage.getItem(WALLET_KEY_STORAGE_KEY)
  if (stored) {
    try {
      const decrypted = await decryptData(stored)
      cachedKeyData = JSON.parse(decrypted) as WalletKeyData
      return cachedKeyData
    } catch {
      // Corrupted or new session — regenerate
    }
  }

  // Generate new key pair and store encrypted
  const keyData = await generateWalletKeyPair()
  const encrypted = await encryptData(JSON.stringify(keyData))
  sessionStorage.setItem(WALLET_KEY_STORAGE_KEY, encrypted)
  cachedKeyData = keyData

  return keyData
}

export async function getWalletDid(): Promise<string> {
  const keyData = await getOrCreateWalletKey()
  return keyData.did
}

export async function getWalletKid(): Promise<string> {
  const keyData = await getOrCreateWalletKey()
  return keyData.kid
}

export async function signJwt(
  payload: jose.JWTPayload,
  headerOverrides?: Partial<jose.JWTHeaderParameters>
): Promise<string> {
  const keyData = await getOrCreateWalletKey()
  const privateKey = await jose.importJWK(keyData.privateJwk, 'EdDSA')

  const header: jose.JWTHeaderParameters = {
    alg: 'EdDSA',
    typ: 'JWT',
    kid: keyData.kid,
    ...headerOverrides,
  }

  return new jose.SignJWT(payload)
    .setProtectedHeader(header)
    .sign(privateKey as CryptoKey)
}

export function clearWalletKey(): void {
  sessionStorage.removeItem(WALLET_KEY_STORAGE_KEY)
  sessionStorage.removeItem(WALLET_ENC_KEY_STORAGE)
  cachedKeyData = null
}
