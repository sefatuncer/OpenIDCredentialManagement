/**
 * Base Agent - Jose tabanlı DID ve Credential yönetimi
 * Credo bağımlılığı olmadan çalışır
 */

import * as jose from 'jose'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '../utils/logger'
import { AgentConfig } from '../config/agent.config'

export type AgentRole = 'issuer' | 'verifier' | 'holder'

export interface KeyPair {
  privateKey: jose.KeyLike
  publicKey: jose.KeyLike
  publicJwk: jose.JWK
  did: string
  kid: string
}

export interface BaseAgentInstance {
  config: AgentConfig
  role: AgentRole
  keyPair: KeyPair
  getDid(): string
  getKid(): string
  shutdown(): Promise<void>
}

/**
 * Ed25519 anahtar çifti oluştur
 */
export async function generateKeyPair(): Promise<{ privateKey: jose.KeyLike; publicKey: jose.KeyLike }> {
  return await jose.generateKeyPair('EdDSA', { crv: 'Ed25519' })
}

/**
 * Public key'den did:key oluştur
 * did:key spec: https://w3c-ccg.github.io/did-method-key/
 */
export async function createDidKey(publicKey: jose.KeyLike): Promise<{ did: string; kid: string; publicJwk: jose.JWK }> {
  const publicJwk = await jose.exportJWK(publicKey)

  // Ed25519 için multicodec prefix: 0xed01
  // JWK'dan raw public key bytes al
  const xBytes = jose.base64url.decode(publicJwk.x!)

  // Multibase + multicodec encoding
  // 0xed = Ed25519 public key multicodec
  // 0x01 = multicodec varint continuation
  const multicodecBytes = new Uint8Array([0xed, 0x01, ...xBytes])

  // Base58btc multibase encoding (z prefix)
  const multibaseEncoded = base58btcEncode(multicodecBytes)

  const did = `did:key:z${multibaseEncoded}`
  const kid = `${did}#z${multibaseEncoded}`

  return { did, kid, publicJwk }
}

/**
 * Base58btc encoding (Bitcoin alphabet)
 */
function base58btcEncode(bytes: Uint8Array): string {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

  if (bytes.length === 0) return ''

  // Count leading zeros
  let zeros = 0
  while (zeros < bytes.length && bytes[zeros] === 0) {
    zeros++
  }

  // Convert to base58
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

  // Skip leading zeros in base58 result
  let i = size - length
  while (i < size && b58[i] === 0) {
    i++
  }

  // Build result
  let result = '1'.repeat(zeros)
  for (; i < size; i++) {
    result += ALPHABET[b58[i]]
  }

  return result
}

/**
 * JWT-VC oluştur ve imzala
 */
export async function createJwtVc(
  privateKey: jose.KeyLike,
  issuerDid: string,
  issuerKid: string,
  payload: {
    credentialSubject: Record<string, unknown>
    type: string[]
    issuanceDate?: string
    expirationDate?: string
  }
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)

  const vcPayload = {
    vc: {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: payload.type,
      credentialSubject: payload.credentialSubject,
    },
    iss: issuerDid,
    sub: payload.credentialSubject.id as string || issuerDid,
    iat: now,
    nbf: now,
    jti: `urn:uuid:${uuidv4()}`,
    ...(payload.expirationDate && { exp: Math.floor(new Date(payload.expirationDate).getTime() / 1000) }),
  }

  const jwt = await new jose.SignJWT(vcPayload)
    .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT', kid: issuerKid })
    .sign(privateKey)

  return jwt
}

/**
 * JWT-VC doğrula
 */
export async function verifyJwtVc(
  jwt: string,
  publicKey: jose.KeyLike
): Promise<{ verified: boolean; payload?: jose.JWTPayload; error?: string }> {
  try {
    const { payload } = await jose.jwtVerify(jwt, publicKey)
    return { verified: true, payload }
  } catch (error) {
    return { verified: false, error: (error as Error).message }
  }
}

/**
 * DID'den public key çöz (did:key için)
 */
export async function resolveDidKey(did: string): Promise<jose.KeyLike | null> {
  if (!did.startsWith('did:key:z')) {
    logger.warn(`Unsupported DID method: ${did}`)
    return null
  }

  try {
    // z prefix'ini kaldır ve base58btc decode et
    const multibaseEncoded = did.replace('did:key:z', '')
    const multicodecBytes = base58btcDecode(multibaseEncoded)

    // İlk 2 byte multicodec prefix (0xed01)
    const publicKeyBytes = multicodecBytes.slice(2)

    // JWK oluştur
    const publicJwk: jose.JWK = {
      kty: 'OKP',
      crv: 'Ed25519',
      x: jose.base64url.encode(publicKeyBytes),
    }

    return await jose.importJWK(publicJwk, 'EdDSA') as jose.KeyLike
  } catch (error) {
    logger.error(`Failed to resolve DID: ${did}`, { error })
    return null
  }
}

/**
 * Base58btc decoding
 */
function base58btcDecode(str: string): Uint8Array {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  const ALPHABET_MAP: Record<string, number> = {}
  for (let i = 0; i < ALPHABET.length; i++) {
    ALPHABET_MAP[ALPHABET[i]] = i
  }

  if (str.length === 0) return new Uint8Array(0)

  const bytes = [0]
  for (let i = 0; i < str.length; i++) {
    const value = ALPHABET_MAP[str[i]]
    if (value === undefined) {
      throw new Error(`Invalid base58 character: ${str[i]}`)
    }

    let carry = value
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58
      bytes[j] = carry & 0xff
      carry >>= 8
    }

    while (carry > 0) {
      bytes.push(carry & 0xff)
      carry >>= 8
    }
  }

  // Count leading '1's
  let zeros = 0
  while (zeros < str.length && str[zeros] === '1') {
    zeros++
  }

  const result = new Uint8Array(zeros + bytes.length)
  for (let i = 0; i < zeros; i++) {
    result[i] = 0
  }
  for (let i = 0; i < bytes.length; i++) {
    result[zeros + i] = bytes[bytes.length - 1 - i]
  }

  return result
}

/**
 * Base agent oluştur
 */
export async function createBaseAgent(
  config: AgentConfig,
  role: AgentRole
): Promise<BaseAgentInstance> {
  logger.info(`Creating ${role} agent: ${config.name}`)

  // Anahtar çifti oluştur
  const { privateKey, publicKey } = await generateKeyPair()
  const { did, kid, publicJwk } = await createDidKey(publicKey)

  const keyPair: KeyPair = {
    privateKey,
    publicKey,
    publicJwk,
    did,
    kid,
  }

  logger.info(`${role} agent initialized with DID: ${did}`)

  return {
    config,
    role,
    keyPair,
    getDid: () => did,
    getKid: () => kid,
    shutdown: async () => {
      logger.info(`${role} agent shutdown`)
    },
  }
}

export { AgentConfig }
