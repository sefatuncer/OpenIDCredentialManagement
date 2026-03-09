import { v4 as uuidv4 } from 'uuid'
import * as jose from 'jose'
import { logger } from '../utils/logger'
import { getVerifierDid } from '../agents/verifier.agent'
import { resolveDidKey } from '../agents/base.agent'
import {
  IStorageAdapter,
  createStorageAdapter,
  getStorageType,
} from '../core/storage'
import { isCredentialRevoked, getRevocationStatus } from './revocation.service'
// Credo Service import - Credo varsa onu kullan, yoksa Jose fallback
import {
  isUsingCredo,
  createVerificationRequest as credoCreateVerificationRequest,
  verifyPresentation as credoVerifyPresentation,
  getVerifierDid as credoGetVerifierDid,
} from './credo.service'

/**
 * OpenID4VP Service
 *
 * Implements the OpenID for Verifiable Presentations specification
 * https://openid.net/specs/openid-4-verifiable-presentations-1_0.html
 */

// Verification session storage type
interface VerificationSession {
  id: string
  presentationDefinition: PresentationDefinition
  nonce: string
  state: string
  responseUri: string
  clientId: string
  createdAt: Date
  expiresAt: Date
  status: 'pending' | 'submitted' | 'verified' | 'rejected' | 'expired'
  presentation?: any
  verificationResult?: VerificationResult
}

// Storage adapter (initialized lazily)
let vpSessionsStorage: IStorageAdapter<VerificationSession> | null = null

function getVPSessionsStorage(): IStorageAdapter<VerificationSession> {
  if (!vpSessionsStorage) {
    vpSessionsStorage = createStorageAdapter<VerificationSession>('vp_sessions')
    logger.info('VP sessions storage initialized', { type: getStorageType() })
  }
  return vpSessionsStorage
}

export interface PresentationDefinition {
  id: string
  name?: string
  purpose?: string
  input_descriptors: InputDescriptor[]
  submission_requirements?: SubmissionRequirement[]
}

export interface InputDescriptor {
  id: string
  name?: string
  purpose?: string
  group?: string[]
  constraints: {
    fields: FieldConstraint[]
    limit_disclosure?: 'required' | 'preferred'
  }
}

export interface FieldConstraint {
  path: string[]
  id?: string
  name?: string
  purpose?: string
  filter?: {
    type: string
    const?: any
    enum?: any[]
    pattern?: string
  }
  optional?: boolean
}

export interface SubmissionRequirement {
  name?: string
  purpose?: string
  rule: 'all' | 'pick'
  count?: number
  min?: number
  max?: number
  from?: string
  from_nested?: SubmissionRequirement[]
}

export interface AuthorizationRequest {
  response_type: string
  response_mode: string
  client_id: string
  redirect_uri?: string
  response_uri?: string
  scope?: string
  nonce: string
  state: string
  presentation_definition?: PresentationDefinition
  presentation_definition_uri?: string
  client_metadata?: ClientMetadata
}

export interface ClientMetadata {
  client_name?: string
  logo_uri?: string
  client_purpose?: string
  vp_formats?: Record<string, any>
}

export interface VerificationResult {
  verified: boolean
  credentialSubject?: any
  issuerDid?: string
  holderDid?: string
  issuanceDate?: string
  expirationDate?: string
  errors?: string[]
  warnings?: string[]
}

export interface PresentationSubmission {
  id: string
  definition_id: string
  descriptor_map: Array<{
    id: string
    format: string
    path: string
    path_nested?: {
      format: string
      path: string
    }
  }>
}

// Predefined presentation definitions
export const PRESENTATION_DEFINITIONS: Record<string, PresentationDefinition> = {
  'agent-identity': {
    id: 'agent-identity-verification',
    name: 'AI Agent Identity Verification',
    purpose: 'Verify the identity and capabilities of an AI agent',
    input_descriptors: [
      {
        id: 'agent_identity_credential',
        name: 'AI Agent Identity',
        purpose: 'Prove agent identity',
        constraints: {
          fields: [
            {
              path: ['$.type'],
              filter: {
                type: 'array',
                const: ['VerifiableCredential', 'AIAgentIdentityCredential'],
              },
            },
            {
              path: ['$.credentialSubject.agent_id'],
              name: 'Agent ID',
              purpose: 'Unique identifier for the agent',
            },
            {
              path: ['$.credentialSubject.agent_type'],
              name: 'Agent Type',
              purpose: 'Type of the AI agent',
            },
            {
              path: ['$.credentialSubject.owner_did'],
              name: 'Owner DID',
              purpose: 'DID of the agent owner',
            },
            {
              path: ['$.credentialSubject.capabilities'],
              name: 'Capabilities',
              purpose: 'Agent capabilities',
              optional: true,
            },
            {
              path: ['$.credentialSubject.trust_level'],
              name: 'Trust Level',
              purpose: 'Agent trust level',
              optional: true,
            },
          ],
        },
      },
    ],
  },
  delegation: {
    id: 'delegation-verification',
    name: 'Delegation Verification',
    purpose: 'Verify delegation authority from user to agent',
    input_descriptors: [
      {
        id: 'delegation_credential',
        name: 'Delegation Credential',
        purpose: 'Prove delegation authority',
        constraints: {
          fields: [
            {
              path: ['$.type'],
              filter: {
                type: 'array',
                const: ['VerifiableCredential', 'DelegationCredential'],
              },
            },
            {
              path: ['$.credentialSubject.delegator_did'],
              name: 'Delegator DID',
            },
            {
              path: ['$.credentialSubject.delegate_did'],
              name: 'Delegate DID',
            },
            {
              path: ['$.credentialSubject.scope'],
              name: 'Scope',
              purpose: 'Delegated permissions',
            },
            {
              path: ['$.credentialSubject.valid_until'],
              name: 'Valid Until',
              purpose: 'Delegation expiration',
            },
          ],
        },
      },
    ],
  },
  capability: {
    id: 'capability-verification',
    name: 'Capability Verification',
    purpose: 'Verify specific capability granted to an agent',
    input_descriptors: [
      {
        id: 'capability_credential',
        name: 'Capability Credential',
        purpose: 'Prove granted capability',
        constraints: {
          fields: [
            {
              path: ['$.type'],
              filter: {
                type: 'array',
                const: ['VerifiableCredential', 'CapabilityCredential'],
              },
            },
            {
              path: ['$.credentialSubject.capability_type'],
              name: 'Capability Type',
            },
            {
              path: ['$.credentialSubject.resource'],
              name: 'Resource',
            },
            {
              path: ['$.credentialSubject.actions'],
              name: 'Actions',
            },
          ],
        },
      },
    ],
  },
  combined: {
    id: 'combined-verification',
    name: 'Combined Agent and Delegation Verification',
    purpose: 'Verify both agent identity and delegation authority',
    input_descriptors: [
      {
        id: 'agent_identity_credential',
        name: 'AI Agent Identity',
        purpose: 'Prove agent identity',
        group: ['identity'],
        constraints: {
          fields: [
            {
              path: ['$.credentialSubject.agent_id'],
            },
            {
              path: ['$.credentialSubject.owner_did'],
            },
          ],
        },
      },
      {
        id: 'delegation_credential',
        name: 'Delegation Credential',
        purpose: 'Prove delegation authority',
        group: ['delegation'],
        constraints: {
          fields: [
            {
              path: ['$.credentialSubject.delegate_did'],
            },
            {
              path: ['$.credentialSubject.scope'],
            },
          ],
        },
      },
    ],
    submission_requirements: [
      {
        name: 'Identity and Delegation',
        rule: 'all',
        from: 'identity',
      },
      {
        name: 'Identity and Delegation',
        rule: 'all',
        from: 'delegation',
      },
    ],
  },
}

/**
 * Get verifier base URL
 */
export function getVerifierBaseUrl(): string {
  // Use API Gateway URL for direct_post endpoint (not the verifier agent directly)
  // This is required because the direct_post endpoint is on the API gateway
  return process.env.API_GATEWAY_URL || process.env.VERIFIER_BASE_URL || 'http://localhost:3000'
}

/**
 * Get verifier client metadata
 */
export function getVerifierClientMetadata(): ClientMetadata {
  return {
    client_name: 'AI Agent Identity Verifier',
    logo_uri: `${getVerifierBaseUrl()}/logo.png`,
    client_purpose: 'Verify AI agent credentials',
    vp_formats: {
      jwt_vp: {
        alg: ['EdDSA', 'ES256'],
      },
      jwt_vc: {
        alg: ['EdDSA', 'ES256'],
      },
    },
  }
}

/**
 * Create an authorization request for credential verification
 * Credo varsa Credo'yu, yoksa Jose-based implementation'ı kullanır
 */
export async function createAuthorizationRequest(
  presentationDefinitionId: string,
  options: {
    customDefinition?: PresentationDefinition
    expiresInSeconds?: number
    redirectUri?: string
  } = {}
): Promise<{
  sessionId: string
  authorizationRequest: AuthorizationRequest
  authorizationRequestUri: string
}> {
  // Get presentation definition
  const presentationDefinition =
    options.customDefinition || PRESENTATION_DEFINITIONS[presentationDefinitionId]

  if (!presentationDefinition) {
    throw new Error(`Unknown presentation definition: ${presentationDefinitionId}`)
  }

  // Credo kullanılabilirse öncelikli olarak onu kullan
  if (isUsingCredo()) {
    const credoResult = await credoCreateVerificationRequest(presentationDefinition)

    if (credoResult) {
      const sessionId = credoResult.verificationSession?.id || uuidv4()

      // Jose storage'a da kaydet (hybrid mode için)
      const session: VerificationSession = {
        id: sessionId,
        presentationDefinition,
        nonce: uuidv4(),
        state: uuidv4(),
        responseUri: credoResult.authorizationRequestUri,
        clientId: (await credoGetVerifierDid()) || getVerifierDid(),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + (options.expiresInSeconds || 300) * 1000),
        status: 'pending',
      }
      await getVPSessionsStorage().save(sessionId, session)

      logger.info('Created authorization request via Credo', {
        sessionId,
        presentationDefinitionId: presentationDefinition.id,
        mode: 'credo',
      })

      // Credo'dan gelen authorization request'i standart formata dönüştür
      const authorizationRequest: AuthorizationRequest = {
        response_type: 'vp_token',
        response_mode: 'direct_post',
        client_id: (await credoGetVerifierDid()) || getVerifierDid(),
        response_uri: credoResult.authorizationRequestUri,
        nonce: session.nonce,
        state: session.state,
        presentation_definition: presentationDefinition,
        client_metadata: getVerifierClientMetadata(),
      }

      return {
        sessionId,
        authorizationRequest,
        authorizationRequestUri: credoResult.authorizationRequestUri,
      }
    }
    // Credo başarısız olursa Jose fallback'e düş
    logger.warn('Credo verification request failed, falling back to Jose')
  }

  // Jose-based implementation (fallback)
  const baseUrl = getVerifierBaseUrl()
  const sessionId = uuidv4()
  const nonce = uuidv4()
  const state = uuidv4()
  const expiresIn = options.expiresInSeconds || 300 // 5 minutes default

  const responseUri = `${baseUrl}/direct_post`

  const authorizationRequest: AuthorizationRequest = {
    response_type: 'vp_token',
    response_mode: 'direct_post',
    client_id: getVerifierDid(),
    response_uri: responseUri,
    nonce,
    state,
    presentation_definition: presentationDefinition,
    client_metadata: getVerifierClientMetadata(),
  }

  // Store session using storage adapter
  const session: VerificationSession = {
    id: sessionId,
    presentationDefinition,
    nonce,
    state,
    responseUri,
    clientId: getVerifierDid(),
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    status: 'pending',
  }
  await getVPSessionsStorage().save(sessionId, session)

  // Create authorization request URI
  const params = new URLSearchParams()
  params.set('response_type', authorizationRequest.response_type)
  params.set('response_mode', authorizationRequest.response_mode)
  params.set('client_id', authorizationRequest.client_id)
  params.set('response_uri', authorizationRequest.response_uri!)
  params.set('nonce', authorizationRequest.nonce)
  params.set('state', authorizationRequest.state)
  params.set('presentation_definition', JSON.stringify(presentationDefinition))
  params.set('client_metadata', JSON.stringify(authorizationRequest.client_metadata))

  const authorizationRequestUri = `openid4vp://?${params.toString()}`

  logger.info('Created authorization request', {
    sessionId,
    presentationDefinitionId: presentationDefinition.id,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    mode: 'jose',
  })

  return {
    sessionId,
    authorizationRequest,
    authorizationRequestUri,
  }
}

/**
 * Get session by state parameter
 */
export async function getSessionByState(state: string): Promise<VerificationSession | undefined> {
  const result = await getVPSessionsStorage().query({
    where: { state },
    limit: 1,
  })
  return result.data[0]
}

/**
 * Get verification session
 */
export async function getVerificationSession(sessionId: string): Promise<{
  session: VerificationSession
  expired: boolean
} | null> {
  const session = await getVPSessionsStorage().get(sessionId)
  if (!session) {
    return null
  }

  return {
    session,
    expired: new Date() > new Date(session.expiresAt),
  }
}

/**
 * Handle direct_post submission of VP token
 */
export async function handleDirectPost(
  vpToken: string,
  presentationSubmission: PresentationSubmission,
  state: string
): Promise<{
  redirect_uri?: string
  error?: string
  error_description?: string
}> {
  // Find session by state
  const session = await getSessionByState(state)
  if (!session) {
    return {
      error: 'invalid_request',
      error_description: 'Invalid state parameter',
    }
  }

  // Check if expired
  if (new Date() > new Date(session.expiresAt)) {
    await getVPSessionsStorage().update(session.id, { status: 'expired' })
    return {
      error: 'expired_request',
      error_description: 'Authorization request has expired',
    }
  }

  // Check if already submitted
  if (session.status !== 'pending') {
    return {
      error: 'invalid_request',
      error_description: 'Request already processed',
    }
  }

  try {
    // Verify the VP token
    const verificationResult = await verifyVPToken(vpToken, session)

    if (verificationResult.verified) {
      await getVPSessionsStorage().update(session.id, {
        status: 'verified',
        presentation: vpToken,
        verificationResult,
      })
      logger.info('Presentation verified successfully', { sessionId: session.id })
    } else {
      await getVPSessionsStorage().update(session.id, {
        status: 'rejected',
        presentation: vpToken,
        verificationResult,
      })
      logger.warn('Presentation verification failed', {
        sessionId: session.id,
        errors: verificationResult.errors,
      })
    }

    return {}
  } catch (error) {
    logger.error('Error processing presentation', { error })
    await getVPSessionsStorage().update(session.id, {
      status: 'rejected',
      verificationResult: {
        verified: false,
        errors: [(error as Error).message],
      },
    })

    return {
      error: 'invalid_presentation',
      error_description: (error as Error).message,
    }
  }
}

/**
 * Verify VP token using Jose-based verification
 */
async function verifyVPToken(
  vpToken: string,
  session: VerificationSession
): Promise<VerificationResult> {
  try {
    // Parse JWT
    const parts = vpToken.split('.')
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format')
    }

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())

    // Check nonce
    if (payload.nonce !== session.nonce) {
      return {
        verified: false,
        errors: ['Nonce mismatch'],
      }
    }

    // Check expiration
    if (payload.exp && payload.exp < Date.now() / 1000) {
      return {
        verified: false,
        errors: ['Presentation expired'],
      }
    }

    // Verify VP signature using did:key resolution
    const holderDid = payload.iss
    let vpSignatureVerified = false
    const warnings: string[] = []

    if (holderDid && holderDid.startsWith('did:key:')) {
      try {
        const publicKey = await resolveDidKey(holderDid)
        if (publicKey) {
          await jose.jwtVerify(vpToken, publicKey)
          vpSignatureVerified = true
          logger.info('VP signature verified successfully', { holderDid })
        } else {
          warnings.push('Could not resolve holder DID public key')
        }
      } catch (sigError) {
        warnings.push('VP signature verification failed: ' + (sigError as Error).message)
      }
    } else {
      warnings.push('Unsupported holder DID method: ' + holderDid)
    }

    // Extract credential info from VP
    const vp = payload.vp || payload
    const credentials = vp.verifiableCredential || []

    // Verify embedded VC signatures
    let vcSignatureVerified = false
    let credentialSubject: any = null
    let issuerDid: string | undefined
    let issuanceDate: string | undefined
    let expirationDate: string | undefined

    for (const credential of credentials) {
      if (typeof credential === 'string') {
        try {
          const credParts = credential.split('.')
          if (credParts.length === 3) {
            const credPayload = JSON.parse(Buffer.from(credParts[1], 'base64url').toString())

            // Check credential expiration
            if (credPayload.exp && credPayload.exp < Date.now() / 1000) {
              warnings.push('Embedded credential expired')
              continue
            }

            // Verify VC signature
            const vcIssuerDid = credPayload.iss
            if (vcIssuerDid && vcIssuerDid.startsWith('did:key:')) {
              const vcPublicKey = await resolveDidKey(vcIssuerDid)
              if (vcPublicKey) {
                try {
                  await jose.jwtVerify(credential, vcPublicKey)
                  vcSignatureVerified = true
                  logger.info('VC signature verified successfully', { issuerDid: vcIssuerDid })
                } catch (vcSigError) {
                  warnings.push('VC signature verification failed: ' + (vcSigError as Error).message)
                }
              }
            }

            // Check credential revocation status - CRITICAL security check
            const credentialId = credPayload.jti || credPayload.vc?.id
            if (credentialId) {
              try {
                const revoked = await isCredentialRevoked(credentialId)
                if (revoked) {
                  logger.warn('Credential has been revoked', { credentialId })
                  return {
                    verified: false,
                    errors: ['Credential has been revoked'],
                    credentialSubject: credPayload.vc?.credentialSubject,
                    issuerDid: vcIssuerDid,
                    holderDid,
                  }
                }

                // Also check StatusList2021 if credential has credentialStatus
                const credentialStatus = credPayload.vc?.credentialStatus
                if (credentialStatus && credentialStatus.type === 'StatusList2021Entry') {
                  const statusResult = await getRevocationStatus(
                    credentialStatus.statusListCredential,
                    credentialStatus.statusListIndex
                  )
                  if (statusResult.revoked) {
                    logger.warn('Credential revoked via StatusList2021', {
                      credentialId,
                      statusListIndex: credentialStatus.statusListIndex
                    })
                    return {
                      verified: false,
                      errors: ['Credential has been revoked (StatusList2021)'],
                      credentialSubject: credPayload.vc?.credentialSubject,
                      issuerDid: vcIssuerDid,
                      holderDid,
                    }
                  }
                }

                logger.info('Credential revocation check passed', { credentialId })
              } catch (revocationError) {
                // Log but don't fail on revocation check errors (optional endpoint)
                logger.warn('Revocation check failed, continuing with verification', {
                  error: (revocationError as Error).message,
                  credentialId
                })
              }
            }

            // Extract credential data
            credentialSubject = credPayload.vc?.credentialSubject || credPayload.credentialSubject
            issuerDid = vcIssuerDid
            issuanceDate = credPayload.iat ? new Date(credPayload.iat * 1000).toISOString() : undefined
            expirationDate = credPayload.exp ? new Date(credPayload.exp * 1000).toISOString() : undefined
          }
        } catch (parseError) {
          warnings.push('Failed to parse embedded credential: ' + (parseError as Error).message)
        }
      }
    }

    // Determine overall verification status
    const verified = vpSignatureVerified && vcSignatureVerified

    if (verified) {
      return {
        verified: true,
        credentialSubject,
        issuerDid,
        holderDid,
        issuanceDate,
        expirationDate,
        warnings: warnings.length > 0 ? warnings : undefined,
      }
    } else {
      return {
        verified: false,
        errors: warnings.length > 0 ? warnings : ['Signature verification failed'],
        credentialSubject,
        issuerDid,
        holderDid,
      }
    }
  } catch (error) {
    return {
      verified: false,
      errors: ['Failed to verify presentation: ' + (error as Error).message],
    }
  }
}

/**
 * Get verification result for a session
 */
export async function getVerificationResult(sessionId: string): Promise<VerificationResult | null> {
  const session = await getVPSessionsStorage().get(sessionId)
  if (!session) {
    return null
  }

  if (session.status === 'pending') {
    return {
      verified: false,
      errors: ['Presentation not yet submitted'],
    }
  }

  if (session.status === 'expired') {
    return {
      verified: false,
      errors: ['Session expired'],
    }
  }

  return session.verificationResult || null
}

/**
 * List all verification sessions (admin)
 */
export async function listVerificationSessions(): Promise<Array<{
  sessionId: string
  presentationDefinitionId: string
  status: string
  createdAt: Date
  expiresAt: Date
  expired: boolean
}>> {
  const allSessions = await getVPSessionsStorage().list()
  const now = new Date()

  return allSessions.map((session) => ({
    sessionId: session.id,
    presentationDefinitionId: session.presentationDefinition.id,
    status: session.status,
    createdAt: new Date(session.createdAt),
    expiresAt: new Date(session.expiresAt),
    expired: now > new Date(session.expiresAt),
  }))
}

/**
 * Get available presentation definitions
 */
export function getAvailablePresentationDefinitions(): Array<{
  id: string
  name?: string
  purpose?: string
}> {
  return Object.entries(PRESENTATION_DEFINITIONS).map(([key, def]) => ({
    id: key,
    name: def.name,
    purpose: def.purpose,
  }))
}

/**
 * Cleanup expired sessions
 */
export async function cleanupExpiredSessions(): Promise<{ removed: number }> {
  let removed = 0
  const now = new Date()
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

  const allSessions = await getVPSessionsStorage().list()

  for (const session of allSessions) {
    const sessionExpiresAt = new Date(session.expiresAt)
    const sessionCreatedAt = new Date(session.createdAt)

    // Mark as expired if pending and past expiration
    if (now > sessionExpiresAt && session.status === 'pending') {
      await getVPSessionsStorage().update(session.id, { status: 'expired' })
    }

    // Remove sessions older than 1 hour
    if (sessionCreatedAt < oneHourAgo) {
      const deleted = await getVPSessionsStorage().delete(session.id)
      if (deleted) removed++
    }
  }

  if (removed > 0) {
    logger.info('Cleaned up expired verification sessions', { removed, storage: getStorageType() })
  }

  return { removed }
}

// Run cleanup every 5 minutes
setInterval(() => cleanupExpiredSessions().catch(err => logger.error('Cleanup error', err)), 5 * 60 * 1000)
