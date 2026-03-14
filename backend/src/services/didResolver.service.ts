/**
 * Universal DID Resolver Service — Public API + Key Resolution
 *
 * Supports multiple DID methods:
 * - did:key - Self-certifying DIDs using public keys
 * - did:web - Web-based DIDs
 * - did:peer - Peer DIDs for private connections
 *
 * DID document building extracted to didResolver-documents.service.ts.
 */

import * as jose from 'jose'
import { logger } from '../utils/logger'
import { resolveDidKey as resolveDidKeyToPublicKey } from '../agents/base.agent'
import {
  resolveDidKey,
  resolveDidWeb,
  resolveDidPeer,
} from './didResolver-documents.service'

// ==================== Types ====================

export interface JsonWebKey {
  kty: string
  crv?: string
  x?: string
  y?: string
  n?: string
  e?: string
  d?: string
  use?: string
  kid?: string
  alg?: string
  [key: string]: unknown
}

export interface DIDDocument {
  '@context': string | string[]
  id: string
  controller?: string | string[]
  verificationMethod?: VerificationMethod[]
  authentication?: (string | VerificationMethod)[]
  assertionMethod?: (string | VerificationMethod)[]
  keyAgreement?: (string | VerificationMethod)[]
  capabilityInvocation?: (string | VerificationMethod)[]
  capabilityDelegation?: (string | VerificationMethod)[]
  service?: ServiceEndpoint[]
  alsoKnownAs?: string[]
}

export interface VerificationMethod {
  id: string
  type: string
  controller: string
  publicKeyJwk?: JsonWebKey
  publicKeyMultibase?: string
  publicKeyBase58?: string
}

export interface ServiceEndpoint {
  id: string
  type: string
  serviceEndpoint: string | string[] | Record<string, any>
}

export interface DIDResolutionResult {
  didDocument: DIDDocument | null
  didDocumentMetadata: DIDDocumentMetadata
  didResolutionMetadata: DIDResolutionMetadata
}

export interface DIDDocumentMetadata {
  created?: string
  updated?: string
  deactivated?: boolean
  versionId?: string
  nextVersionId?: string
  equivalentId?: string[]
  canonicalId?: string
}

export interface DIDResolutionMetadata {
  contentType?: string
  error?: string
  message?: string
  duration?: number
}

// ==================== Cache ====================

const didCache = new Map<
  string,
  { result: DIDResolutionResult; timestamp: number }
>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// ==================== Resolution ====================

/**
 * Resolve a DID to its DID Document
 */
export async function resolveDID(did: string): Promise<DIDResolutionResult> {
  const startTime = Date.now()

  const cached = didCache.get(did)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    logger.debug('DID resolved from cache', { did })
    return cached.result
  }

  try {
    const parsed = parseDID(did)
    if (!parsed) {
      return {
        didDocument: null,
        didDocumentMetadata: {},
        didResolutionMetadata: {
          error: 'invalidDid',
          message: 'Invalid DID format',
          duration: Date.now() - startTime,
        },
      }
    }

    let result: DIDResolutionResult

    switch (parsed.method) {
      case 'key':
        result = await resolveDidKey(did, parsed.methodSpecificId)
        break
      case 'web':
        result = await resolveDidWeb(did, parsed.methodSpecificId)
        break
      case 'peer':
        result = await resolveDidPeer(did, parsed.methodSpecificId)
        break
      default:
        result = {
          didDocument: null,
          didDocumentMetadata: {},
          didResolutionMetadata: {
            error: 'methodNotSupported',
            message: `DID method '${parsed.method}' is not supported`,
            duration: Date.now() - startTime,
          },
        }
    }

    result.didResolutionMetadata.duration = Date.now() - startTime

    if (result.didDocument) {
      didCache.set(did, { result, timestamp: Date.now() })
    }

    logger.info('DID resolved', {
      did,
      method: parsed.method,
      success: !!result.didDocument,
      duration: result.didResolutionMetadata.duration,
    })

    return result
  } catch (error) {
    logger.error('DID resolution failed', { did, error })
    return {
      didDocument: null,
      didDocumentMetadata: {},
      didResolutionMetadata: {
        error: 'internalError',
        message: (error as Error).message,
        duration: Date.now() - startTime,
      },
    }
  }
}

/**
 * Parse a DID into its components
 */
export function parseDID(
  did: string
): { method: string; methodSpecificId: string } | null {
  const match = did.match(/^did:([a-z0-9]+):(.+)$/i)
  if (!match) {
    return null
  }
  return {
    method: match[1].toLowerCase(),
    methodSpecificId: match[2],
  }
}

/**
 * Validate a DID
 */
export function isValidDID(did: string): boolean {
  return !!parseDID(did)
}

/**
 * Get supported DID methods
 */
export function getSupportedMethods(): string[] {
  return ['key', 'web', 'peer']
}

/**
 * Clear DID cache
 */
export function clearDIDCache(): void {
  didCache.clear()
  logger.info('DID cache cleared')
}

/**
 * Get DID cache statistics
 */
export function getDIDCacheStats(): {
  size: number
  entries: Array<{ did: string; age: number }>
} {
  const entries: Array<{ did: string; age: number }> = []
  const now = Date.now()

  for (const [did, { timestamp }] of didCache.entries()) {
    entries.push({ did, age: now - timestamp })
  }

  return { size: didCache.size, entries }
}

// ==================== Dereferencing ====================

/**
 * Dereference a DID URL (DID + path/query/fragment)
 */
export async function dereferenceDIDURL(didUrl: string): Promise<{
  contentStream: VerificationMethod | ServiceEndpoint | DIDDocument | null
  contentMetadata: DIDDocumentMetadata | Record<string, string>
  dereferencingMetadata: Record<string, string | undefined>
}> {
  const hashIndex = didUrl.indexOf('#')
  const queryIndex = didUrl.indexOf('?')

  let did: string
  let fragment: string | null = null

  if (hashIndex !== -1) {
    did = didUrl.substring(0, hashIndex)
    fragment = didUrl.substring(hashIndex + 1)
  } else if (queryIndex !== -1) {
    did = didUrl.substring(0, queryIndex)
  } else {
    did = didUrl
  }

  const resolution = await resolveDID(did)

  if (!resolution.didDocument) {
    return {
      contentStream: null,
      contentMetadata: {},
      dereferencingMetadata: {
        error: resolution.didResolutionMetadata.error,
        message: resolution.didResolutionMetadata.message,
      },
    }
  }

  if (fragment) {
    const targetId = `${did}#${fragment}`

    const verificationMethod = resolution.didDocument.verificationMethod?.find(
      (vm) => vm.id === targetId || vm.id === `#${fragment}`
    )
    if (verificationMethod) {
      return {
        contentStream: verificationMethod,
        contentMetadata: { type: 'verificationMethod' },
        dereferencingMetadata: {},
      }
    }

    const service = resolution.didDocument.service?.find(
      (s) => s.id === targetId || s.id === `#${fragment}`
    )
    if (service) {
      return {
        contentStream: service,
        contentMetadata: { type: 'service' },
        dereferencingMetadata: {},
      }
    }

    return {
      contentStream: null,
      contentMetadata: {},
      dereferencingMetadata: {
        error: 'notFound',
        message: `Fragment #${fragment} not found in DID document`,
      },
    }
  }

  return {
    contentStream: resolution.didDocument,
    contentMetadata: resolution.didDocumentMetadata,
    dereferencingMetadata: {},
  }
}

// ==================== Public Key Resolution ====================

/**
 * Resolve public key from any supported DID method
 * Returns a jose.KeyLike suitable for JWT signature verification
 */
export async function resolvePublicKeyFromDid(did: string): Promise<jose.KeyLike | null> {
  try {
    // Fast path for did:key
    if (did.startsWith('did:key:')) {
      return await resolveDidKeyToPublicKey(did)
    }

    // Use universal DID resolver for other methods
    const resolution = await resolveDID(did)
    if (!resolution.didDocument) {
      logger.warn('Could not resolve DID document', { did })
      return null
    }

    const verificationMethods = resolution.didDocument.verificationMethod || []
    const authenticationMethods = resolution.didDocument.authentication || []

    for (const vm of verificationMethods) {
      const method = typeof vm === 'string'
        ? verificationMethods.find((m): m is VerificationMethod => typeof m !== 'string' && m.id === vm)
        : vm

      if (!method || typeof method === 'string') continue

      if (method.publicKeyJwk) {
        try {
          const key = await jose.importJWK(method.publicKeyJwk as jose.JWK)
          if (key instanceof Uint8Array) {
            logger.warn('Symmetric key not supported for signature verification', { id: method.id })
            continue
          }
          return key
        } catch (e) {
          logger.warn('Failed to import JWK from verification method', { id: method.id })
        }
      }

      if (method.publicKeyMultibase) {
        try {
          const multibase = method.publicKeyMultibase as string
          if (multibase.startsWith('z')) {
            const keyDid = `did:key:${multibase}`
            return await resolveDidKeyToPublicKey(keyDid)
          }
        } catch (e) {
          logger.warn('Failed to import multibase key from verification method', { id: method.id })
        }
      }
    }

    for (const auth of authenticationMethods) {
      if (typeof auth === 'string') {
        const refMethod = verificationMethods.find((m): m is VerificationMethod => typeof m !== 'string' && m.id === auth)
        if (refMethod && typeof refMethod !== 'string' && refMethod.publicKeyJwk) {
          const key = await jose.importJWK(refMethod.publicKeyJwk as jose.JWK)
          if (key instanceof Uint8Array) {
            continue
          }
          return key
        }
      }
    }

    logger.warn('No usable public key found in DID document', { did })
    return null
  } catch (error) {
    logger.error('Failed to resolve public key from DID', { did, error: (error as Error).message })
    return null
  }
}
