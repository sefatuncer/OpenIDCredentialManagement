/**
 * Credo Agent API Wrappers
 *
 * Issuer, Verifier, and Holder API functions that use the Credo agent.
 * Extracted from credo.agent.ts for modularity.
 */

import { ClaimFormat } from '@credo-ts/core'
import { logger } from '../utils/logger'
import { getCredoAgent, isCredoAgentReady, getAgentDid } from './credo.agent'

// ==================== ISSUER API ====================

/**
 * Credential offer oluştur
 */
export async function createCredoCredentialOffer(
  credentialConfigurationIds: string[],
  options?: {
    preAuthorizedCodeFlowConfig?: {
      txCode?: { inputMode?: string; length?: number }
    }
  }
): Promise<{
  credentialOffer: any
  credentialOfferUri: string
  issuanceSession: any
} | null> {
  const agent = getCredoAgent()
  if (!agent || !isCredoAgentReady()) {
    return null
  }

  try {
    const issuerApi = agent.modules.openId4Vc.issuer

    const issuers = await issuerApi.getAllIssuers()
    let issuer = issuers[0]

    if (!issuer) {
      issuer = await issuerApi.createIssuer({
        credentialConfigurationsSupported: {
          AIAgentIdentityCredential: {
            format: ClaimFormat.JwtVc,
            credential_definition: {
              type: ['VerifiableCredential', 'AIAgentIdentityCredential'],
            },
          },
          DelegationCredential: {
            format: ClaimFormat.JwtVc,
            credential_definition: {
              type: ['VerifiableCredential', 'DelegationCredential'],
            },
          },
          CapabilityCredential: {
            format: ClaimFormat.JwtVc,
            credential_definition: {
              type: ['VerifiableCredential', 'CapabilityCredential'],
            },
          },
        },
      })
    }

    const result = await issuerApi.createCredentialOffer({
      issuerId: issuer.issuerId,
      credentialConfigurationIds,
      preAuthorizedCodeFlowConfig: options?.preAuthorizedCodeFlowConfig || {},
    })

    const credentialOfferUri = result.credentialOffer
    let credentialOfferObject: any = null

    try {
      const offerUrl = new URL(credentialOfferUri)
      const offerEndpoint = offerUrl.searchParams.get('credential_offer_uri')
      if (offerEndpoint) {
        const response = await fetch(offerEndpoint)
        if (response.ok) {
          credentialOfferObject = await response.json()
        }
      }
    } catch {
      logger.debug('Could not fetch Credo offer endpoint, using URI directly')
    }

    logger.info('Credential offer created via Credo', {
      credentialConfigurationIds,
    })

    return {
      credentialOffer: credentialOfferObject || credentialOfferUri,
      credentialOfferUri,
      issuanceSession: result.issuanceSession,
    }
  } catch (error) {
    logger.error('Failed to create credential offer via Credo', { error: (error as Error).message })
    return null
  }
}

// ==================== VERIFIER API ====================

/**
 * Verification request oluştur
 */
export async function createCredoVerificationRequest(
  presentationDefinition: any
): Promise<{
  authorizationRequest: any
  authorizationRequestUri: string
  verificationSession: any
} | null> {
  const agent = getCredoAgent()
  if (!agent || !isCredoAgentReady()) {
    return null
  }

  try {
    const verifierApi = agent.modules.openId4Vc.verifier

    const verifiers = await verifierApi.getAllVerifiers()
    let verifier = verifiers[0]

    if (!verifier) {
      verifier = await verifierApi.createVerifier({})
    }

    const agentDidStr = await getAgentDid()
    const dids = await agent.dids.getCreatedDids({ method: 'key' })
    const didRecord = dids[0]
    const verificationMethodId = didRecord?.did ? `${didRecord.did}#${didRecord.did.split(':').pop()}` : agentDidStr

    const result = await verifierApi.createAuthorizationRequest({
      verifierId: verifier.verifierId,
      version: 'v1.draft24' as any,
      requestSigner: {
        method: 'did',
        didUrl: verificationMethodId,
      },
      presentationExchange: {
        definition: presentationDefinition,
      },
      responseMode: 'direct_post' as any,
    })

    const authorizationRequestUri = result.authorizationRequest

    logger.info('Verification request created via Credo', {
      definitionId: presentationDefinition.id,
    })

    return {
      authorizationRequest: result.authorizationRequest,
      authorizationRequestUri,
      verificationSession: result.verificationSession,
    }
  } catch (error) {
    logger.error('Failed to create verification request via Credo', { error: (error as Error).message })
    return null
  }
}

/**
 * Verification session getir
 */
export async function getCredoVerificationSession(sessionId: string): Promise<any | null> {
  const agent = getCredoAgent()
  if (!agent || !isCredoAgentReady()) {
    return null
  }

  try {
    const verifierApi = agent.modules.openId4Vc.verifier
    return await verifierApi.getVerificationSessionById(sessionId)
  } catch (error) {
    logger.error('Failed to get verification session', { error: (error as Error).message })
    return null
  }
}

// ==================== HOLDER API ====================

/**
 * Credential offer kabul et
 */
export async function acceptCredoCredentialOffer(
  credentialOfferUri: string
): Promise<{
  credentials: any[]
} | null> {
  const agent = getCredoAgent()
  if (!agent || !isCredoAgentReady()) {
    return null
  }

  try {
    const holderApi = agent.modules.openId4Vc.holder

    const resolvedOffer = await holderApi.resolveCredentialOffer(credentialOfferUri)
    const tokenResponse = await holderApi.requestToken({
      resolvedCredentialOffer: resolvedOffer,
    })
    const credentialResponse = await holderApi.requestCredentials({
      resolvedCredentialOffer: resolvedOffer,
      ...tokenResponse,
    })

    logger.info('Credential received via Credo', { count: credentialResponse.length })

    return { credentials: credentialResponse }
  } catch (error) {
    logger.error('Failed to accept credential offer via Credo', { error: (error as Error).message })
    return null
  }
}

/**
 * Presentation oluştur ve gönder
 */
export async function submitCredoPresentation(
  authorizationRequestUri: string
): Promise<{
  submitted: boolean
  result?: any
} | null> {
  const agent = getCredoAgent()
  if (!agent || !isCredoAgentReady()) {
    return null
  }

  try {
    const holderApi = agent.modules.openId4Vc.holder

    const resolvedRequest = await holderApi.resolveOpenId4VpAuthorizationRequest(authorizationRequestUri)
    const result = await holderApi.acceptOpenId4VpAuthorizationRequest({
      authorizationRequest: resolvedRequest,
    })

    logger.info('Presentation submitted via Credo')

    return {
      submitted: true,
      result,
    }
  } catch (error) {
    logger.error('Failed to submit presentation via Credo', { error: (error as Error).message })
    return null
  }
}
