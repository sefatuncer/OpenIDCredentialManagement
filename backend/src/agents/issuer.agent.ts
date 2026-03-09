/**
 * Issuer Agent - JWT-VC credential issuance (PRIMARY)
 *
 * Ana credential issuance implementation. Native modül gerektirmez.
 * OpenID4VCI standardını destekler.
 */

import { v4 as uuidv4 } from 'uuid'
import {
  createBaseAgent,
  createJwtVc,
  BaseAgentInstance,
} from './base.agent'
import { issuerConfig } from '../config/agent.config'
import { logger } from '../utils/logger'
import {
  AgentIdentityCredentialSubject,
  DelegationCredentialSubject,
  CapabilityCredentialSubject,
} from '../config/credentials.config'

let issuerAgent: BaseAgentInstance | null = null

// Credential offer storage
const credentialOffers = new Map<string, {
  type: string
  subject: Record<string, unknown>
  holderDid: string
  createdAt: Date
  accessToken?: string
}>()

// Issued credentials storage
const issuedCredentials = new Map<string, {
  jwt: string
  type: string
  holderDid: string
  issuedAt: Date
}>()

export async function initializeIssuerAgent(): Promise<BaseAgentInstance> {
  if (issuerAgent) {
    return issuerAgent
  }

  issuerAgent = await createBaseAgent(issuerConfig, 'issuer')

  logger.info(`Issuer agent initialized with DID: ${issuerAgent.getDid()}`)

  return issuerAgent
}

export function getIssuerAgent(): BaseAgentInstance {
  if (!issuerAgent) {
    throw new Error('Issuer agent not initialized')
  }
  return issuerAgent
}

export function getIssuerDid(): string {
  return getIssuerAgent().getDid()
}

export function getIssuerKid(): string {
  return getIssuerAgent().getKid()
}

/**
 * OpenID4VCI credential offer oluştur
 */
export async function issueAgentIdentityCredential(
  holderDid: string,
  subject: Partial<AgentIdentityCredentialSubject>
): Promise<{ credentialOfferId: string; credentialOfferUri: string }> {
  const agent = getIssuerAgent()
  const offerId = uuidv4()

  // Access token oluştur (pre-authorized code flow)
  const accessToken = uuidv4()

  // Credential subject'i tamamla
  const fullSubject: AgentIdentityCredentialSubject = {
    agent_id: subject.agent_id || uuidv4(),
    agent_type: subject.agent_type || 'generic',
    agent_name: subject.agent_name || 'AI Agent',
    agent_version: subject.agent_version || '1.0.0',
    capabilities: subject.capabilities || [],
    owner_did: subject.owner_did || holderDid,
    owner_name: subject.owner_name || 'Unknown',
    created_at: new Date().toISOString(),
    valid_until: subject.valid_until || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    trust_level: subject.trust_level || 'basic',
  }

  // Offer'ı kaydet
  credentialOffers.set(offerId, {
    type: 'AIAgentIdentityCredential',
    subject: fullSubject as unknown as Record<string, unknown>,
    holderDid,
    createdAt: new Date(),
    accessToken,
  })

  logger.info(`Agent Identity credential offer created: ${offerId}`)

  // OpenID4VCI credential offer URI
  const credentialOfferUri = `openid-credential-offer://?credential_offer=${encodeURIComponent(JSON.stringify({
    credential_issuer: issuerConfig.endpoint,
    credential_configuration_ids: ['AIAgentIdentityCredential'],
    grants: {
      'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
        'pre-authorized_code': accessToken,
      },
    },
  }))}`

  return {
    credentialOfferId: offerId,
    credentialOfferUri,
  }
}

/**
 * Delegation credential offer oluştur
 */
export async function issueDelegationCredential(
  holderDid: string,
  subject: Partial<DelegationCredentialSubject>
): Promise<{ credentialOfferId: string; credentialOfferUri: string }> {
  const agent = getIssuerAgent()
  const offerId = uuidv4()
  const accessToken = uuidv4()

  const fullSubject: DelegationCredentialSubject = {
    delegation_id: subject.delegation_id || uuidv4(),
    delegator_did: subject.delegator_did || '',
    delegator_name: subject.delegator_name || 'Unknown',
    delegate_did: subject.delegate_did || holderDid,
    delegate_name: subject.delegate_name || 'AI Agent',
    scope: subject.scope || [],
    constraints: subject.constraints || {},
    purpose: subject.purpose || 'General delegation',
    created_at: new Date().toISOString(),
    valid_from: subject.valid_from || new Date().toISOString(),
    valid_until: subject.valid_until || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    revocable: subject.revocable ?? true,
  }

  credentialOffers.set(offerId, {
    type: 'DelegationCredential',
    subject: fullSubject as unknown as Record<string, unknown>,
    holderDid,
    createdAt: new Date(),
    accessToken,
  })

  logger.info(`Delegation credential offer created: ${offerId}`)

  const credentialOfferUri = `openid-credential-offer://?credential_offer=${encodeURIComponent(JSON.stringify({
    credential_issuer: issuerConfig.endpoint,
    credential_configuration_ids: ['DelegationCredential'],
    grants: {
      'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
        'pre-authorized_code': accessToken,
      },
    },
  }))}`

  return {
    credentialOfferId: offerId,
    credentialOfferUri,
  }
}

/**
 * Capability credential offer oluştur
 */
export async function issueCapabilityCredential(
  holderDid: string,
  subject: Partial<CapabilityCredentialSubject>
): Promise<{ credentialOfferId: string; credentialOfferUri: string }> {
  const agent = getIssuerAgent()
  const offerId = uuidv4()
  const accessToken = uuidv4()

  const fullSubject: CapabilityCredentialSubject = {
    capability_id: subject.capability_id || uuidv4(),
    holder_did: subject.holder_did || holderDid,
    capability_type: subject.capability_type || 'read',
    resource: subject.resource || '*',
    actions: subject.actions || ['read'],
    conditions: subject.conditions || {},
    granted_by: subject.granted_by || getIssuerDid(),
    granted_at: new Date().toISOString(),
    valid_until: subject.valid_until || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }

  credentialOffers.set(offerId, {
    type: 'CapabilityCredential',
    subject: fullSubject as unknown as Record<string, unknown>,
    holderDid,
    createdAt: new Date(),
    accessToken,
  })

  logger.info(`Capability credential offer created: ${offerId}`)

  const credentialOfferUri = `openid-credential-offer://?credential_offer=${encodeURIComponent(JSON.stringify({
    credential_issuer: issuerConfig.endpoint,
    credential_configuration_ids: ['CapabilityCredential'],
    grants: {
      'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
        'pre-authorized_code': accessToken,
      },
    },
  }))}`

  return {
    credentialOfferId: offerId,
    credentialOfferUri,
  }
}

/**
 * Token exchange - pre-authorized code ile access token al
 */
export function exchangePreAuthorizedCode(preAuthorizedCode: string): {
  access_token: string
  token_type: string
  expires_in: number
  c_nonce: string
  c_nonce_expires_in: number
} | null {
  // Pre-authorized code ile offer bul
  for (const [offerId, offer] of credentialOffers.entries()) {
    if (offer.accessToken === preAuthorizedCode) {
      const c_nonce = uuidv4()
      return {
        access_token: preAuthorizedCode,
        token_type: 'Bearer',
        expires_in: 86400,
        c_nonce,
        c_nonce_expires_in: 86400,
      }
    }
  }
  return null
}

/**
 * Credential claim - access token ile credential al
 */
export async function claimCredential(
  accessToken: string,
  holderDid: string
): Promise<{ credential: string; format: string } | null> {
  // Access token ile offer bul
  for (const [offerId, offer] of credentialOffers.entries()) {
    if (offer.accessToken === accessToken) {
      const agent = getIssuerAgent()

      // JWT-VC oluştur
      const jwt = await createJwtVc(
        agent.keyPair.privateKey,
        agent.getDid(),
        agent.getKid(),
        {
          credentialSubject: {
            id: holderDid,
            ...offer.subject,
          },
          type: ['VerifiableCredential', offer.type],
        }
      )

      // Issued credential'ı kaydet
      issuedCredentials.set(offerId, {
        jwt,
        type: offer.type,
        holderDid,
        issuedAt: new Date(),
      })

      // Offer'ı sil
      credentialOffers.delete(offerId)

      logger.info(`Credential issued: ${offer.type} to ${holderDid}`)

      return {
        credential: jwt,
        format: 'jwt_vc_json',
      }
    }
  }

  return null
}

/**
 * Credential offer bilgisini getir
 */
export function getCredentialOffer(offerId: string) {
  return credentialOffers.get(offerId)
}

/**
 * Tüm credential offer'ları getir
 */
export function getAllCredentialOffers() {
  return Array.from(credentialOffers.entries()).map(([id, offer]) => ({
    id,
    type: offer.type,
    holderDid: offer.holderDid,
    createdAt: offer.createdAt,
  }))
}

/**
 * Issued credential bilgisini getir
 */
export function getIssuedCredential(credentialId: string) {
  return issuedCredentials.get(credentialId)
}

/**
 * Tüm issued credentials'ı getir
 */
export function getAllIssuedCredentials() {
  return Array.from(issuedCredentials.entries()).map(([id, cred]) => ({
    id,
    type: cred.type,
    holderDid: cred.holderDid,
    issuedAt: cred.issuedAt,
  }))
}
