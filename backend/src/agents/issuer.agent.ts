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
import {
  IStorageAdapter,
  createStorageAdapter,
  getStorageType,
} from '../core/storage'
import { batchIssuanceService } from '../services/batchIssuance.service'

let issuerAgent: BaseAgentInstance | null = null

// Storage types
interface StoredCredentialOffer {
  offerId: string
  type: string
  subject: Record<string, unknown>
  holderDid: string
  createdAt: Date
  accessToken?: string
}

interface StoredIssuedCredential {
  credentialId: string
  jwt: string
  type: string
  holderDid: string
  issuedAt: Date
}

// Persistent storage (PostgreSQL via IStorageAdapter)
let offersStorage: IStorageAdapter<StoredCredentialOffer> | null = null
let issuedStorage: IStorageAdapter<StoredIssuedCredential> | null = null

function getOffersStorage(): IStorageAdapter<StoredCredentialOffer> {
  if (!offersStorage) {
    offersStorage = createStorageAdapter<StoredCredentialOffer>('issuer_credential_offers')
    logger.info('Issuer credential offers storage initialized', { type: getStorageType() })
  }
  return offersStorage
}

function getIssuedStorage(): IStorageAdapter<StoredIssuedCredential> {
  if (!issuedStorage) {
    issuedStorage = createStorageAdapter<StoredIssuedCredential>('issuer_issued_credentials')
    logger.info('Issuer issued credentials storage initialized', { type: getStorageType() })
  }
  return issuedStorage
}

export async function initializeIssuerAgent(): Promise<BaseAgentInstance> {
  if (issuerAgent) {
    return issuerAgent
  }

  issuerAgent = await createBaseAgent(issuerConfig, 'issuer')

  logger.info(`Issuer agent initialized with DID: ${issuerAgent.getDid()}`)

  // Wire batch issuance service
  batchIssuanceService.setIssuer(async (req) => {
    return issueCredentialDirect(req.subjectDid, req.credentialType, req.claims)
  })
  logger.info('Batch issuance service wired to issuer agent')

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
  subject: Partial<AgentIdentityCredentialSubject>,
  options: { format?: 'jwt_vc_json' | 'vc+sd-jwt' } = {}
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
  await getOffersStorage().save(offerId, {
    offerId,
    type: 'AIAgentIdentityCredential',
    subject: fullSubject as unknown as Record<string, unknown>,
    holderDid,
    createdAt: new Date(),
    accessToken,
  })

  logger.info(`Agent Identity credential offer created: ${offerId}`)

  // OpenID4VCI credential offer URI
  const configId = options.format === 'vc+sd-jwt' ? 'AIAgentIdentityCredential_sdjwt' : 'AIAgentIdentityCredential'
  const credentialOfferUri = `openid-credential-offer://?credential_offer=${encodeURIComponent(JSON.stringify({
    credential_issuer: issuerConfig.endpoint,
    credential_configuration_ids: [configId],
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
  subject: Partial<DelegationCredentialSubject>,
  options: { format?: 'jwt_vc_json' | 'vc+sd-jwt' } = {}
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

  await getOffersStorage().save(offerId, {
    offerId,
    type: 'DelegationCredential',
    subject: fullSubject as unknown as Record<string, unknown>,
    holderDid,
    createdAt: new Date(),
    accessToken,
  })

  logger.info(`Delegation credential offer created: ${offerId}`)

  const configId = options.format === 'vc+sd-jwt' ? 'DelegationCredential_sdjwt' : 'DelegationCredential'
  const credentialOfferUri = `openid-credential-offer://?credential_offer=${encodeURIComponent(JSON.stringify({
    credential_issuer: issuerConfig.endpoint,
    credential_configuration_ids: [configId],
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
  subject: Partial<CapabilityCredentialSubject>,
  options: { format?: 'jwt_vc_json' | 'vc+sd-jwt' } = {}
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

  await getOffersStorage().save(offerId, {
    offerId,
    type: 'CapabilityCredential',
    subject: fullSubject as unknown as Record<string, unknown>,
    holderDid,
    createdAt: new Date(),
    accessToken,
  })

  logger.info(`Capability credential offer created: ${offerId}`)

  const configId = options.format === 'vc+sd-jwt' ? 'CapabilityCredential_sdjwt' : 'CapabilityCredential'
  const credentialOfferUri = `openid-credential-offer://?credential_offer=${encodeURIComponent(JSON.stringify({
    credential_issuer: issuerConfig.endpoint,
    credential_configuration_ids: [configId],
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
 * Offer flow bypass — doğrudan JWT-VC oluştur ve issuedStorage'a kaydet.
 * Batch issuance service callback'i olarak kullanılır.
 */
export async function issueCredentialDirect(
  holderDid: string,
  credentialType: string,
  claims: Record<string, unknown>
): Promise<{ credentialId: string; credential: string }> {
  const agent = getIssuerAgent()
  const credentialId = uuidv4()

  const jwt = await createJwtVc(
    agent.keyPair.privateKey,
    agent.getDid(),
    agent.getKid(),
    {
      credentialSubject: {
        id: holderDid,
        ...claims,
      },
      type: ['VerifiableCredential', credentialType],
    }
  )

  await getIssuedStorage().save(credentialId, {
    credentialId,
    jwt,
    type: credentialType,
    holderDid,
    issuedAt: new Date(),
  })

  logger.info(`Direct credential issued: ${credentialType} to ${holderDid}`)

  return { credentialId, credential: jwt }
}

/**
 * Token exchange - pre-authorized code ile access token al
 */
export async function exchangePreAuthorizedCode(preAuthorizedCode: string): Promise<{
  access_token: string
  token_type: string
  expires_in: number
  c_nonce: string
  c_nonce_expires_in: number
} | null> {
  // Pre-authorized code ile offer bul (query by accessToken field)
  const result = await getOffersStorage().query({
    where: { accessToken: preAuthorizedCode },
    limit: 1,
  })

  if (result.data.length > 0) {
    const c_nonce = uuidv4()
    return {
      access_token: preAuthorizedCode,
      token_type: 'Bearer',
      expires_in: 86400,
      c_nonce,
      c_nonce_expires_in: 86400,
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
  // Access token ile offer bul (query by accessToken field)
  const result = await getOffersStorage().query({
    where: { accessToken },
    limit: 1,
  })

  if (result.data.length === 0) {
    return null
  }

  const offer = result.data[0]
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

  // Issued credential'ı kaydet (offerId as key)
  await getIssuedStorage().save(offer.offerId, {
    credentialId: offer.offerId,
    jwt,
    type: offer.type,
    holderDid,
    issuedAt: new Date(),
  })

  // Offer'ı sil (offerId stored in data for key lookup)
  await getOffersStorage().delete(offer.offerId)

  logger.info(`Credential issued: ${offer.type} to ${holderDid}`)

  return {
    credential: jwt,
    format: 'jwt_vc_json',
  }
}

/**
 * Credential offer bilgisini getir
 */
export async function getCredentialOffer(offerId: string): Promise<StoredCredentialOffer | null> {
  return getOffersStorage().get(offerId)
}

/**
 * Tüm credential offer'ları getir
 */
export async function getAllCredentialOffers(): Promise<Array<{
  id: string
  type: string
  holderDid: string
  createdAt: Date
}>> {
  const offers = await getOffersStorage().list()
  return offers.map(offer => ({
    id: offer.offerId,
    type: offer.type,
    holderDid: offer.holderDid,
    createdAt: offer.createdAt,
  }))
}

/**
 * Issued credential bilgisini getir
 */
export async function getIssuedCredential(credentialId: string): Promise<StoredIssuedCredential | null> {
  return getIssuedStorage().get(credentialId)
}

/**
 * Tüm issued credentials'ı getir
 */
export async function getAllIssuedCredentials(): Promise<Array<{
  id: string
  type: string
  holderDid: string
  issuedAt: Date
}>> {
  const credentials = await getIssuedStorage().list()
  return credentials.map(cred => ({
    id: cred.credentialId,
    type: cred.type,
    holderDid: cred.holderDid,
    issuedAt: cred.issuedAt,
  }))
}
