/**
 * SD-JWT Verification Service
 *
 * Handles SD-JWT presentation verification, key binding JWT verification,
 * and JWT signature verification against DID-resolved public keys.
 * Extracted from sdjwt.service.ts for modularity.
 */

import * as crypto from 'crypto'
import * as jose from 'jose'
import { logger } from '../utils/logger'
import { resolvePublicKeyFromDid } from './didResolver.service'
import type {
  SDJWTClaims,
  SDJWTClaimValue,
  SDJWTPayload,
  Disclosure,
  VerificationResult,
} from './sdjwt.service'

const DISCLOSURE_SEPARATOR = '~'

/**
 * Verify an SD-JWT presentation
 */
export async function verifySDJWTPresentation(
  combined: string,
  parseSDJWT: (combined: string) => { jwt: string; disclosures: Disclosure[]; keyBindingJwt?: string },
  options: {
    expectedAudience?: string
    expectedNonce?: string
    issuerPublicKey?: string
    holderPublicKey?: string
  } = {}
): Promise<VerificationResult> {
  try {
    const { jwt, disclosures, keyBindingJwt } = parseSDJWT(combined)

    const payload = decodeJWTPayload(jwt)

    const signatureValid = await verifyJWTSignature(jwt, options.issuerPublicKey)

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

    if (keyBindingJwt) {
      const kbValid = await verifyKeyBindingJWT(
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
      const computedDigest = computeDisclosureDigest(disclosure.encoded)

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

    const disclosedDigests = disclosures.map((d) =>
      computeDisclosureDigest(d.encoded)
    )
    const hiddenClaimsCount = sdDigests.filter(
      (d: string) => !disclosedDigests.includes(d)
    ).length

    const plainClaims = extractPlainClaims(payload)
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
 * Verify JWT signature against issuer DID
 */
export async function verifyJWTSignature(jwt: string, publicKeyOrDid?: string): Promise<boolean> {
  try {
    const payload = decodeJWTPayload(jwt)
    const issuerDid = payload.iss
    const didToResolve = publicKeyOrDid || issuerDid

    if (!didToResolve) {
      logger.warn('No issuer DID found for signature verification')
      return false
    }

    if (didToResolve.startsWith('did:')) {
      const publicKey = await resolvePublicKeyFromDid(didToResolve)
      if (!publicKey) {
        logger.warn('Could not resolve DID to public key', { did: didToResolve })
        return false
      }

      await jose.jwtVerify(jwt, publicKey)
      logger.info('SD-JWT signature verified successfully', { issuer: didToResolve })
      return true
    }

    logger.warn('Invalid DID format for SD-JWT verification', { did: didToResolve })
    return false
  } catch (error) {
    logger.error('SD-JWT signature verification failed', { error: (error as Error).message })
    return false
  }
}

/**
 * Verify key binding JWT
 */
export async function verifyKeyBindingJWT(
  kbJwt: string,
  sdJwt: string,
  disclosures: Disclosure[],
  expectedAudience?: string,
  expectedNonce?: string,
  holderPublicKeyOrDid?: string
): Promise<boolean> {
  try {
    const payload = decodeJWTPayload(kbJwt)

    if (expectedAudience && payload.aud !== expectedAudience) {
      logger.warn('Key binding JWT audience mismatch', { expected: expectedAudience, actual: payload.aud })
      return false
    }

    if (expectedNonce && payload.nonce !== expectedNonce) {
      logger.warn('Key binding JWT nonce mismatch')
      return false
    }

    const combined = [sdJwt, ...disclosures.map((d) => d.encoded)].join(DISCLOSURE_SEPARATOR)
    const expectedHash = crypto.createHash('sha256').update(combined).digest('base64url')

    if (payload.sd_hash !== expectedHash) {
      logger.warn('Key binding JWT sd_hash mismatch')
      return false
    }

    if (holderPublicKeyOrDid && holderPublicKeyOrDid.startsWith('did:')) {
      try {
        const holderPublicKey = await resolvePublicKeyFromDid(holderPublicKeyOrDid)
        if (holderPublicKey) {
          await jose.jwtVerify(kbJwt, holderPublicKey)
          logger.info('Key binding JWT signature verified', { holder: holderPublicKeyOrDid })
        } else {
          logger.warn('Could not resolve holder DID for key binding verification')
          return false
        }
      } catch (sigError) {
        logger.error('Key binding JWT signature verification failed', { error: (sigError as Error).message })
        return false
      }
    }

    return true
  } catch (error) {
    logger.error('Key binding JWT verification error', { error: (error as Error).message })
    return false
  }
}

// ==================== Helpers ====================

export function decodeJWTPayload(jwt: string): SDJWTPayload {
  const parts = jwt.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format')
  }

  const payloadB64 = parts[1]
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
  return payload
}

function extractPlainClaims(payload: SDJWTPayload): SDJWTClaims {
  const claims: SDJWTClaims = {}

  for (const [key, value] of Object.entries(payload)) {
    if (['iss', 'sub', 'iat', 'exp', 'nbf', 'aud', 'jti', '_sd', '_sd_alg', 'vc'].includes(key)) {
      continue
    }
    claims[key] = value as SDJWTClaimValue
  }

  if (payload.vc?.credentialSubject) {
    for (const [key, value] of Object.entries(payload.vc.credentialSubject)) {
      if (key !== '_sd') {
        claims[key] = value as SDJWTClaimValue
      }
    }
  }

  return claims
}

function computeDisclosureDigest(encoded: string): string {
  return crypto.createHash('sha256').update(encoded).digest('base64url')
}
