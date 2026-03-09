/**
 * Holder Agent - Credential wallet ve presentation (LEGACY/FALLBACK)
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
  createJwtVc,
  BaseAgentInstance,
} from './base.agent'
import { holderConfig } from '../config/agent.config'
import { logger } from '../utils/logger'

let holderAgent: BaseAgentInstance | null = null

// Extended JWT payload with VC fields
interface VCPayload extends jose.JWTPayload {
  vc?: {
    type?: string[]
    credentialSubject?: Record<string, unknown>
  }
  credentialSubject?: Record<string, unknown>
}

// Credential storage (in-memory wallet)
const storedCredentials = new Map<string, {
  id: string
  jwt: string
  type: string
  issuerDid: string
  receivedAt: Date
  payload: VCPayload
}>()

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
 * OpenID4VCI credential offer'ı işle
 */
export async function receiveCredentialOffer(
  credentialOfferUri: string
): Promise<{ credentialRecordId: string; type: string }> {
  const agent = getHolderAgent()

  logger.info(`Receiving credential offer: ${credentialOfferUri}`)

  // Credential offer URI'yi parse et
  let credentialOffer: any
  try {
    const url = new URL(credentialOfferUri)
    const offerParam = url.searchParams.get('credential_offer')
    if (offerParam) {
      credentialOffer = JSON.parse(offerParam)
    } else {
      throw new Error('No credential_offer parameter')
    }
  } catch (error) {
    throw new Error(`Invalid credential offer URI: ${(error as Error).message}`)
  }

  const issuerUrl = credentialOffer.credential_issuer
  const credentialConfigIds = credentialOffer.credential_configuration_ids || []
  const preAuthorizedCode = credentialOffer.grants?.['urn:ietf:params:oauth:grant-type:pre-authorized_code']?.['pre-authorized_code']

  if (!preAuthorizedCode) {
    throw new Error('No pre-authorized code in offer')
  }

  logger.info(`Credential offer from: ${issuerUrl}, types: ${credentialConfigIds.join(', ')}`)

  // Token exchange
  const tokenResponse = await fetch(`${issuerUrl}/api/v1/issuer/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
      'pre-authorized_code': preAuthorizedCode,
    }),
  })

  if (!tokenResponse.ok) {
    throw new Error(`Token exchange failed: ${await tokenResponse.text()}`)
  }

  const tokenData = await tokenResponse.json() as { access_token: string; c_nonce: string }
  const accessToken = tokenData.access_token

  // Credential request
  const credentialResponse = await fetch(`${issuerUrl}/api/v1/issuer/credential`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      format: 'jwt_vc_json',
      credential_configuration_id: credentialConfigIds[0],
      proof: {
        proof_type: 'jwt',
        jwt: await createHolderProof(tokenData.c_nonce),
      },
    }),
  })

  if (!credentialResponse.ok) {
    throw new Error(`Credential request failed: ${await credentialResponse.text()}`)
  }

  const credentialData = await credentialResponse.json() as { credential: string }
  const jwt = credentialData.credential

  // JWT'yi decode et
  const parts = jwt.split('.')
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())

  // Credential'ı kaydet
  const recordId = uuidv4()
  const type = payload.vc?.type?.[1] || credentialConfigIds[0] || 'VerifiableCredential'

  storedCredentials.set(recordId, {
    id: recordId,
    jwt,
    type,
    issuerDid: payload.iss,
    receivedAt: new Date(),
    payload,
  })

  logger.info(`Credential received and stored: ${recordId}`)

  return {
    credentialRecordId: recordId,
    type,
  }
}

/**
 * Holder proof JWT oluştur (credential request için)
 */
async function createHolderProof(nonce: string): Promise<string> {
  const agent = getHolderAgent()

  const proofPayload = {
    iss: agent.getDid(),
    aud: 'issuer', // Issuer URL olmalı
    iat: Math.floor(Date.now() / 1000),
    nonce,
  }

  const jwt = await new jose.SignJWT(proofPayload)
    .setProtectedHeader({ alg: 'EdDSA', typ: 'openid4vci-proof+jwt', kid: agent.getKid() })
    .sign(agent.keyPair.privateKey)

  return jwt
}

/**
 * OpenID4VP verification request'i işle
 */
export async function presentCredential(
  verificationRequestUri: string
): Promise<{ presentationSubmitted: boolean; redirectUri?: string }> {
  const agent = getHolderAgent()

  logger.info(`Processing verification request: ${verificationRequestUri}`)

  try {
    // Verification request URI'yi parse et
    const url = new URL(verificationRequestUri)
    const clientId = url.searchParams.get('client_id')
    const requestUri = url.searchParams.get('request_uri')

    if (!requestUri) {
      throw new Error('No request_uri in verification request')
    }

    // Request'i al
    const requestResponse = await fetch(requestUri)
    if (!requestResponse.ok) {
      throw new Error(`Failed to fetch request: ${await requestResponse.text()}`)
    }

    const authRequest = await requestResponse.json() as {
      presentation_definition: { id: string; input_descriptors: Array<{ id: string; constraints?: { fields?: Array<{ path: string[] }> } }> }
      nonce: string
      state: string
      redirect_uri: string
    }
    const presentationDefinition = authRequest.presentation_definition
    const nonce = authRequest.nonce
    const state = authRequest.state
    const redirectUri = authRequest.redirect_uri

    logger.info(`Verification request: ${presentationDefinition.id}`)

    // Matching credentials bul
    const matchingCredentials = findMatchingCredentials(presentationDefinition)
    if (matchingCredentials.length === 0) {
      logger.warn('No matching credentials found')
      return { presentationSubmitted: false }
    }

    // VP token oluştur
    const vpToken = await createVpToken(matchingCredentials, nonce, clientId!)

    // Presentation submit et (direct_post)
    const submitResponse = await fetch(redirectUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        vp_token: vpToken,
        state,
        presentation_submission: JSON.stringify({
          id: uuidv4(),
          definition_id: presentationDefinition.id,
          descriptor_map: matchingCredentials.map((cred, idx) => ({
            id: presentationDefinition.input_descriptors[idx]?.id || `credential-${idx}`,
            format: 'jwt_vp',
            path: '$',
            path_nested: {
              format: 'jwt_vc',
              path: `$.vp.verifiableCredential[${idx}]`,
            },
          })),
        }),
      }),
    })

    if (!submitResponse.ok) {
      throw new Error(`Presentation submission failed: ${await submitResponse.text()}`)
    }

    logger.info('Presentation submitted successfully')

    return { presentationSubmitted: true, redirectUri }
  } catch (error) {
    logger.error('Error presenting credential', { error })
    return { presentationSubmitted: false }
  }
}

/**
 * Presentation definition'a göre matching credentials bul
 */
function findMatchingCredentials(presentationDefinition: any): string[] {
  const matchingJwts: string[] = []

  for (const descriptor of presentationDefinition.input_descriptors || []) {
    const requiredPaths = descriptor.constraints?.fields?.map((f: any) => f.path[0]) || []

    for (const [id, cred] of storedCredentials) {
      // Credential subject'ta required field'lar var mı kontrol et
      const credSubject = cred.payload.vc?.credentialSubject || cred.payload.credentialSubject || {}

      const hasAllFields = requiredPaths.every((path: string) => {
        // $.credentialSubject.field_name -> field_name
        const fieldName = path.split('.').pop()
        return fieldName && credSubject[fieldName] !== undefined
      })

      if (hasAllFields) {
        matchingJwts.push(cred.jwt)
        break // Her descriptor için bir credential yeterli
      }
    }
  }

  return matchingJwts
}

/**
 * VP token oluştur
 */
async function createVpToken(credentialJwts: string[], nonce: string, audience: string): Promise<string> {
  const agent = getHolderAgent()

  const vpPayload = {
    vp: {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiablePresentation'],
      verifiableCredential: credentialJwts,
    },
    iss: agent.getDid(),
    aud: audience,
    nonce,
    iat: Math.floor(Date.now() / 1000),
    jti: `urn:uuid:${uuidv4()}`,
  }

  const jwt = await new jose.SignJWT(vpPayload)
    .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT', kid: agent.getKid() })
    .sign(agent.keyPair.privateKey)

  return jwt
}

/**
 * Wallet'taki tüm credentials'ı getir
 */
export async function getStoredCredentials(): Promise<Array<{
  id: string
  type: string
  issuerDid: string
  receivedAt: Date
  credentialSubject: Record<string, unknown>
}>> {
  return Array.from(storedCredentials.values()).map(cred => ({
    id: cred.id,
    type: cred.type,
    issuerDid: cred.issuerDid,
    receivedAt: cred.receivedAt,
    credentialSubject: cred.payload.vc?.credentialSubject || cred.payload.credentialSubject || {},
  }))
}

/**
 * Credential sil
 */
export async function deleteCredential(credentialId: string): Promise<void> {
  if (!storedCredentials.has(credentialId)) {
    throw new Error(`Credential not found: ${credentialId}`)
  }

  storedCredentials.delete(credentialId)
  logger.info(`Credential deleted: ${credentialId}`)
}

/**
 * Credential getir
 */
export function getCredential(credentialId: string) {
  return storedCredentials.get(credentialId)
}

/**
 * Credential ekle (manuel)
 */
export function addCredential(jwt: string): string {
  const parts = jwt.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format')
  }

  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
  const recordId = uuidv4()
  const type = payload.vc?.type?.[1] || 'VerifiableCredential'

  storedCredentials.set(recordId, {
    id: recordId,
    jwt,
    type,
    issuerDid: payload.iss,
    receivedAt: new Date(),
    payload,
  })

  logger.info(`Credential added manually: ${recordId}`)

  return recordId
}
