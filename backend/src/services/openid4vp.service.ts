/**
 * OpenID4VP Service — Config, Sessions, and Barrel
 *
 * Implements the OpenID for Verifiable Presentations specification.
 * https://openid.net/specs/openid-4-verifiable-presentations-1_0.html
 *
 * Verification engine extracted to openid4vp-verification.service.ts.
 */

import { v4 as uuidv4 } from 'uuid'
import { logger } from '../utils/logger'
import { getVerifierDid } from '../agents/verifier.agent'
import {
  IStorageAdapter,
  createStorageAdapter,
  getStorageType,
} from '../core/storage'
import { saveTenantData, listTenantData } from './tenant-storage.service'
import {
  createVerificationRequest as credoCreateVerificationRequest,
  getVerifierDid as credoGetVerifierDid,
} from './credo.service'
import {
  handleDirectPost as handleDirectPostImpl,
  getVerificationResult as getVerificationResultImpl,
} from './openid4vp-verification.service'

// ==================== Types ====================

export interface VerificationSession {
  id: string
  presentationDefinition: PresentationDefinition
  nonce: string
  state: string
  responseUri: string
  clientId: string
  createdAt: Date
  expiresAt: Date
  status: 'pending' | 'submitted' | 'verified' | 'rejected' | 'expired'
  presentation?: string
  verificationResult?: VerificationResult
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
    const?: string | number | boolean | string[]
    enum?: (string | number | boolean)[]
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
  client_id_scheme?: string
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
  vp_formats?: Record<string, Record<string, string[]>>
}

export interface VerificationResult {
  verified: boolean
  credentialSubject?: Record<string, unknown>
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

// ==================== Storage ====================

let vpSessionsStorage: IStorageAdapter<VerificationSession> | null = null

function getVPSessionsStorage(): IStorageAdapter<VerificationSession> {
  if (!vpSessionsStorage) {
    vpSessionsStorage = createStorageAdapter<VerificationSession>('vp_sessions')
    logger.info('VP sessions storage initialized', { type: getStorageType() })
  }
  return vpSessionsStorage
}

// ==================== Presentation Definitions ====================

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
            { path: ['$.type'], filter: { type: 'array', const: ['VerifiableCredential', 'AIAgentIdentityCredential'] } },
            { path: ['$.credentialSubject.agent_id'], name: 'Agent ID', purpose: 'Unique identifier for the agent' },
            { path: ['$.credentialSubject.agent_type'], name: 'Agent Type', purpose: 'Type of the AI agent' },
            { path: ['$.credentialSubject.owner_did'], name: 'Owner DID', purpose: 'DID of the agent owner' },
            { path: ['$.credentialSubject.capabilities'], name: 'Capabilities', purpose: 'Agent capabilities', optional: true },
            { path: ['$.credentialSubject.trust_level'], name: 'Trust Level', purpose: 'Agent trust level', optional: true },
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
            { path: ['$.type'], filter: { type: 'array', const: ['VerifiableCredential', 'DelegationCredential'] } },
            { path: ['$.credentialSubject.delegator_did'], name: 'Delegator DID' },
            { path: ['$.credentialSubject.delegate_did'], name: 'Delegate DID' },
            { path: ['$.credentialSubject.scope'], name: 'Scope', purpose: 'Delegated permissions' },
            { path: ['$.credentialSubject.valid_until'], name: 'Valid Until', purpose: 'Delegation expiration' },
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
            { path: ['$.type'], filter: { type: 'array', const: ['VerifiableCredential', 'CapabilityCredential'] } },
            { path: ['$.credentialSubject.capability_type'], name: 'Capability Type' },
            { path: ['$.credentialSubject.resource'], name: 'Resource' },
            { path: ['$.credentialSubject.actions'], name: 'Actions' },
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
            { path: ['$.credentialSubject.agent_id'] },
            { path: ['$.credentialSubject.owner_did'] },
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
            { path: ['$.credentialSubject.delegate_did'] },
            { path: ['$.credentialSubject.scope'] },
          ],
        },
      },
    ],
    submission_requirements: [
      { name: 'Identity and Delegation', rule: 'all', from: 'identity' },
      { name: 'Identity and Delegation', rule: 'all', from: 'delegation' },
    ],
  },
}

// ==================== Config ====================

export function getVerifierBaseUrl(): string {
  return process.env.API_GATEWAY_URL || process.env.VERIFIER_BASE_URL || 'http://localhost:3000'
}

export function getVerifierClientMetadata(): ClientMetadata {
  return {
    client_name: 'AI Agent Identity Verifier',
    logo_uri: `${getVerifierBaseUrl()}/logo.png`,
    client_purpose: 'Verify AI agent credentials',
    vp_formats: {
      jwt_vp: { alg: ['EdDSA', 'ES256'] },
      jwt_vc: { alg: ['EdDSA', 'ES256'] },
    },
  }
}

// ==================== Session Management ====================

export async function createAuthorizationRequest(
  presentationDefinitionId: string,
  options: {
    customDefinition?: PresentationDefinition
    expiresInSeconds?: number
    redirectUri?: string
    tenantId?: string
  } = {}
): Promise<{
  sessionId: string
  authorizationRequest: AuthorizationRequest
  authorizationRequestUri: string
}> {
  const presentationDefinition =
    options.customDefinition || PRESENTATION_DEFINITIONS[presentationDefinitionId]

  if (!presentationDefinition) {
    throw new Error(`Unknown presentation definition: ${presentationDefinitionId}`)
  }

  const credoResult = await credoCreateVerificationRequest(presentationDefinition)

  if (!credoResult) {
    throw new Error('Credo verification request creation failed')
  }

  const sessionId = credoResult.verificationSession?.id || uuidv4()
  const credoClientId = (await credoGetVerifierDid()) || getVerifierDid()

  const session: VerificationSession = {
    id: sessionId,
    presentationDefinition,
    nonce: uuidv4(),
    state: sessionId,
    responseUri: credoResult.authorizationRequestUri,
    clientId: credoClientId,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + (options.expiresInSeconds || 300) * 1000),
    status: 'pending',
  }
  await saveTenantData(getVPSessionsStorage(), sessionId, options.tenantId, session)

  logger.info('Created authorization request via Credo', {
    sessionId,
    presentationDefinitionId: presentationDefinition.id,
    mode: 'credo',
  })

  const authorizationRequest: AuthorizationRequest = {
    response_type: 'vp_token',
    response_mode: 'direct_post',
    client_id: credoClientId,
    client_id_scheme: 'did',
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

export async function getSessionByState(state: string): Promise<VerificationSession | undefined> {
  const result = await getVPSessionsStorage().query({
    where: { state },
    limit: 1,
  })
  return result.data[0]
}

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

// ==================== Delegated to Verification Module ====================

export async function handleDirectPost(
  vpToken: string,
  presentationSubmission: PresentationSubmission,
  state: string
): Promise<{
  redirect_uri?: string
  error?: string
  error_description?: string
}> {
  return handleDirectPostImpl(vpToken, presentationSubmission, state, {
    getSessionByState,
    getStorage: getVPSessionsStorage,
  })
}

export async function getVerificationResult(sessionId: string): Promise<VerificationResult | null> {
  return getVerificationResultImpl(sessionId, getVPSessionsStorage)
}

// ==================== Admin ====================

export async function listVerificationSessions(tenantId?: string): Promise<Array<{
  sessionId: string
  presentationDefinitionId: string
  status: string
  createdAt: Date
  expiresAt: Date
  expired: boolean
}>> {
  const allSessions = await listTenantData(getVPSessionsStorage(), tenantId)
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

// ==================== Cleanup ====================

export async function cleanupExpiredSessions(): Promise<{ removed: number }> {
  let removed = 0
  const now = new Date()
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

  const allSessions = await getVPSessionsStorage().list()

  for (const session of allSessions) {
    const sessionExpiresAt = new Date(session.expiresAt)
    const sessionCreatedAt = new Date(session.createdAt)

    if (now > sessionExpiresAt && session.status === 'pending') {
      await getVPSessionsStorage().update(session.id, { status: 'expired' })
    }

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
