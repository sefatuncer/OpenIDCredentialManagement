/**
 * OpenID4VCI Signing & Credential Issuance Service
 *
 * Handles credential signing, issuance (offer-flow + direct), batch,
 * deferred credentials, and credential subject building.
 * Extracted from openid4vci.service.ts for modularity.
 */

import { v4 as uuidv4 } from 'uuid'
import * as jose from 'jose'
import { logger } from '../utils/logger'
import { getIssuerDid } from '../agents/issuer.agent'
import { resolvePublicKeyFromDid } from './didResolver.service'
import { getStorageType } from '../core/storage'
import { eventBus } from '../core/event-bus'
import { isFeatureEnabled } from '../core/feature-flags'
import { sdjwtService, type SDJWTClaims } from './sdjwt.service'
import { getIssuerBaseUrl } from './openid4vci.service'
import type { CredentialRequest, CredentialResponse } from './openid4vci.service'
import {
  validateAccessToken,
  getOffersStorage,
  getNonceStorage,
  getDeferredStorage,
  type StoredCredentialOffer,
  type StoredNonce,
} from './openid4vci-offers.service'

/**
 * Selective disclosure claim definitions per credential type.
 * Claims listed here will be hidden by default and only revealed when holder chooses to disclose.
 */
export const SD_CLAIMS_BY_TYPE: Record<string, string[]> = {
  AIAgentIdentityCredential: ['agent_name', 'agent_version', 'capabilities', 'owner_name', 'trust_level', 'security_domain', 'registration_timestamp'],
  DelegationCredential: ['delegator_name', 'delegate_name', 'constraints', 'purpose', 'max_amount', 'allowed_services', 'geographic_restrictions'],
  CapabilityCredential: ['conditions', 'granted_by', 'tool_allow_list', 'max_usage_count', 'required_context'],
}

// EdDSA key pair for credential signing (Ed25519)
let signingKeyPair: { publicKey: jose.KeyLike; privateKey: jose.KeyLike } | null = null
let signingKeyId: string | null = null

export async function getSigningKeyPair(): Promise<{ publicKey: jose.KeyLike; privateKey: jose.KeyLike; keyId: string }> {
  if (!signingKeyPair) {
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
      signingKeyPair = await jose.generateKeyPair('EdDSA', { crv: 'Ed25519' })
      signingKeyId = 'key-1'
      logger.warn('Generated ephemeral EdDSA signing key pair - use CREDENTIAL_SIGNING_PRIVATE_KEY and CREDENTIAL_SIGNING_PUBLIC_KEY in production')
    }
  }
  return { ...signingKeyPair, keyId: signingKeyId! }
}

/**
 * Sign a credential directly — bypass offer/token flow.
 * Used by batch issuance and issuer agent direct issuance.
 */
export async function signCredentialDirect(
  holderDid: string,
  credentialType: string,
  claims: Record<string, unknown>,
  options: { format?: 'jwt_vc_json' | 'vc+sd-jwt' } = {}
): Promise<{ credentialId: string; credential: string; format: string }> {
  const issuerDid = getIssuerDid()
  const credentialId = `urn:uuid:${uuidv4()}`
  const expiresIn = 365 * 24 * 60 * 60 // 1 year
  const requestedFormat = options.format || 'jwt_vc_json'
  const credentialTypes = ['VerifiableCredential', credentialType]

  const { privateKey, keyId } = await getSigningKeyPair()
  let credential: string

  if (requestedFormat === 'vc+sd-jwt') {
    const sdClaims = SD_CLAIMS_BY_TYPE[credentialType] || []
    const sdResult = await sdjwtService.createSDJWTVC(
      issuerDid,
      holderDid,
      credentialType,
      claims as SDJWTClaims,
      sdClaims,
      { expiresIn, credentialId, privateKey }
    )
    credential = sdResult.combined
  } else {
    const now = Math.floor(Date.now() / 1000)
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
          ...claims,
        },
      },
    }

    credential = await new jose.SignJWT(vcPayload)
      .setProtectedHeader({
        alg: 'EdDSA',
        typ: 'JWT',
        kid: `${issuerDid}#${keyId}`,
      })
      .sign(privateKey)
  }

  eventBus.emit('credential.issued', {
    credentialId,
    credentialType,
    issuerDid,
    holderDid,
    format: requestedFormat,
  })

  logger.info('Direct credential signed', {
    format: requestedFormat,
    credentialType,
    holderDid,
    jti: credentialId,
  })

  return { credentialId, credential, format: requestedFormat }
}

/**
 * Issue credential using access token (offer flow)
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

  // Find the credential offer data
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

      // Validate audience
      const baseUrl = getIssuerBaseUrl()
      if (proofPayload.aud !== baseUrl) {
        return {
          error: 'invalid_proof',
          error_description: `Invalid proof audience. Expected ${baseUrl}`,
        }
      }

      // Validate proof timing
      const now = Math.floor(Date.now() / 1000)
      const iat = proofPayload.iat
      if (!iat || iat > now + 60 || iat < now - 300) {
        return {
          error: 'invalid_proof',
          error_description: 'Proof JWT iat is invalid or expired',
        }
      }

      // Validate c_nonce — CRITICAL for replay attack prevention
      const proofNonce = proofPayload.nonce
      if (!proofNonce) {
        return {
          error: 'invalid_proof',
          error_description: 'Proof JWT must contain nonce claim',
        }
      }

      const storedNonce = await getNonceStorage().get(proofNonce)
      if (!storedNonce) {
        return {
          error: 'invalid_proof',
          error_description: 'Invalid or unknown nonce',
        }
      }

      if (new Date() > storedNonce.expiresAt) {
        await getNonceStorage().delete(proofNonce)
        return {
          error: 'invalid_proof',
          error_description: 'Nonce has expired',
        }
      }

      if (storedNonce.used) {
        return {
          error: 'invalid_proof',
          error_description: 'Nonce has already been used',
        }
      }

      await getNonceStorage().update(proofNonce, { used: true })
      logger.info('Nonce validated and marked as used', { nonce: proofNonce })

      // Cryptographic signature verification for ALL DID methods
      const proofIssuer = proofPayload.iss || (proofHeader.kid?.split('#')[0])
      if (proofIssuer && proofIssuer.startsWith('did:')) {
        try {
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

  // Determine credential type
  const configId = request.credential_configuration_id || ''
  const baseConfigId = configId.replace(/_sdjwt$/, '')
  const credentialTypes = request.credential_definition?.type
    || (baseConfigId ? ['VerifiableCredential', baseConfigId] : null)
    || ['VerifiableCredential', 'AIAgentIdentityCredential']
  const credentialType = credentialTypes[credentialTypes.length - 1]

  const requestedFormat = request.format
    || (configId.endsWith('_sdjwt') ? 'vc+sd-jwt' : 'jwt_vc_json')

  try {
    const credentialSubject = buildCredentialSubject(credentialType, holderDid, offerData)

    const signResult = await signCredentialDirect(
      holderDid,
      credentialType,
      credentialSubject,
      { format: requestedFormat as 'jwt_vc_json' | 'vc+sd-jwt' }
    )

    logger.info('Credential issued successfully', {
      format: signResult.format,
      credentialType,
      holderDid,
      jti: signResult.credentialId,
      storage: getStorageType(),
    })

    // Generate new nonce for potential follow-up requests
    const newNonce = uuidv4()
    const newNonceExpiresIn = 300

    const newStoredNonce: StoredNonce = {
      nonce: newNonce,
      tokenId: accessToken,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + newNonceExpiresIn * 1000),
      used: false,
    }
    await getNonceStorage().save(newNonce, newStoredNonce)

    return {
      format: signResult.format,
      credential: signResult.credential,
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
export function buildCredentialSubject(
  credentialType: string,
  holderDid: string,
  offerData: StoredCredentialOffer
): Record<string, unknown> {
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
