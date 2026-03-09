/**
 * Verifier Agent - JWT-VC verification (LEGACY/FALLBACK)
 *
 * Bu dosya Credo aktif olmadığında fallback olarak kullanılır.
 * Credo aktifken (askar kurulu), Credo Agent kullanılır.
 *
 * @deprecated Credo kurulduğunda bu modül yerine credo.agent.ts ve credo.service.ts kullanılır
 * @see credo.agent.ts - Credo tabanlı implementation
 */

import { v4 as uuidv4 } from 'uuid'
import * as jose from 'jose'
import {
  createBaseAgent,
  verifyJwtVc,
  resolveDidKey,
  BaseAgentInstance,
} from './base.agent'
import { verifierConfig } from '../config/agent.config'
import { logger } from '../utils/logger'
import { PresentationDefinition, VerificationResult } from '../types/credential.types'

let verifierAgent: BaseAgentInstance | null = null

// Verification sessions storage
const verificationSessions = new Map<string, {
  id: string
  presentationDefinition: PresentationDefinition
  state: 'created' | 'response_received' | 'verified' | 'error'
  createdAt: Date
  presentation?: string
  verificationResult?: VerificationResult
  nonce: string
}>()

export async function initializeVerifierAgent(): Promise<BaseAgentInstance> {
  if (verifierAgent) {
    return verifierAgent
  }

  verifierAgent = await createBaseAgent(verifierConfig, 'verifier')

  logger.info(`Verifier agent initialized with DID: ${verifierAgent.getDid()}`)

  return verifierAgent
}

export function getVerifierAgent(): BaseAgentInstance {
  if (!verifierAgent) {
    throw new Error('Verifier agent not initialized')
  }
  return verifierAgent
}

export function getVerifierDid(): string {
  return getVerifierAgent().getDid()
}

// Presentation definitions
export const agentIdentityPresentationDefinition: PresentationDefinition = {
  id: 'agent-identity-verification',
  input_descriptors: [
    {
      id: 'agent-identity',
      name: 'AI Agent Identity',
      purpose: 'Verify the AI agent identity',
      constraints: {
        fields: [
          { path: ['$.credentialSubject.agent_id', '$.vc.credentialSubject.agent_id'] },
          { path: ['$.credentialSubject.agent_type', '$.vc.credentialSubject.agent_type'] },
          { path: ['$.credentialSubject.owner_did', '$.vc.credentialSubject.owner_did'] },
        ],
      },
    },
  ],
}

export const delegationPresentationDefinition: PresentationDefinition = {
  id: 'delegation-verification',
  input_descriptors: [
    {
      id: 'delegation',
      name: 'Delegation Credential',
      purpose: 'Verify delegation from user to agent',
      constraints: {
        fields: [
          { path: ['$.credentialSubject.delegator_did', '$.vc.credentialSubject.delegator_did'] },
          { path: ['$.credentialSubject.delegate_did', '$.vc.credentialSubject.delegate_did'] },
          { path: ['$.credentialSubject.scope', '$.vc.credentialSubject.scope'] },
        ],
      },
    },
  ],
}

export const capabilityPresentationDefinition: PresentationDefinition = {
  id: 'capability-verification',
  input_descriptors: [
    {
      id: 'capability',
      name: 'Capability Credential',
      purpose: 'Verify capability permissions',
      constraints: {
        fields: [
          { path: ['$.credentialSubject.capability_type', '$.vc.credentialSubject.capability_type'] },
          { path: ['$.credentialSubject.resource', '$.vc.credentialSubject.resource'] },
          { path: ['$.credentialSubject.actions', '$.vc.credentialSubject.actions'] },
        ],
      },
    },
  ],
}

export const combinedPresentationDefinition: PresentationDefinition = {
  id: 'combined-verification',
  input_descriptors: [
    {
      id: 'agent-identity',
      name: 'AI Agent Identity',
      purpose: 'Verify agent identity',
      constraints: {
        fields: [
          { path: ['$.credentialSubject.agent_id', '$.vc.credentialSubject.agent_id'] },
          { path: ['$.credentialSubject.owner_did', '$.vc.credentialSubject.owner_did'] },
        ],
      },
    },
    {
      id: 'delegation',
      name: 'Delegation Credential',
      purpose: 'Verify delegation authority',
      constraints: {
        fields: [
          { path: ['$.credentialSubject.delegate_did', '$.vc.credentialSubject.delegate_did'] },
          { path: ['$.credentialSubject.scope', '$.vc.credentialSubject.scope'] },
        ],
      },
    },
  ],
}

/**
 * OpenID4VP authorization request oluştur
 */
export async function createVerificationRequest(
  presentationDefinition: PresentationDefinition
): Promise<{ requestUri: string; verificationSessionId: string }> {
  const agent = getVerifierAgent()
  const sessionId = uuidv4()
  const nonce = uuidv4()

  // Session oluştur
  verificationSessions.set(sessionId, {
    id: sessionId,
    presentationDefinition,
    state: 'created',
    createdAt: new Date(),
    nonce,
  })

  logger.info(`Verification request created: ${sessionId}`)

  // OpenID4VP authorization request
  const authRequest = {
    response_type: 'vp_token',
    client_id: agent.getDid(),
    redirect_uri: `${verifierConfig.endpoint}/api/v1/verifier/callback`,
    presentation_definition: presentationDefinition,
    nonce,
    state: sessionId,
    response_mode: 'direct_post',
  }

  // Request URI oluştur
  const requestUri = `openid4vp://?${new URLSearchParams({
    client_id: authRequest.client_id,
    request_uri: `${verifierConfig.endpoint}/api/v1/verifier/request/${sessionId}`,
  }).toString()}`

  return {
    requestUri,
    verificationSessionId: sessionId,
  }
}

/**
 * Authorization request bilgisini getir (request_uri için)
 */
export function getAuthorizationRequest(sessionId: string) {
  const session = verificationSessions.get(sessionId)
  if (!session) return null

  const agent = getVerifierAgent()

  return {
    response_type: 'vp_token',
    client_id: agent.getDid(),
    redirect_uri: `${verifierConfig.endpoint}/api/v1/verifier/callback`,
    presentation_definition: session.presentationDefinition,
    nonce: session.nonce,
    state: sessionId,
    response_mode: 'direct_post',
  }
}

/**
 * VP token submit et
 */
export async function submitPresentation(
  sessionId: string,
  vpToken: string
): Promise<VerificationResult> {
  const session = verificationSessions.get(sessionId)
  if (!session) {
    return { verified: false, errors: ['Session not found'] }
  }

  session.presentation = vpToken
  session.state = 'response_received'

  // VP token'ı doğrula
  const result = await verifyVpToken(vpToken, session.nonce)

  session.verificationResult = result
  session.state = result.verified ? 'verified' : 'error'

  verificationSessions.set(sessionId, session)

  return result
}

/**
 * VP token doğrula
 */
async function verifyVpToken(vpToken: string, expectedNonce: string): Promise<VerificationResult> {
  try {
    // JWT decode et (header + payload)
    const parts = vpToken.split('.')
    if (parts.length !== 3) {
      return { verified: false, errors: ['Invalid JWT format'] }
    }

    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())

    // Issuer DID'ini al
    const issuerDid = payload.iss
    if (!issuerDid) {
      return { verified: false, errors: ['Missing issuer'] }
    }

    // Issuer public key'i çöz
    const publicKey = await resolveDidKey(issuerDid)
    if (!publicKey) {
      return { verified: false, errors: ['Could not resolve issuer DID'] }
    }

    // İmzayı doğrula
    const verifyResult = await verifyJwtVc(vpToken, publicKey)
    if (!verifyResult.verified) {
      return { verified: false, errors: [verifyResult.error || 'Signature verification failed'] }
    }

    // Nonce kontrolü
    if (payload.nonce && payload.nonce !== expectedNonce) {
      return { verified: false, errors: ['Nonce mismatch'] }
    }

    // Expiration kontrolü
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return { verified: false, errors: ['Credential expired'] }
    }

    // VC içeriğini al
    const vc = payload.vc || {}
    const credentialSubject = vc.credentialSubject || payload.credentialSubject || {}

    logger.info('Presentation verified successfully')

    return {
      verified: true,
      credentialSubject,
      issuerDid,
      issuanceDate: payload.iat ? new Date(payload.iat * 1000).toISOString() : undefined,
      expirationDate: payload.exp ? new Date(payload.exp * 1000).toISOString() : undefined,
    }
  } catch (error) {
    logger.error('VP token verification error', { error })
    return { verified: false, errors: [(error as Error).message] }
  }
}

/**
 * Session durumunu getir
 */
export function getVerificationSession(sessionId: string) {
  return verificationSessions.get(sessionId)
}

/**
 * Session'ı doğrulama sonucuyla güncelle
 */
export async function verifyPresentation(sessionId: string): Promise<VerificationResult> {
  const session = verificationSessions.get(sessionId)
  if (!session) {
    return { verified: false, errors: ['Session not found'] }
  }

  if (session.state === 'created') {
    return { verified: false, errors: ['No presentation submitted'] }
  }

  if (session.verificationResult) {
    return session.verificationResult
  }

  return { verified: false, errors: ['Unknown error'] }
}

/**
 * Tüm verification session'larını getir
 */
export function getAllVerificationSessions() {
  return Array.from(verificationSessions.entries()).map(([id, session]) => ({
    id,
    definitionId: session.presentationDefinition.id,
    state: session.state,
    createdAt: session.createdAt,
  }))
}
