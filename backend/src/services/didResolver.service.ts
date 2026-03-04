import { logger } from '../utils/logger'

/**
 * Universal DID Resolver Service
 *
 * Supports multiple DID methods:
 * - did:key - Self-certifying DIDs using public keys
 * - did:web - Web-based DIDs
 * - did:peer - Peer DIDs for private connections
 */

// JsonWebKey interface for DID documents
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

// Cache for resolved DIDs
const didCache = new Map<
  string,
  { result: DIDResolutionResult; timestamp: number }
>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Resolve a DID to its DID Document
 */
export async function resolveDID(did: string): Promise<DIDResolutionResult> {
  const startTime = Date.now()

  // Check cache
  const cached = didCache.get(did)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    logger.debug('DID resolved from cache', { did })
    return cached.result
  }

  try {
    // Parse DID to get method
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

    // Resolve based on method
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

    // Cache successful resolutions
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
 * Resolve did:key
 * https://w3c-ccg.github.io/did-method-key/
 */
async function resolveDidKey(
  did: string,
  methodSpecificId: string
): Promise<DIDResolutionResult> {
  // did:key uses the multibase-encoded public key as the method-specific identifier
  // The key type is determined by the multicodec prefix

  if (!methodSpecificId.startsWith('z')) {
    return {
      didDocument: null,
      didDocumentMetadata: {},
      didResolutionMetadata: {
        error: 'invalidDid',
        message: 'did:key must start with multibase prefix "z"',
      },
    }
  }

  // Determine key type from multicodec prefix
  const keyType = getKeyTypeFromMultibase(methodSpecificId)

  const verificationMethodId = `${did}#${methodSpecificId}`

  const didDocument: DIDDocument = {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/ed25519-2020/v1',
      'https://w3id.org/security/suites/x25519-2020/v1',
    ],
    id: did,
    verificationMethod: [
      {
        id: verificationMethodId,
        type: keyType.verificationMethodType,
        controller: did,
        publicKeyMultibase: methodSpecificId,
      },
    ],
    authentication: [verificationMethodId],
    assertionMethod: [verificationMethodId],
    capabilityInvocation: [verificationMethodId],
    capabilityDelegation: [verificationMethodId],
  }

  // Add keyAgreement for X25519 keys
  if (keyType.supportsKeyAgreement) {
    const keyAgreementId = `${did}#${methodSpecificId}-key-agreement`
    didDocument.keyAgreement = [keyAgreementId]
  }

  return {
    didDocument,
    didDocumentMetadata: {
      created: new Date().toISOString(),
    },
    didResolutionMetadata: {
      contentType: 'application/did+ld+json',
    },
  }
}

/**
 * Resolve did:web
 * https://w3c-ccg.github.io/did-method-web/
 */
async function resolveDidWeb(
  did: string,
  methodSpecificId: string
): Promise<DIDResolutionResult> {
  // Convert method-specific identifier to URL
  // did:web:example.com -> https://example.com/.well-known/did.json
  // did:web:example.com:path:to:doc -> https://example.com/path/to/doc/did.json

  const parts = methodSpecificId.split(':')
  const domain = decodeURIComponent(parts[0])
  const path = parts.slice(1).map(decodeURIComponent).join('/')

  let url: string
  if (path) {
    url = `https://${domain}/${path}/did.json`
  } else {
    url = `https://${domain}/.well-known/did.json`
  }

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/did+ld+json, application/json',
      },
    })

    if (!response.ok) {
      return {
        didDocument: null,
        didDocumentMetadata: {},
        didResolutionMetadata: {
          error: 'notFound',
          message: `Failed to fetch DID document: ${response.status}`,
        },
      }
    }

    const didDocument = (await response.json()) as DIDDocument

    // Verify the DID in the document matches
    if (didDocument.id !== did) {
      return {
        didDocument: null,
        didDocumentMetadata: {},
        didResolutionMetadata: {
          error: 'invalidDid',
          message: 'DID in document does not match requested DID',
        },
      }
    }

    return {
      didDocument,
      didDocumentMetadata: {},
      didResolutionMetadata: {
        contentType: response.headers.get('content-type') || 'application/json',
      },
    }
  } catch (error) {
    return {
      didDocument: null,
      didDocumentMetadata: {},
      didResolutionMetadata: {
        error: 'notFound',
        message: `Failed to resolve did:web: ${(error as Error).message}`,
      },
    }
  }
}

/**
 * Resolve did:peer (simplified implementation)
 * https://identity.foundation/peer-did-method-spec/
 */
async function resolveDidPeer(
  did: string,
  methodSpecificId: string
): Promise<DIDResolutionResult> {
  // did:peer has multiple numeric methods (0, 1, 2, 3, 4)
  const numAlgo = methodSpecificId.charAt(0)

  if (numAlgo === '0') {
    // numalgo 0: inception key only
    const keyMultibase = methodSpecificId.substring(1)
    return resolveDidPeer0(did, keyMultibase)
  } else if (numAlgo === '2') {
    // numalgo 2: multiple keys and services
    return resolveDidPeer2(did, methodSpecificId)
  }

  return {
    didDocument: null,
    didDocumentMetadata: {},
    didResolutionMetadata: {
      error: 'methodNotSupported',
      message: `did:peer numalgo ${numAlgo} is not supported`,
    },
  }
}

/**
 * Resolve did:peer numalgo 0
 */
function resolveDidPeer0(
  did: string,
  keyMultibase: string
): DIDResolutionResult {
  const verificationMethodId = `${did}#${keyMultibase}`

  const didDocument: DIDDocument = {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: did,
    verificationMethod: [
      {
        id: verificationMethodId,
        type: 'Ed25519VerificationKey2020',
        controller: did,
        publicKeyMultibase: keyMultibase,
      },
    ],
    authentication: [verificationMethodId],
    assertionMethod: [verificationMethodId],
  }

  return {
    didDocument,
    didDocumentMetadata: {},
    didResolutionMetadata: {
      contentType: 'application/did+ld+json',
    },
  }
}

/**
 * Resolve did:peer numalgo 2 (simplified)
 */
function resolveDidPeer2(
  did: string,
  methodSpecificId: string
): DIDResolutionResult {
  // Parse the encoded elements
  // Format: 2.E<encnumbasis>.V<encnumbasis>.S<service>...

  const didDocument: DIDDocument = {
    '@context': ['https://www.w3.org/ns/did/v1'],
    id: did,
    verificationMethod: [],
    authentication: [],
    keyAgreement: [],
    service: [],
  }

  const parts = methodSpecificId.substring(1).split('.')

  for (const part of parts) {
    if (!part) continue

    const purpose = part.charAt(0)
    const value = part.substring(1)

    if (purpose === 'E' || purpose === 'V') {
      // Encryption or Verification key
      const keyId = `${did}#key-${didDocument.verificationMethod!.length + 1}`
      didDocument.verificationMethod!.push({
        id: keyId,
        type: purpose === 'E' ? 'X25519KeyAgreementKey2020' : 'Ed25519VerificationKey2020',
        controller: did,
        publicKeyMultibase: value,
      })

      if (purpose === 'E') {
        didDocument.keyAgreement!.push(keyId)
      } else {
        didDocument.authentication!.push(keyId)
      }
    } else if (purpose === 'S') {
      // Service
      try {
        const serviceData = JSON.parse(
          Buffer.from(value, 'base64url').toString()
        )
        didDocument.service!.push({
          id: `${did}#service-${didDocument.service!.length + 1}`,
          type: serviceData.t || 'DIDCommMessaging',
          serviceEndpoint: serviceData.s || serviceData.serviceEndpoint,
        })
      } catch {
        // Skip invalid service
      }
    }
  }

  return {
    didDocument,
    didDocumentMetadata: {},
    didResolutionMetadata: {
      contentType: 'application/did+ld+json',
    },
  }
}

/**
 * Get key type from multibase-encoded key
 */
function getKeyTypeFromMultibase(multibase: string): {
  verificationMethodType: string
  supportsKeyAgreement: boolean
} {
  // Decode multibase to get multicodec prefix
  // z = base58btc
  // Common prefixes:
  // 0xed01 = Ed25519 public key
  // 0xec01 = X25519 public key
  // 0x1200 = P-256 public key
  // 0x1201 = P-384 public key
  // 0x1202 = P-521 public key

  // For simplicity, assume Ed25519 for z6Mk... prefixes
  if (multibase.startsWith('z6Mk')) {
    return {
      verificationMethodType: 'Ed25519VerificationKey2020',
      supportsKeyAgreement: true,
    }
  } else if (multibase.startsWith('z6LS')) {
    return {
      verificationMethodType: 'X25519KeyAgreementKey2020',
      supportsKeyAgreement: true,
    }
  } else if (multibase.startsWith('zDn')) {
    return {
      verificationMethodType: 'EcdsaSecp256k1VerificationKey2019',
      supportsKeyAgreement: false,
    }
  }

  // Default to Ed25519
  return {
    verificationMethodType: 'Ed25519VerificationKey2020',
    supportsKeyAgreement: true,
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

/**
 * Dereference a DID URL (DID + path/query/fragment)
 */
export async function dereferenceDIDURL(didUrl: string): Promise<{
  contentStream: any
  contentMetadata: Record<string, any>
  dereferencingMetadata: Record<string, any>
}> {
  // Parse DID URL
  const hashIndex = didUrl.indexOf('#')
  const queryIndex = didUrl.indexOf('?')

  let did: string
  let fragment: string | null = null
  let queryString: string | null = null

  if (hashIndex !== -1) {
    did = didUrl.substring(0, hashIndex)
    fragment = didUrl.substring(hashIndex + 1)
  } else if (queryIndex !== -1) {
    did = didUrl.substring(0, queryIndex)
    queryString = didUrl.substring(queryIndex + 1)
  } else {
    did = didUrl
  }

  // Resolve the DID
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

  // If there's a fragment, return the referenced element
  if (fragment) {
    const targetId = `${did}#${fragment}`

    // Check verification methods
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

    // Check services
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

  // Return the full DID document
  return {
    contentStream: resolution.didDocument,
    contentMetadata: resolution.didDocumentMetadata,
    dereferencingMetadata: {},
  }
}
