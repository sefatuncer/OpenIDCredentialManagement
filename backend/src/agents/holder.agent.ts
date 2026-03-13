/**
 * Holder Agent - Credential wallet ve presentation
 *
 * Credo-TS PRIMARY mimari: Askar ZORUNLU, Jose fallback YOK.
 * OpenID4VCI ve OpenID4VP standartlarını destekler.
 */

import { v4 as uuidv4 } from 'uuid'
import type { JWTPayload } from 'jose'
import {
  createBaseAgent,
  BaseAgentInstance,
} from './base.agent'
import { holderConfig } from '../config/agent.config'
import { logger } from '../utils/logger'
import {
  acceptCredentialOffer as credoAcceptOffer,
  presentCredential as credoPresentCredential,
} from '../services/credo.service'
import {
  IStorageAdapter,
  createStorageAdapter,
  getStorageType,
} from '../core/storage'

let holderAgent: BaseAgentInstance | null = null

// Extended JWT payload with VC fields
interface VCPayload extends JWTPayload {
  vc?: {
    type?: string[]
    credentialSubject?: Record<string, unknown>
  }
  credentialSubject?: Record<string, unknown>
}

// Credential storage type
interface StoredCredential {
  id: string
  jwt: string
  type: string
  format: string
  combined?: string // SD-JWT combined string (jwt~disclosure1~disclosure2~...)
  issuerDid: string
  receivedAt: Date
  payload: VCPayload
}

// Persistent credential storage (PostgreSQL via IStorageAdapter)
let holderCredentialsStorage: IStorageAdapter<StoredCredential> | null = null

function getHolderCredentialsStorage(): IStorageAdapter<StoredCredential> {
  if (!holderCredentialsStorage) {
    holderCredentialsStorage = createStorageAdapter<StoredCredential>('holder_credentials')
    logger.info('Holder credentials storage initialized', { type: getStorageType() })
  }
  return holderCredentialsStorage
}

export async function initializeHolderAgent(): Promise<BaseAgentInstance> {
  if (holderAgent) {
    return holderAgent
  }

  holderAgent = await createBaseAgent(holderConfig, 'holder')

  logger.info(`Holder agent (AI Agent) initialized with DID: ${holderAgent.getDid()}`)

  return holderAgent
}

export function getHolderAgent(): BaseAgentInstance {
  if (!holderAgent) {
    throw new Error('Holder agent not initialized')
  }
  return holderAgent
}

export function getHolderDid(): string {
  return getHolderAgent().getDid()
}

export function getHolderKid(): string {
  return getHolderAgent().getKid()
}

/**
 * OpenID4VCI credential offer'ı işle — Credo PRIMARY
 */
export async function receiveCredentialOffer(
  credentialOfferUri: string
): Promise<{ credentialRecordId: string; type: string }> {
  const credoResult = await credoAcceptOffer(credentialOfferUri)
  if (!credoResult || credoResult.credentials.length === 0) {
    throw new Error('Credo credential offer acceptance returned no credentials')
  }

  const recordId = uuidv4()
  const credType = 'VerifiableCredential'

  logger.info('Credential received via Credo holder API', {
    recordId,
    count: credoResult.credentials.length,
  })

  return {
    credentialRecordId: recordId,
    type: credType,
  }
}

/**
 * OpenID4VP verification request'i işle — Credo PRIMARY
 */
export async function presentCredential(
  verificationRequestUri: string
): Promise<{ presentationSubmitted: boolean; redirectUri?: string }> {
  const credoResult = await credoPresentCredential(verificationRequestUri)
  if (credoResult && credoResult.submitted) {
    logger.info('Presentation submitted via Credo holder API')
    return { presentationSubmitted: true }
  }

  return { presentationSubmitted: false }
}

/**
 * Wallet'taki tüm credentials'ı getir
 */
export async function getStoredCredentials(): Promise<Array<{
  id: string
  type: string
  format: string
  jwt: string
  combined?: string
  isSDJWT: boolean
  issuerDid: string
  receivedAt: Date
  credentialSubject: Record<string, unknown>
}>> {
  const allCredentials = await getHolderCredentialsStorage().list()
  return allCredentials.map(cred => ({
    id: cred.id,
    type: cred.type,
    format: cred.format || 'jwt_vc_json',
    jwt: cred.jwt,
    combined: cred.combined,
    isSDJWT: cred.format === 'vc+sd-jwt' || !!cred.combined,
    issuerDid: cred.issuerDid,
    receivedAt: cred.receivedAt,
    credentialSubject: cred.payload.vc?.credentialSubject || cred.payload.credentialSubject || {},
  }))
}

/**
 * Credential sil
 */
export async function deleteCredential(credentialId: string): Promise<void> {
  const exists = await getHolderCredentialsStorage().exists(credentialId)
  if (!exists) {
    throw new Error(`Credential not found: ${credentialId}`)
  }

  await getHolderCredentialsStorage().delete(credentialId)
  logger.info(`Credential deleted: ${credentialId}`)
}

/**
 * Credential getir
 */
export async function getCredential(credentialId: string): Promise<StoredCredential | null> {
  return getHolderCredentialsStorage().get(credentialId)
}

/**
 * Credential ekle (manuel)
 */
export async function addCredential(credentialString: string): Promise<string> {
  // Detect SD-JWT format (contains ~ separators)
  const isSDJWT = credentialString.includes('~')
  const jwtPart = isSDJWT ? credentialString.split('~')[0] : credentialString

  const parts = jwtPart.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format')
  }

  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
  const recordId = uuidv4()
  const type = payload.vc?.type?.[1] || 'VerifiableCredential'

  await getHolderCredentialsStorage().save(recordId, {
    id: recordId,
    jwt: jwtPart,
    type,
    format: isSDJWT ? 'vc+sd-jwt' : 'jwt_vc_json',
    combined: isSDJWT ? credentialString : undefined,
    issuerDid: payload.iss,
    receivedAt: new Date(),
    payload,
  })

  logger.info(`Credential added manually: ${recordId}`, { format: isSDJWT ? 'vc+sd-jwt' : 'jwt_vc_json' })

  return recordId
}
