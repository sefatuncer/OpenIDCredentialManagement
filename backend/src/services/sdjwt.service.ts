/**
 * SD-JWT (Selective Disclosure JWT) Service
 *
 * Implements SD-JWT format for privacy-preserving credentials
 * Based on: https://datatracker.ietf.org/doc/draft-ietf-oauth-selective-disclosure-jwt/
 *
 * SD-JWT allows holders to selectively disclose only specific claims
 * from their credentials while keeping other claims hidden.
 */

import * as crypto from 'crypto'
import * as jose from 'jose'
import { logger } from '../utils/logger'
import { resolveDidKey } from '../agents/base.agent'

// Types
export interface SDJWTClaims {
  [key: string]: any
}

export interface Disclosure {
  salt: string
  claimName: string
  claimValue: any
  encoded: string
  digest: string
}

export interface SDJWTPayload {
  iss: string
  iat: number
  exp?: number
  nbf?: number
  sub?: string
  vc?: any
  _sd?: string[]
  _sd_alg?: string
  [key: string]: any
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

// Constants
const SD_ALG = 'sha-256'
const DISCLOSURE_SEPARATOR = '~'

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
      privateKey?: string
    } = {}
  ): Promise<SDJWTCredential> {
    logger.info('Creating SD-JWT credential', { issuer: issuerDid, subject: subjectDid })

    const disclosures: Disclosure[] = []
    const sdDigests: string[] = []
    const plainClaims: SDJWTClaims = {}

    // Process claims
    for (const [key, value] of Object.entries(claims)) {
      if (selectiveDisclosureClaims.includes(key)) {
        // Create disclosure for this claim
        const disclosure = this.createDisclosure(key, value)
        disclosures.push(disclosure)
        sdDigests.push(disclosure.digest)
      } else {
        // Keep as plain claim
        plainClaims[key] = value
      }
    }

    // Build JWT payload
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

    // Create JWT
    const jwt = this.createJWT(payload, options.privateKey)

    // Combine JWT with disclosures
    const disclosureStrings = disclosures.map((d) => d.encoded)
    const combined = [jwt, ...disclosureStrings].join(DISCLOSURE_SEPARATOR)

    return {
      jwt,
      disclosures,
      combined,
    }
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
      privateKey?: string
    } = {}
  ): Promise<SDJWTCredential> {
    logger.info('Creating SD-JWT VC', { type: credentialType })

    const disclosures: Disclosure[] = []
    const sdDigests: string[] = []
    const plainSubject: SDJWTClaims = { id: subjectDid }

    // Process credential subject claims
    for (const [key, value] of Object.entries(credentialSubject)) {
      if (key === 'id') continue // Always include id

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

    if (options.credentialId) {
      payload.vc.id = options.credentialId
    }

    const jwt = this.createJWT(payload, options.privateKey)
    const disclosureStrings = disclosures.map((d) => d.encoded)
    const combined = [jwt, ...disclosureStrings].join(DISCLOSURE_SEPARATOR)

    return {
      jwt,
      disclosures,
      combined,
    }
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

    // Filter disclosures to only include requested claims
    const selectedDisclosures = credential.disclosures.filter((d) =>
      claimsToDisclose.includes(d.claimName)
    )

    // Create key binding JWT if holder key is provided
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

    // Combine for presentation
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

    // Parse disclosures
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i]

      if (!part) continue

      // Check if this is a key binding JWT (has 3 parts when split by .)
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
   * Verify an SD-JWT presentation
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
    try {
      const { jwt, disclosures, keyBindingJwt } = this.parseSDJWT(combined)

      // Decode JWT payload
      const payload = this.decodeJWTPayload(jwt)

      // Verify JWT signature (mock implementation)
      // In production, this would verify against the issuer's public key
      const signatureValid = await this.verifyJWTSignature(jwt, options.issuerPublicKey)

      if (!signatureValid) {
        return {
          verified: false,
          claims: {},
          disclosedClaims: [],
          hiddenClaims: [],
          issuer: payload.iss,
          issuedAt: new Date(payload.iat * 1000),
          error: 'Invalid JWT signature',
        }
      }

      // Check expiration
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return {
          verified: false,
          claims: {},
          disclosedClaims: [],
          hiddenClaims: [],
          issuer: payload.iss,
          issuedAt: new Date(payload.iat * 1000),
          error: 'Credential has expired',
        }
      }

      // Verify key binding JWT if present
      if (keyBindingJwt) {
        const kbValid = await this.verifyKeyBindingJWT(
          keyBindingJwt,
          jwt,
          disclosures,
          options.expectedAudience,
          options.expectedNonce,
          options.holderPublicKey
        )

        if (!kbValid) {
          return {
            verified: false,
            claims: {},
            disclosedClaims: [],
            hiddenClaims: [],
            issuer: payload.iss,
            issuedAt: new Date(payload.iat * 1000),
            error: 'Invalid key binding JWT',
          }
        }
      }

      // Verify disclosure digests
      const sdDigests = payload._sd || []
      const disclosedClaims: string[] = []
      const reconstructedClaims: SDJWTClaims = {}

      for (const disclosure of disclosures) {
        // Verify digest matches
        const computedDigest = this.computeDisclosureDigest(disclosure.encoded)

        if (!sdDigests.includes(computedDigest)) {
          return {
            verified: false,
            claims: {},
            disclosedClaims: [],
            hiddenClaims: [],
            issuer: payload.iss,
            issuedAt: new Date(payload.iat * 1000),
            error: `Invalid disclosure for claim: ${disclosure.claimName}`,
          }
        }

        reconstructedClaims[disclosure.claimName] = disclosure.claimValue
        disclosedClaims.push(disclosure.claimName)
      }

      // Calculate hidden claims (digests without matching disclosures)
      const disclosedDigests = disclosures.map((d) =>
        this.computeDisclosureDigest(d.encoded)
      )
      const hiddenClaimsCount = sdDigests.filter(
        (d: string) => !disclosedDigests.includes(d)
      ).length

      // Merge plain claims from payload
      const plainClaims = this.extractPlainClaims(payload)
      const allClaims = { ...plainClaims, ...reconstructedClaims }

      return {
        verified: true,
        claims: allClaims,
        disclosedClaims,
        hiddenClaims: Array(hiddenClaimsCount).fill('(hidden)'),
        issuer: payload.iss,
        subject: payload.sub,
        issuedAt: new Date(payload.iat * 1000),
        expiresAt: payload.exp ? new Date(payload.exp * 1000) : undefined,
      }
    } catch (error) {
      logger.error('SD-JWT verification failed', error)
      return {
        verified: false,
        claims: {},
        disclosedClaims: [],
        hiddenClaims: [],
        issuer: '',
        issuedAt: new Date(),
        error: (error as Error).message,
      }
    }
  }

  /**
   * Get selectively disclosable claims from an SD-JWT
   */
  getSelectiveDisclosableClaims(credential: SDJWTCredential): string[] {
    return credential.disclosures.map((d) => d.claimName)
  }

  // Private helper methods

  private createDisclosure(claimName: string, claimValue: any): Disclosure {
    const salt = this.generateSalt()
    const disclosureArray = [salt, claimName, claimValue]
    const encoded = Buffer.from(JSON.stringify(disclosureArray)).toString('base64url')
    const digest = this.computeDisclosureDigest(encoded)

    return {
      salt,
      claimName,
      claimValue,
      encoded,
      digest,
    }
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

  private createJWT(payload: SDJWTPayload, privateKey?: string): string {
    const header = {
      alg: 'ES256',
      typ: 'vc+sd-jwt',
    }

    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url')
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')

    // In production, sign with actual private key
    // For now, create a mock signature
    const signatureInput = `${headerB64}.${payloadB64}`
    const signature = crypto
      .createHmac('sha256', privateKey || 'mock-key')
      .update(signatureInput)
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
    // Hash the SD-JWT and disclosures
    const combined = [sdJwt, ...disclosures.map((d) => d.encoded)].join(DISCLOSURE_SEPARATOR)
    const sdHash = crypto.createHash(this.hashAlgorithm).update(combined).digest('base64url')

    const header = {
      alg: 'ES256',
      typ: 'kb+jwt',
    }

    const payload = {
      iat: Math.floor(Date.now() / 1000),
      aud: audience,
      nonce: nonce,
      sd_hash: sdHash,
    }

    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url')
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const signature = crypto
      .createHmac('sha256', privateKey)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url')

    return `${headerB64}.${payloadB64}.${signature}`
  }

  private decodeJWTPayload(jwt: string): SDJWTPayload {
    const parts = jwt.split('.')
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format')
    }

    const payloadB64 = parts[1]
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
    return payload
  }

  private async verifyJWTSignature(jwt: string, publicKeyOrDid?: string): Promise<boolean> {
    try {
      const payload = this.decodeJWTPayload(jwt)
      const issuerDid = payload.iss

      // If a public key/DID is provided, use it; otherwise try to resolve from iss claim
      const didToResolve = publicKeyOrDid || issuerDid

      if (!didToResolve) {
        logger.warn('No issuer DID found for signature verification')
        return false
      }

      // Resolve did:key to public key
      if (didToResolve.startsWith('did:key:')) {
        const publicKey = await resolveDidKey(didToResolve)
        if (!publicKey) {
          logger.warn('Could not resolve DID to public key', { did: didToResolve })
          return false
        }

        await jose.jwtVerify(jwt, publicKey)
        logger.info('SD-JWT signature verified successfully', { issuer: didToResolve })
        return true
      }

      // For non did:key methods, log warning
      logger.warn('Unsupported DID method for SD-JWT verification', {
        method: didToResolve.split(':')[1],
      })
      return false
    } catch (error) {
      logger.error('SD-JWT signature verification failed', { error: (error as Error).message })
      return false
    }
  }

  private async verifyKeyBindingJWT(
    kbJwt: string,
    sdJwt: string,
    disclosures: Disclosure[],
    expectedAudience?: string,
    expectedNonce?: string,
    holderPublicKey?: string
  ): Promise<boolean> {
    try {
      const payload = this.decodeJWTPayload(kbJwt)

      // Verify audience
      if (expectedAudience && payload.aud !== expectedAudience) {
        return false
      }

      // Verify nonce
      if (expectedNonce && payload.nonce !== expectedNonce) {
        return false
      }

      // Verify sd_hash
      const combined = [sdJwt, ...disclosures.map((d) => d.encoded)].join(DISCLOSURE_SEPARATOR)
      const expectedHash = crypto.createHash(this.hashAlgorithm).update(combined).digest('base64url')

      if (payload.sd_hash !== expectedHash) {
        return false
      }

      return true
    } catch {
      return false
    }
  }

  private extractPlainClaims(payload: SDJWTPayload): SDJWTClaims {
    const claims: SDJWTClaims = {}

    for (const [key, value] of Object.entries(payload)) {
      // Skip JWT standard claims and SD-JWT specific claims
      if (['iss', 'sub', 'iat', 'exp', 'nbf', 'aud', 'jti', '_sd', '_sd_alg', 'vc'].includes(key)) {
        continue
      }
      claims[key] = value
    }

    // Handle VC structure
    if (payload.vc?.credentialSubject) {
      for (const [key, value] of Object.entries(payload.vc.credentialSubject)) {
        if (key !== '_sd') {
          claims[key] = value
        }
      }
    }

    return claims
  }
}

export const sdjwtService = new SDJWTService()
