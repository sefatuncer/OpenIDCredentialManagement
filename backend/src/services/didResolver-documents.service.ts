/**
 * DID Document Building Service
 *
 * Handles DID document construction for different DID methods:
 * - did:key — self-certifying DIDs
 * - did:web — web-based DIDs
 * - did:peer — peer DIDs
 *
 * Extracted from didResolver.service.ts for modularity.
 */

import { logger } from '../utils/logger'
import { isPrivateUrl } from '../utils/url-validation'
import type {
  DIDDocument,
  DIDResolutionResult,
} from './didResolver.service'

/**
 * Resolve did:key
 * https://w3c-ccg.github.io/did-method-key/
 */
export async function resolveDidKey(
  did: string,
  methodSpecificId: string
): Promise<DIDResolutionResult> {
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
export async function resolveDidWeb(
  did: string,
  methodSpecificId: string
): Promise<DIDResolutionResult> {
  const parts = methodSpecificId.split(':')
  const domain = decodeURIComponent(parts[0])
  const path = parts.slice(1).map(decodeURIComponent).join('/')

  let url: string
  if (path) {
    url = `https://${domain}/${path}/did.json`
  } else {
    url = `https://${domain}/.well-known/did.json`
  }

  // SSRF protection
  if (isPrivateUrl(url)) {
    return {
      didDocument: null,
      didDocumentMetadata: {},
      didResolutionMetadata: {
        error: 'invalidDid',
        message: 'DID:web resolution to private/internal URLs is not allowed',
      },
    }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const response = await fetch(url, {
      headers: {
        Accept: 'application/did+ld+json, application/json',
      },
      signal: controller.signal,
    })
    clearTimeout(timeout)

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
 * Resolve did:peer
 * https://identity.foundation/peer-did-method-spec/
 */
export async function resolveDidPeer(
  did: string,
  methodSpecificId: string
): Promise<DIDResolutionResult> {
  const numAlgo = methodSpecificId.charAt(0)

  if (numAlgo === '0') {
    const keyMultibase = methodSpecificId.substring(1)
    return resolveDidPeer0(did, keyMultibase)
  } else if (numAlgo === '2') {
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
 * Resolve did:peer numalgo 2
 */
function resolveDidPeer2(
  did: string,
  methodSpecificId: string
): DIDResolutionResult {
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
export function getKeyTypeFromMultibase(multibase: string): {
  verificationMethodType: string
  supportsKeyAgreement: boolean
} {
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

  return {
    verificationMethodType: 'Ed25519VerificationKey2020',
    supportsKeyAgreement: true,
  }
}
