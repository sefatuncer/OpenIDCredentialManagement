/**
 * SD-JWT (Selective Disclosure JWT) Service — Creation + Presentation
 *
 * Implements SD-JWT format for privacy-preserving credentials.
 * Based on: https://datatracker.ietf.org/doc/draft-ietf-oauth-selective-disclosure-jwt/
 *
 * Verification logic extracted to sdjwt-verification.service.ts.
 */

import * as crypto from 'crypto'
import * as jose from 'jose'
import { logger } from '../utils/logger'
import {
  verifySDJWTPresentation,
} from './sdjwt-verification.service'

// ==================== Types ====================

export type SDJWTClaimValue = string | number | boolean | null | SDJWTClaimValue[] | { [key: string]: SDJWTClaimValue }

export interface SDJWTClaims {
  [key: string]: SDJWTClaimValue
}

export interface Disclosure {
  salt: string
  claimName: string
  claimValue: SDJWTClaimValue
  encoded: string
  digest: string
}

export interface VCPayload {
  '@context'?: string[]
  type?: string[]
  credentialSubject?: Record<string, SDJWTClaimValue>
  credentialStatus?: { id: string; type: string; statusListIndex: string; statusListCredential: string }
  [key: string]: SDJWTClaimValue | undefined
}

export interface SDJWTPayload {
  iss: string
  iat: number
  exp?: number
  nbf?: number
  sub?: string
  vc?: VCPayload
  _sd?: string[]
  _sd_alg?: string
  [key: string]: SDJWTClaimValue | VCPayload | string[] | undefined
}

export interface SDJWTCredential {
  jwt: string
  disclosures: Disclosure[]
  combined: string // jwt~disclosure1~disclosure2~...
}

export interface SDJWTPresentation {
  jwt: string
  disclosures: Disclosure[]
  keyBindingJwt?: string
  combined: string
}

export interface VerificationResult {
  verified: boolean
  claims: SDJWTClaims
  disclosedClaims: string[]
  hiddenClaims: string[]
  issuer: string
  subject?: string
  issuedAt: Date
  expiresAt?: Date
  error?: string
}

// ==================== Constants ====================

const SD_ALG = 'sha-256'
const DISCLOSURE_SEPARATOR = '~'

// ==================== Service Class ====================

class SDJWTService {
  private hashAlgorithm: string = 'sha256'

  /**
   * Create an SD-JWT credential with selective disclosure
   */
  async createSDJWTCredential(
    issuerDid: string,
    subjectDid: string,
    claims: SDJWTClaims,
    selectiveDisclosureClaims: string[],
    options: {
      expiresIn?: number
      privateKey?: jose.KeyLike
    } = {}
  ): Promise<SDJWTCredential> {
    logger.info('Creating SD-JWT credential', { issuer: issuerDid, subject: subjectDid })

    const disclosures: Disclosure[] = []
    const sdDigests: string[] = []
    const plainClaims: SDJWTClaims = {}

    for (const [key, value] of Object.entries(claims)) {
      if (selectiveDisclosureClaims.includes(key)) {
        const disclosure = this.createDisclosure(key, value)
        disclosures.push(disclosure)
        sdDigests.push(disclosure.digest)
      } else {
        plainClaims[key] = value
      }
    }

    const now = Math.floor(Date.now() / 1000)
    const payload: SDJWTPayload = {
      iss: issuerDid,
      sub: subjectDid,
      iat: now,
      ...plainClaims,
      _sd: sdDigests,
      _sd_alg: SD_ALG,
    }

    if (options.expiresIn) {
      payload.exp = now + options.expiresIn
    }

    let jwt: string
    if (options.privateKey) {
      jwt = await this.createJWTAsync(payload, options.privateKey)
      logger.info('SD-JWT signed with EdDSA')
    } else {
      jwt = this.createJWT(payload)
      logger.warn('SD-JWT created without proper private key - signature not cryptographically valid')
    }

    const disclosureStrings = disclosures.map((d) => d.encoded)
    const combined = [jwt, ...disclosureStrings].join(DISCLOSURE_SEPARATOR)

    return { jwt, disclosures, combined }
  }

  /**
   * Create an SD-JWT VC (Verifiable Credential)
   */
  async createSDJWTVC(
    issuerDid: string,
    subjectDid: string,
    credentialType: string,
    credentialSubject: SDJWTClaims,
    selectiveDisclosureClaims: string[],
    options: {
      expiresIn?: number
      credentialId?: string
      privateKey?: jose.KeyLike
    } = {}
  ): Promise<SDJWTCredential> {
    logger.info('Creating SD-JWT VC', { type: credentialType })

    const disclosures: Disclosure[] = []
    const sdDigests: string[] = []
    const plainSubject: SDJWTClaims = { id: subjectDid }

    for (const [key, value] of Object.entries(credentialSubject)) {
      if (key === 'id') continue

      if (selectiveDisclosureClaims.includes(key)) {
        const disclosure = this.createDisclosure(key, value)
        disclosures.push(disclosure)
        sdDigests.push(disclosure.digest)
      } else {
        plainSubject[key] = value
      }
    }

    const now = Math.floor(Date.now() / 1000)

    const payload: SDJWTPayload = {
      iss: issuerDid,
      sub: subjectDid,
      iat: now,
      vc: {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: ['VerifiableCredential', credentialType],
        credentialSubject: {
          ...plainSubject,
          _sd: sdDigests,
        },
      },
      _sd_alg: SD_ALG,
    }

    if (options.expiresIn) {
      payload.exp = now + options.expiresIn
    }

    if (options.credentialId && payload.vc) {
      payload.vc.id = options.credentialId
    }

    let jwt: string
    if (options.privateKey) {
      jwt = await this.createJWTAsync(payload, options.privateKey)
      logger.info('SD-JWT VC signed with EdDSA', { type: credentialType })
    } else {
      jwt = this.createJWT(payload)
      logger.warn('SD-JWT VC created without proper private key - signature not cryptographically valid')
    }

    const disclosureStrings = disclosures.map((d) => d.encoded)
    const combined = [jwt, ...disclosureStrings].join(DISCLOSURE_SEPARATOR)

    return { jwt, disclosures, combined }
  }

  /**
   * Create a presentation with selected disclosures
   */
  createPresentation(
    credential: SDJWTCredential,
    claimsToDisclose: string[],
    options: {
      audience?: string
      nonce?: string
      holderPrivateKey?: string
    } = {}
  ): SDJWTPresentation {
    logger.info('Creating SD-JWT presentation', { disclosing: claimsToDisclose })

    const selectedDisclosures = credential.disclosures.filter((d) =>
      claimsToDisclose.includes(d.claimName)
    )

    let keyBindingJwt: string | undefined
    if (options.holderPrivateKey && options.audience && options.nonce) {
      keyBindingJwt = this.createKeyBindingJWT(
        credential.jwt,
        selectedDisclosures,
        options.audience,
        options.nonce,
        options.holderPrivateKey
      )
    }

    const parts = [credential.jwt, ...selectedDisclosures.map((d) => d.encoded)]
    if (keyBindingJwt) {
      parts.push(keyBindingJwt)
    }

    return {
      jwt: credential.jwt,
      disclosures: selectedDisclosures,
      keyBindingJwt,
      combined: parts.join(DISCLOSURE_SEPARATOR),
    }
  }

  /**
   * Parse an SD-JWT combined string
   */
  parseSDJWT(combined: string): {
    jwt: string
    disclosures: Disclosure[]
    keyBindingJwt?: string
  } {
    const parts = combined.split(DISCLOSURE_SEPARATOR)

    if (parts.length < 1) {
      throw new Error('Invalid SD-JWT format')
    }

    const jwt = parts[0]
    const disclosures: Disclosure[] = []
    let keyBindingJwt: string | undefined

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i]
      if (!part) continue

      if (part.split('.').length === 3 && i === parts.length - 1) {
        keyBindingJwt = part
        continue
      }

      try {
        const disclosure = this.parseDisclosure(part)
        disclosures.push(disclosure)
      } catch {
        // Skip invalid disclosures
      }
    }

    return { jwt, disclosures, keyBindingJwt }
  }

  /**
   * Verify an SD-JWT presentation — delegates to verification module
   */
  async verifyPresentation(
    combined: string,
    options: {
      expectedAudience?: string
      expectedNonce?: string
      issuerPublicKey?: string
      holderPublicKey?: string
    } = {}
  ): Promise<VerificationResult> {
    return verifySDJWTPresentation(combined, this.parseSDJWT.bind(this), options)
  }

  /**
   * Get selectively disclosable claims from an SD-JWT
   */
  getSelectiveDisclosableClaims(credential: SDJWTCredential): string[] {
    return credential.disclosures.map((d) => d.claimName)
  }

  /**
   * Create key binding JWT with proper async signing
   */
  async createKeyBindingJWTAsync(
    sdJwt: string,
    disclosures: Disclosure[],
    audience: string,
    nonce: string,
    holderPrivateKey: jose.KeyLike
  ): Promise<string> {
    const combined = [sdJwt, ...disclosures.map((d) => d.encoded)].join(DISCLOSURE_SEPARATOR)
    const sdHash = crypto.createHash(this.hashAlgorithm).update(combined).digest('base64url')

    const kbJwt = await new jose.SignJWT({
      iat: Math.floor(Date.now() / 1000),
      aud: audience,
      nonce: nonce,
      sd_hash: sdHash,
    })
      .setProtectedHeader({
        alg: 'EdDSA',
        typ: 'kb+jwt',
      })
      .sign(holderPrivateKey)

    return kbJwt
  }

  // ==================== Private Helpers ====================

  private createDisclosure(claimName: string, claimValue: SDJWTClaimValue): Disclosure {
    const salt = this.generateSalt()
    const disclosureArray = [salt, claimName, claimValue]
    const encoded = Buffer.from(JSON.stringify(disclosureArray)).toString('base64url')
    const digest = this.computeDisclosureDigest(encoded)

    return { salt, claimName, claimValue, encoded, digest }
  }

  private parseDisclosure(encoded: string): Disclosure {
    const decoded = Buffer.from(encoded, 'base64url').toString('utf8')
    const [salt, claimName, claimValue] = JSON.parse(decoded)

    return {
      salt,
      claimName,
      claimValue,
      encoded,
      digest: this.computeDisclosureDigest(encoded),
    }
  }

  private computeDisclosureDigest(encoded: string): string {
    return crypto.createHash(this.hashAlgorithm).update(encoded).digest('base64url')
  }

  private generateSalt(): string {
    return crypto.randomBytes(16).toString('base64url')
  }

  private async createJWTAsync(payload: SDJWTPayload, privateKey: jose.KeyLike): Promise<string> {
    const jwt = await new jose.SignJWT(payload as unknown as jose.JWTPayload)
      .setProtectedHeader({
        alg: 'EdDSA',
        typ: 'vc+sd-jwt',
      })
      .sign(privateKey)

    return jwt
  }

  private createJWT(payload: SDJWTPayload, privateKey?: string): string {
    logger.warn('Using sync createJWT - consider using async version with proper keys')

    const header = { alg: 'EdDSA', typ: 'vc+sd-jwt' }

    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url')
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')

    const signatureInput = `${headerB64}.${payloadB64}`
    const signature = crypto
      .createHash('sha256')
      .update(signatureInput + (privateKey || 'sync-fallback'))
      .digest('base64url')

    return `${headerB64}.${payloadB64}.${signature}`
  }

  private createKeyBindingJWT(
    sdJwt: string,
    disclosures: Disclosure[],
    audience: string,
    nonce: string,
    privateKey: string
  ): string {
    const combined = [sdJwt, ...disclosures.map((d) => d.encoded)].join(DISCLOSURE_SEPARATOR)
    const sdHash = crypto.createHash(this.hashAlgorithm).update(combined).digest('base64url')

    const header = { alg: 'EdDSA', typ: 'kb+jwt' }
    const payload = {
      iat: Math.floor(Date.now() / 1000),
      aud: audience,
      nonce: nonce,
      sd_hash: sdHash,
    }

    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url')
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')

    const signatureInput = `${headerB64}.${payloadB64}`
    const signature = crypto
      .createHash('sha256')
      .update(signatureInput + privateKey)
      .digest('base64url')

    return `${headerB64}.${payloadB64}.${signature}`
  }
}

export const sdjwtService = new SDJWTService()
