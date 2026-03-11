/**
 * Verifier Agent - Thin wrapper over openid4vp.service.ts
 *
 * Manages the verifier agent instance (DID, keys) and delegates all VP
 * session logic to the unified openid4vp.service.
 */

import {
  createBaseAgent,
  BaseAgentInstance,
} from './base.agent'
import { verifierConfig } from '../config/agent.config'
import { logger } from '../utils/logger'
import { PresentationDefinition, VerificationResult } from '../types/credential.types'
import {
  createAuthorizationRequest as openid4vpCreateAuthRequest,
  getVerificationResult as openid4vpGetResult,
} from '../services/openid4vp.service'

let verifierAgent: BaseAgentInstance | null = null

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

// Presentation definitions (used by verifier.routes.ts)
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
 * Create OpenID4VP authorization request.
 * Delegates entirely to openid4vp.service (which handles Credo-first + Jose fallback).
 */
export async function createVerificationRequest(
  presentationDefinition: PresentationDefinition
): Promise<{ requestUri: string; verificationSessionId: string }> {
  const result = await openid4vpCreateAuthRequest('', {
    customDefinition: presentationDefinition,
  })

  return {
    requestUri: result.authorizationRequestUri,
    verificationSessionId: result.sessionId,
  }
}

/**
 * Get verification result for a session.
 * Delegates to openid4vp.service for unified session lookup.
 */
export async function verifyPresentation(sessionId: string): Promise<VerificationResult> {
  const result = await openid4vpGetResult(sessionId)
  if (!result) {
    return { verified: false, errors: ['Session not found'] }
  }
  return result
}
