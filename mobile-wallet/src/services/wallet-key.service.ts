/**
 * Wallet Key Service — React Native adapted
 * Ed25519 key pair generation and DID:key derivation.
 * Private keys stored in Keychain (iOS) / Keystore (Android) via expo-secure-store.
 */

import * as jose from 'jose'
import { secureGet, secureSet, secureDelete } from './secure-storage.service'

const WALLET_KEY_STORAGE = 'wallet_keypair'

interface WalletKeyData {
  publicJwk: jose.JWK
  privateJwk: jose.JWK
  did: string
  kid: string
}

let cachedKeyData: WalletKeyData | null = null

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

  // Try loading from secure storage
  const stored = await secureGet(WALLET_KEY_STORAGE)
  if (stored) {
    try {
      cachedKeyData = JSON.parse(stored) as WalletKeyData
      return cachedKeyData
    } catch {
      // Corrupted — regenerate
    }
  }

  // Generate new key pair and store securely
  const keyData = await generateWalletKeyPair()
  await secureSet(WALLET_KEY_STORAGE, JSON.stringify(keyData))
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
    .sign(privateKey as Parameters<jose.SignJWT['sign']>[0])
}

export async function clearWalletKey(): Promise<void> {
  await secureDelete(WALLET_KEY_STORAGE)
  cachedKeyData = null
}
