import { v4 as uuidv4 } from 'uuid'
import jwt from 'jsonwebtoken'
import * as jose from 'jose'
import { logger } from '../utils/logger'
import { getIssuerDid, getIssuerAgent } from '../agents/issuer.agent'
import { resolveDidKey } from '../agents/base.agent'
import { resolveDID } from './didResolver.service'
import {
  IStorageAdapter,
  createStorageAdapter,
  getStorageType,
} from '../core/storage'
import { eventBus } from '../core/event-bus'
import { isFeatureEnabled } from '../core/feature-flags'

// EdDSA key pair for credential signing (Ed25519)
// In production, these should be loaded from secure key management (HSM, KMS, etc.)
let signingKeyPair: { publicKey: jose.KeyLike; privateKey: jose.KeyLike } | null = null
let signingKeyId: string | null = null

async function getSigningKeyPair(): Promise<{ publicKey: jose.KeyLike; privateKey: jose.KeyLike; keyId: string }> {
  if (!signingKeyPair) {
    // Check if keys are provided via environment variables (base64 encoded)
    const privateKeyPem = process.env.CREDENTIAL_SIGNING_PRIVATE_KEY
    const publicKeyPem = process.env.CREDENTIAL_SIGNING_PUBLIC_KEY

    if (privateKeyPem && publicKeyPem) {
      signingKeyPair = {
        privateKey: await jose.importPKCS8(Buffer.from(privateKeyPem, 'base64').toString(), 'EdDSA'),
        publicKey: await jose.importSPKI(Buffer.from(publicKeyPem, 'base64').toString(), 'EdDSA'),
      }
      signingKeyId = process.env.CREDENTIAL_SIGNING_KEY_ID || 'key-1'
      logger.info('Loaded EdDSA signing keys from environment')
    } else {
      // Generate ephemeral key pair for development/testing
      signingKeyPair = await jose.generateKeyPair('EdDSA', { crv: 'Ed25519' })
      signingKeyId = 'key-1'
      logger.warn('Generated ephemeral EdDSA signing key pair - use CREDENTIAL_SIGNING_PRIVATE_KEY and CREDENTIAL_SIGNING_PUBLIC_KEY in production')
    }
  }
  return { ...signingKeyPair, keyId: signingKeyId! }
}

/**
 * OpenID4VCI Service
 *
 * Implements the OpenID for Verifiable Credential Issuance specification
 * https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html
 *
 * Now supports pluggable storage backends via IStorageAdapter.
 */

// Storage types
interface StoredCredentialOffer {
  offer: CredentialOffer
  preAuthorizedCode: string
  createdAt: Date
  expiresAt: Date
  claimed: boolean
}

interface StoredAccessToken {
  tokenKey: string  // Store the token key for cleanup
  offerId: string
  issuedAt: Date
  expiresAt: Date
  scope: string
}

interface StoredDeferredCredential {
  credentialType: string
  subject: Record<string, any>
  holderDid: string
  status: 'pending' | 'ready' | 'issued' | 'failed'
  credential?: string
  createdAt: Date
}

interface StoredNonce {
  nonce: string
  tokenId: string  // Associated access token
  createdAt: Date
  expiresAt: Date
  used: boolean
}

// Storage adapters (initialized lazily)
let credentialOffersStorage: IStorageAdapter<StoredCredentialOffer> | null = null
let accessTokensStorage: IStorageAdapter<StoredAccessToken> | null = null
let deferredCredentialsStorage: IStorageAdapter<StoredDeferredCredential> | null = null
let nonceStorage: IStorageAdapter<StoredNonce> | null = null

/**
 * Get or initialize storage adapters
 */
function getOffersStorage(): IStorageAdapter<StoredCredentialOffer> {
  if (!credentialOffersStorage) {
    credentialOffersStorage = createStorageAdapter<StoredCredentialOffer>('credential_offers')
  }
  return credentialOffersStorage
}

function getTokensStorage(): IStorageAdapter<StoredAccessToken> {
  if (!accessTokensStorage) {
    accessTokensStorage = createStorageAdapter<StoredAccessToken>('access_tokens')
  }
  return accessTokensStorage
}

function getDeferredStorage(): IStorageAdapter<StoredDeferredCredential> {
  if (!deferredCredentialsStorage) {
    deferredCredentialsStorage = createStorageAdapter<StoredDeferredCredential>('deferred_credentials')
  }
  return deferredCredentialsStorage
}

function getNonceStorage(): IStorageAdapter<StoredNonce> {
  if (!nonceStorage) {
    nonceStorage = createStorageAdapter<StoredNonce>('credential_nonces')
  }
  return nonceStorage
}

export interface CredentialOffer {
  credential_issuer: string
  credentials: string[]
  grants: {
    'urn:ietf:params:oauth:grant-type:pre-authorized_code'?: {
      'pre-authorized_code': string
      user_pin_required: boolean
    }
    authorization_code?: {
      issuer_state?: string
    }
  }
}

export interface IssuerMetadata {
  credential_issuer: string
  authorization_server?: string
  credential_endpoint: string
  batch_credential_endpoint?: string
  deferred_credential_endpoint?: string
  credential_configurations_supported: Record<string, CredentialConfiguration>
  display?: IssuerDisplay[]
}

export interface CredentialConfiguration {
  format: string
  scope?: string
  cryptographic_binding_methods_supported?: string[]
  cryptographic_suites_supported?: string[]
  credential_definition: {
    type: string[]
    credentialSubject?: Record<string, any>
  }
  display?: CredentialDisplay[]
}

export interface IssuerDisplay {
  name: string
  locale?: string
  logo?: {
    uri: string
    alt_text?: string
  }
}

export interface CredentialDisplay {
  name: string
  locale?: string
  logo?: {
    uri: string
    alt_text?: string
  }
  description?: string
  background_color?: string
  text_color?: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  c_nonce?: string
  c_nonce_expires_in?: number
}

export interface CredentialRequest {
  format: string
  credential_definition?: {
    type: string[]
  }
  proof?: {
    proof_type: string
    jwt: string
  }
}

export interface CredentialResponse {
  format: string
  credential?: string
  acceptance_token?: string
  c_nonce?: string
  c_nonce_expires_in?: number
}

/**
 * Get issuer base URL
 */
export function getIssuerBaseUrl(): string {
  return process.env.ISSUER_BASE_URL || 'http://localhost:3001'
}

/**
 * Get issuer metadata (/.well-known/openid-credential-issuer)
 */
export function getIssuerMetadata(): IssuerMetadata {
  const baseUrl = getIssuerBaseUrl()

  return {
    credential_issuer: baseUrl,
    credential_endpoint: `${baseUrl}/credential`,
    batch_credential_endpoint: `${baseUrl}/batch-credential`,
    deferred_credential_endpoint: `${baseUrl}/deferred-credential`,
    credential_configurations_supported: {
      AIAgentIdentityCredential: {
        format: 'jwt_vc_json',
        scope: 'agent_identity',
        cryptographic_binding_methods_supported: ['did:key'],
        cryptographic_suites_supported: ['EdDSA'],
        credential_definition: {
          type: ['VerifiableCredential', 'AIAgentIdentityCredential'],
          credentialSubject: {
            agent_id: { mandatory: true, display: [{ name: 'Agent ID' }] },
            agent_type: { mandatory: true, display: [{ name: 'Agent Type' }] },
            agent_name: { mandatory: true, display: [{ name: 'Agent Name' }] },
            capabilities: { mandatory: false, display: [{ name: 'Capabilities' }] },
            owner_did: { mandatory: true, display: [{ name: 'Owner DID' }] },
            trust_level: { mandatory: false, display: [{ name: 'Trust Level' }] },
          },
        },
        display: [
          {
            name: 'AI Agent Identity',
            locale: 'en-US',
            logo: {
              uri: `${baseUrl}/logo.png`,
              alt_text: 'AI Agent Identity Logo',
            },
            description: 'Credential proving the identity and capabilities of an AI agent',
            background_color: '#1E3A5F',
            text_color: '#FFFFFF',
          },
        ],
      },
      DelegationCredential: {
        format: 'jwt_vc_json',
        scope: 'delegation',
        cryptographic_binding_methods_supported: ['did:key'],
        cryptographic_suites_supported: ['EdDSA'],
        credential_definition: {
          type: ['VerifiableCredential', 'DelegationCredential'],
          credentialSubject: {
            delegation_id: { mandatory: true },
            delegator_did: { mandatory: true },
            delegate_did: { mandatory: true },
            scope: { mandatory: true },
            valid_until: { mandatory: true },
          },
        },
        display: [
          {
            name: 'Delegation Credential',
            locale: 'en-US',
            description: 'Credential representing delegated authority',
            background_color: '#2E7D32',
            text_color: '#FFFFFF',
          },
        ],
      },
      CapabilityCredential: {
        format: 'jwt_vc_json',
        scope: 'capability',
        cryptographic_binding_methods_supported: ['did:key'],
        cryptographic_suites_supported: ['EdDSA'],
        credential_definition: {
          type: ['VerifiableCredential', 'CapabilityCredential'],
          credentialSubject: {
            capability_id: { mandatory: true },
            capability_type: { mandatory: true },
            resource: { mandatory: true },
            actions: { mandatory: true },
          },
        },
        display: [
          {
            name: 'Capability Credential',
            locale: 'en-US',
            description: 'Credential granting specific capabilities',
            background_color: '#7B1FA2',
            text_color: '#FFFFFF',
          },
        ],
      },
    },
    display: [
      {
        name: 'AI Agent Identity System',
        locale: 'en-US',
        logo: {
          uri: `${baseUrl}/logo.png`,
          alt_text: 'AI Agent Identity System',
        },
      },
    ],
  }
}

/**
 * Get authorization server metadata (/.well-known/oauth-authorization-server)
 */
export function getAuthorizationServerMetadata() {
  const baseUrl = getIssuerBaseUrl()

  return {
    issuer: baseUrl,
    token_endpoint: `${baseUrl}/token`,
    token_endpoint_auth_methods_supported: ['none'],
    grant_types_supported: ['urn:ietf:params:oauth:grant-type:pre-authorized_code'],
    pre_authorized_grant_anonymous_access_supported: true,
  }
}

/**
 * Create a credential offer
 */
export async function createCredentialOffer(
  credentialTypes: string[],
  options: {
    userPinRequired?: boolean
    expiresInSeconds?: number
  } = {}
): Promise<{
  offerId: string
  credentialOffer: CredentialOffer
  credentialOfferUri: string
}> {
  const baseUrl = getIssuerBaseUrl()
  const offerId = uuidv4()
  const preAuthorizedCode = uuidv4()
  const expiresIn = options.expiresInSeconds || 300 // 5 minutes default

  const credentialOffer: CredentialOffer = {
    credential_issuer: baseUrl,
    credentials: credentialTypes,
    grants: {
      'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
        'pre-authorized_code': preAuthorizedCode,
        user_pin_required: options.userPinRequired || false,
      },
    },
  }

  // Store the offer
  const storedOffer: StoredCredentialOffer = {
    offer: credentialOffer,
    preAuthorizedCode,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    claimed: false,
  }

  await getOffersStorage().save(offerId, storedOffer)

  // Create offer URI (can be used as QR code or deep link)
  const offerJson = encodeURIComponent(JSON.stringify(credentialOffer))
  const credentialOfferUri = `openid-credential-offer://?credential_offer=${offerJson}`

  logger.info('Created credential offer', {
    offerId,
    credentialTypes,
    expiresAt: storedOffer.expiresAt.toISOString(),
    storage: getStorageType(),
  })

  eventBus.emit('credential.offer.created', {
    offerId,
    credentialTypes,
    expiresAt: storedOffer.expiresAt,
  })

  return {
    offerId,
    credentialOffer,
    credentialOfferUri,
  }
}

/**
 * Get a credential offer by ID
 */
export async function getCredentialOffer(
  offerId: string
): Promise<{ offer: CredentialOffer; expired: boolean; claimed: boolean } | null> {
  const stored = await getOffersStorage().get(offerId)
  if (!stored) {
    return null
  }

  return {
    offer: stored.offer,
    expired: new Date() > stored.expiresAt,
    claimed: stored.claimed,
  }
}

/**
 * Exchange pre-authorized code for access token
 */
export async function exchangePreAuthorizedCode(
  preAuthorizedCode: string,
  userPin?: string
): Promise<TokenResponse | { error: string; error_description: string }> {
  // Find the offer with this pre-authorized code
  const allOffers = await getOffersStorage().list()
  let foundOfferId: string | null = null
  let foundOffer: StoredCredentialOffer | null = null

  for (const offer of allOffers) {
    if (offer.preAuthorizedCode === preAuthorizedCode) {
      // Find the key - we need to search by iterating
      const result = await getOffersStorage().query({
        where: { preAuthorizedCode },
        limit: 1,
      })
      if (result.data.length > 0) {
        foundOffer = result.data[0]
        // Find the offer ID by matching
        for (const o of allOffers) {
          if (o.preAuthorizedCode === preAuthorizedCode) {
            const allData = await getOffersStorage().list()
            // We need to get the key - for now use a workaround
            foundOffer = o
            break
          }
        }
      }
      break
    }
  }

  // Re-query to find by code
  const offersResult = await getOffersStorage().query({
    limit: 1000,
  })

  for (const offer of offersResult.data) {
    if (offer.preAuthorizedCode === preAuthorizedCode) {
      foundOffer = offer
      break
    }
  }

  if (!foundOffer) {
    return {
      error: 'invalid_grant',
      error_description: 'Invalid pre-authorized code',
    }
  }

  // Check if expired
  if (new Date() > foundOffer.expiresAt) {
    return {
      error: 'invalid_grant',
      error_description: 'Pre-authorized code has expired',
    }
  }

  // Check if already claimed
  if (foundOffer.claimed) {
    return {
      error: 'invalid_grant',
      error_description: 'Pre-authorized code has already been used',
    }
  }

  // Find the offer ID to update it
  const allOffersForUpdate = await getOffersStorage().list()
  for (const offer of allOffersForUpdate) {
    if (offer.preAuthorizedCode === preAuthorizedCode) {
      // Mark as claimed by saving with claimed=true
      await getOffersStorage().save(preAuthorizedCode, {
        ...offer,
        claimed: true,
      })
      break
    }
  }

  // Generate access token
  const accessToken = `at_${uuidv4()}`
  const expiresIn = 3600 // 1 hour

  const tokenData: StoredAccessToken = {
    tokenKey: accessToken, // Store the token key for cleanup
    offerId: preAuthorizedCode, // Use preAuthorizedCode as reference
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    scope: foundOffer.offer.credentials.join(' '),
  }

  await getTokensStorage().save(accessToken, tokenData)

  // Generate c_nonce for proof of possession and store it
  const cNonce = uuidv4()
  const nonceExpiresIn = 300 // 5 minutes (spec recommends short-lived nonces)

  const storedNonce: StoredNonce = {
    nonce: cNonce,
    tokenId: accessToken,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + nonceExpiresIn * 1000),
    used: false,
  }
  await getNonceStorage().save(cNonce, storedNonce)

  logger.info('Issued access token for credential offer', {
    expiresIn,
    nonceExpiresIn,
    storage: getStorageType(),
  })

  eventBus.emit('auth.token.issued', {
    expiresIn,
    scope: tokenData.scope,
  })

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: expiresIn,
    c_nonce: cNonce,
    c_nonce_expires_in: nonceExpiresIn,
  }
}

/**
 * Validate access token
 */
export async function validateAccessToken(
  token: string
): Promise<{ valid: boolean; offerId?: string; error?: string }> {
  const stored = await getTokensStorage().get(token)
  if (!stored) {
    return { valid: false, error: 'Invalid access token' }
  }

  if (new Date() > stored.expiresAt) {
    return { valid: false, error: 'Access token expired' }
  }

  return { valid: true, offerId: stored.offerId }
}

/**
 * Issue credential using access token
 */
export async function issueCredential(
  accessToken: string,
  request: CredentialRequest
): Promise<CredentialResponse | { error: string; error_description: string }> {
  // Validate token
  const tokenValidation = await validateAccessToken(accessToken)
  if (!tokenValidation.valid) {
    return {
      error: 'invalid_token',
      error_description: tokenValidation.error || 'Invalid access token',
    }
  }

  // Find the credential offer data by looking up offers with matching preAuthorizedCode
  const offersResult = await getOffersStorage().query({ limit: 1000 })
  let offerData: StoredCredentialOffer | null = null

  for (const offer of offersResult.data) {
    if (offer.preAuthorizedCode === tokenValidation.offerId) {
      offerData = offer
      break
    }
  }

  if (!offerData) {
    return {
      error: 'invalid_request',
      error_description: 'Credential offer not found',
    }
  }

  // Extract and verify holder DID from proof if provided
  let holderDid = 'did:key:holder'
  if (request.proof?.jwt) {
    try {
      const proofParts = request.proof.jwt.split('.')
      if (proofParts.length !== 3) {
        return {
          error: 'invalid_proof',
          error_description: 'Invalid proof JWT format',
        }
      }

      const proofHeader = JSON.parse(Buffer.from(proofParts[0], 'base64url').toString())
      const proofPayload = JSON.parse(Buffer.from(proofParts[1], 'base64url').toString())

      // Validate proof type
      if (proofHeader.typ !== 'openid4vci-proof+jwt') {
        logger.warn('Invalid proof type', { typ: proofHeader.typ })
      }

      // Validate audience (should be credential issuer)
      const baseUrl = getIssuerBaseUrl()
      if (proofPayload.aud !== baseUrl) {
        return {
          error: 'invalid_proof',
          error_description: `Invalid proof audience. Expected ${baseUrl}`,
        }
      }

      // Validate proof is not expired (iat should be within reasonable time)
      const now = Math.floor(Date.now() / 1000)
      const iat = proofPayload.iat
      if (!iat || iat > now + 60 || iat < now - 300) { // Allow 60s future, 5min past
        return {
          error: 'invalid_proof',
          error_description: 'Proof JWT iat is invalid or expired',
        }
      }

      // Validate c_nonce - CRITICAL for replay attack prevention
      const proofNonce = proofPayload.nonce
      if (!proofNonce) {
        return {
          error: 'invalid_proof',
          error_description: 'Proof JWT must contain nonce claim',
        }
      }

      // Check nonce exists in storage and is valid
      const storedNonce = await getNonceStorage().get(proofNonce)
      if (!storedNonce) {
        return {
          error: 'invalid_proof',
          error_description: 'Invalid or unknown nonce',
        }
      }

      // Check nonce is not expired
      if (new Date() > storedNonce.expiresAt) {
        await getNonceStorage().delete(proofNonce)
        return {
          error: 'invalid_proof',
          error_description: 'Nonce has expired',
        }
      }

      // Check nonce is not already used
      if (storedNonce.used) {
        return {
          error: 'invalid_proof',
          error_description: 'Nonce has already been used',
        }
      }

      // Mark nonce as used (prevent replay)
      await getNonceStorage().update(proofNonce, { used: true })
      logger.info('Nonce validated and marked as used', { nonce: proofNonce })

      // Cryptographic signature verification for ALL DID methods
      const proofIssuer = proofPayload.iss || (proofHeader.kid?.split('#')[0])
      if (proofIssuer && proofIssuer.startsWith('did:')) {
        try {
          // Use universal public key resolver that supports did:key, did:web, did:peer
          const holderPublicKey = await resolvePublicKeyFromDid(proofIssuer)
          if (holderPublicKey) {
            await jose.jwtVerify(request.proof.jwt, holderPublicKey)
            logger.info('Proof signature verified successfully', { holderDid: proofIssuer })
          } else {
            logger.error('Could not resolve holder DID public key', { holderDid: proofIssuer })
            return {
              error: 'invalid_proof',
              error_description: 'Could not resolve holder DID public key for signature verification',
            }
          }
        } catch (sigError) {
          logger.error('Proof signature verification failed', {
            error: (sigError as Error).message,
            holderDid: proofIssuer
          })
          return {
            error: 'invalid_proof',
            error_description: 'Proof signature verification failed: ' + (sigError as Error).message,
          }
        }
      } else if (!proofIssuer) {
        // No issuer in proof - this is a security issue
        logger.error('Proof JWT missing issuer claim')
        return {
          error: 'invalid_proof',
          error_description: 'Proof JWT must contain iss claim or kid header with DID',
        }
      }

      holderDid = proofPayload.iss || holderDid
    } catch (error) {
      logger.warn('Could not parse holder DID from proof', { error: (error as Error).message })
      return {
        error: 'invalid_proof',
        error_description: 'Failed to parse proof JWT',
      }
    }
  }

  // Determine credential type from request
  const credentialTypes = request.credential_definition?.type || ['VerifiableCredential', 'AIAgentIdentityCredential']
  const credentialType = credentialTypes[credentialTypes.length - 1]

  try {
    // Create JWT-VC credential directly
    const issuerDid = getIssuerDid()
    const now = Math.floor(Date.now() / 1000)
    const expiresIn = 365 * 24 * 60 * 60 // 1 year

    // Build credential subject based on type
    const credentialSubject = buildCredentialSubject(credentialType, holderDid, offerData)
    const credentialId = `urn:uuid:${uuidv4()}`

    // Create the Verifiable Credential
    const vcPayload = {
      iss: issuerDid,
      sub: holderDid,
      iat: now,
      exp: now + expiresIn,
      nbf: now,
      jti: credentialId,
      vc: {
        '@context': [
          'https://www.w3.org/2018/credentials/v1',
          'https://www.w3.org/2018/credentials/examples/v1'
        ],
        type: credentialTypes,
        issuer: issuerDid,
        issuanceDate: new Date().toISOString(),
        expirationDate: new Date(Date.now() + expiresIn * 1000).toISOString(),
        credentialSubject: {
          id: holderDid,
          ...credentialSubject,
        },
      },
    }

    // Sign the credential as JWT using EdDSA (Ed25519)
    const { privateKey, keyId } = await getSigningKeyPair()
    const credential = await new jose.SignJWT(vcPayload)
      .setProtectedHeader({
        alg: 'EdDSA',
        typ: 'JWT',
        kid: `${issuerDid}#${keyId}`,
      })
      .sign(privateKey)

    logger.info('Credential issued successfully', {
      format: request.format,
      credentialType,
      holderDid,
      jti: credentialId,
      storage: getStorageType(),
    })

    eventBus.emit('credential.issued', {
      credentialId,
      credentialType,
      issuerDid,
      holderDid,
    })

    // Generate new nonce for potential follow-up requests
    const newNonce = uuidv4()
    const newNonceExpiresIn = 300 // 5 minutes

    const newStoredNonce: StoredNonce = {
      nonce: newNonce,
      tokenId: accessToken,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + newNonceExpiresIn * 1000),
      used: false,
    }
    await getNonceStorage().save(newNonce, newStoredNonce)

    return {
      format: request.format || 'jwt_vc_json',
      credential,
      c_nonce: newNonce,
      c_nonce_expires_in: newNonceExpiresIn,
    }
  } catch (error) {
    logger.error('Failed to issue credential', { error })

    return {
      error: 'server_error',
      error_description: 'Failed to issue credential',
    }
  }
}

/**
 * Build credential subject based on credential type
 */
function buildCredentialSubject(
  credentialType: string,
  holderDid: string,
  offerData: any
): Record<string, any> {
  const now = new Date().toISOString()
  const oneYearFromNow = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()

  switch (credentialType) {
    case 'AIAgentIdentityCredential':
      return {
        agent_id: `agent-${uuidv4().substring(0, 8)}`,
        agent_type: 'autonomous',
        agent_name: 'AI Agent',
        agent_version: '1.0.0',
        capabilities: ['text-generation', 'data-analysis'],
        owner_did: holderDid,
        owner_name: 'Agent Owner',
        created_at: now,
        valid_until: oneYearFromNow,
        trust_level: 'standard',
      }

    case 'DelegationCredential':
      return {
        delegation_id: `del-${uuidv4().substring(0, 8)}`,
        delegator_did: holderDid,
        delegator_name: 'Delegator',
        delegate_did: `did:key:delegate-${uuidv4().substring(0, 8)}`,
        delegate_name: 'AI Agent Delegate',
        scope: ['read', 'write'],
        constraints: { max_operations: 1000 },
        purpose: 'General delegation',
        created_at: now,
        valid_from: now,
        valid_until: oneYearFromNow,
        revocable: true,
      }

    case 'CapabilityCredential':
      return {
        capability_id: `cap-${uuidv4().substring(0, 8)}`,
        holder_did: holderDid,
        capability_type: 'api_access',
        resource: 'https://api.example.com/*',
        actions: ['read', 'write'],
        conditions: { rate_limit: '1000/hour' },
        granted_by: 'did:key:admin',
        granted_at: now,
        valid_until: oneYearFromNow,
      }

    default:
      return {
        id: holderDid,
        type: credentialType,
        issuedAt: now,
      }
  }
}

/**
 * Issue batch credentials
 */
export async function issueBatchCredentials(
  accessToken: string,
  requests: CredentialRequest[]
): Promise<{
  credential_responses: Array<CredentialResponse | { error: string }>
}> {
  if (!isFeatureEnabled('module.batch-issuance')) {
    return {
      credential_responses: requests.map(() => ({
        error: 'batch_issuance_disabled',
      })),
    }
  }

  const responses: Array<CredentialResponse | { error: string }> = []

  for (const request of requests) {
    const result = await issueCredential(accessToken, request)
    if ('error' in result) {
      responses.push({ error: result.error })
    } else {
      responses.push(result)
    }
  }

  return { credential_responses: responses }
}

/**
 * Get deferred credential status
 */
export async function getDeferredCredential(
  acceptanceToken: string
): Promise<CredentialResponse | { error: string; error_description: string }> {
  const deferred = await getDeferredStorage().get(acceptanceToken)
  if (!deferred) {
    return {
      error: 'invalid_token',
      error_description: 'Invalid acceptance token',
    }
  }

  if (deferred.status === 'pending') {
    return {
      error: 'issuance_pending',
      error_description: 'Credential issuance is still pending',
    }
  }

  if (deferred.status === 'failed') {
    return {
      error: 'issuance_failed',
      error_description: 'Credential issuance failed',
    }
  }

  if (deferred.status === 'ready' || deferred.status === 'issued') {
    // Update status to issued
    await getDeferredStorage().update(acceptanceToken, { status: 'issued' })

    return {
      format: 'jwt_vc_json',
      credential: deferred.credential,
    }
  }

  return {
    error: 'invalid_request',
    error_description: 'Unknown credential status',
  }
}

/**
 * List all credential offers (for admin purposes)
 */
export async function listCredentialOffers(): Promise<Array<{
  offerId: string
  credentialTypes: string[]
  createdAt: Date
  expiresAt: Date
  claimed: boolean
  expired: boolean
}>> {
  const offers = await getOffersStorage().list()
  const now = new Date()

  return offers.map((offer) => ({
    offerId: offer.preAuthorizedCode, // Use preAuthorizedCode as ID
    credentialTypes: offer.offer.credentials,
    createdAt: offer.createdAt,
    expiresAt: offer.expiresAt,
    claimed: offer.claimed,
    expired: now > offer.expiresAt,
  }))
}

/**
 * Cleanup expired offers, tokens, and nonces
 */
export async function cleanupExpired(): Promise<{ offersRemoved: number; tokensRemoved: number; noncesRemoved: number }> {
  let offersRemoved = 0
  let tokensRemoved = 0
  let noncesRemoved = 0
  const now = new Date()

  // Cleanup expired offers
  const offers = await getOffersStorage().list()
  for (const offer of offers) {
    if (now > offer.expiresAt) {
      // Find and delete by preAuthorizedCode
      const deleted = await getOffersStorage().delete(offer.preAuthorizedCode)
      if (deleted) offersRemoved++
    }
  }

  // Cleanup expired tokens
  const tokens = await getTokensStorage().list()
  for (const token of tokens) {
    if (now > token.expiresAt) {
      // Use the stored tokenKey to delete
      if (token.tokenKey) {
        const deleted = await getTokensStorage().delete(token.tokenKey)
        if (deleted) tokensRemoved++
      }
    }
  }

  // Cleanup expired or used nonces
  const nonces = await getNonceStorage().list()
  for (const nonce of nonces) {
    if (now > nonce.expiresAt || nonce.used) {
      const deleted = await getNonceStorage().delete(nonce.nonce)
      if (deleted) noncesRemoved++
    }
  }

  if (offersRemoved > 0 || tokensRemoved > 0 || noncesRemoved > 0) {
    logger.info('Cleaned up expired items', { offersRemoved, tokensRemoved, noncesRemoved })

    eventBus.emit('credential.offer.expired', {
      offersRemoved,
      tokensRemoved,
      noncesRemoved,
    })
  }

  return { offersRemoved, tokensRemoved, noncesRemoved }
}

// Run cleanup periodically
let cleanupInterval: NodeJS.Timeout | null = null

export function startCleanupInterval(intervalMs: number = 5 * 60 * 1000): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval)
  }
  cleanupInterval = setInterval(cleanupExpired, intervalMs)
}

export function stopCleanupInterval(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval)
    cleanupInterval = null
  }
}

// Start cleanup by default
startCleanupInterval()

/**
 * Resolve public key from any supported DID method
 * Supports: did:key, did:web, did:peer
 */
async function resolvePublicKeyFromDid(did: string): Promise<jose.KeyLike | null> {
  try {
    // Fast path for did:key
    if (did.startsWith('did:key:')) {
      return await resolveDidKey(did)
    }

    // Use universal DID resolver for other methods
    const resolution = await resolveDID(did)
    if (!resolution.didDocument) {
      logger.warn('Could not resolve DID document', { did })
      return null
    }

    // Extract verification method from DID document
    const verificationMethods = resolution.didDocument.verificationMethod || []
    const authenticationMethods = resolution.didDocument.authentication || []

    // Find the first usable verification method
    for (const vm of verificationMethods) {
      // Handle embedded verification methods
      const method = typeof vm === 'string'
        ? verificationMethods.find((m: any) => typeof m !== 'string' && m.id === vm)
        : vm

      if (!method || typeof method === 'string') continue

      // Try to extract public key based on type
      if (method.publicKeyJwk) {
        try {
          return await jose.importJWK(method.publicKeyJwk as jose.JWK)
        } catch (e) {
          logger.warn('Failed to import JWK from verification method', { id: method.id })
        }
      }

      if (method.publicKeyMultibase) {
        // For Ed25519 keys encoded as multibase
        try {
          const multibase = method.publicKeyMultibase as string
          if (multibase.startsWith('z')) {
            // This is base58btc encoded - extract and import
            // Note: Full multibase decoding would require additional library
            // For now, try to resolve via did:key if it's an Ed25519 key
            const keyDid = `did:key:${multibase}`
            return await resolveDidKey(keyDid)
          }
        } catch (e) {
          logger.warn('Failed to import multibase key from verification method', { id: method.id })
        }
      }
    }

    // Check authentication methods as fallback
    for (const auth of authenticationMethods) {
      if (typeof auth === 'string') {
        const refMethod = verificationMethods.find((m: any) => typeof m !== 'string' && m.id === auth)
        if (refMethod && typeof refMethod !== 'string' && refMethod.publicKeyJwk) {
          return await jose.importJWK(refMethod.publicKeyJwk as jose.JWK)
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
