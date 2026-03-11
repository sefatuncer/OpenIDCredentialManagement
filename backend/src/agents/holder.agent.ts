/**
 * Holder Agent - Credential wallet ve presentation (PRIMARY)
 *
 * Ana wallet ve presentation implementation. Native modül gerektirmez.
 * OpenID4VCI ve OpenID4VP standartlarını destekler.
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
import {
  isUsingCredo,
  acceptCredentialOffer as credoAcceptOffer,
  presentCredential as credoPresentCredential,
} from '../services/credo.service'

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
  format: string
  combined?: string // SD-JWT combined string (jwt~disclosure1~disclosure2~...)
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
 * Credo aktifken Credo holder API'sini kullanır
 */
export async function receiveCredentialOffer(
  credentialOfferUri: string
): Promise<{ credentialRecordId: string; type: string }> {
  // Credo-first: use Credo holder API when available
  if (isUsingCredo()) {
    try {
      const credoResult = await credoAcceptOffer(credentialOfferUri)
      if (credoResult && credoResult.credentials.length > 0) {
        const recordId = uuidv4()
        const credType = 'VerifiableCredential' // Credo manages its own credential store

        logger.info('Credential received via Credo holder API', {
          recordId,
          count: credoResult.credentials.length,
        })

        return {
          credentialRecordId: recordId,
          type: credType,
        }
      }
    } catch (error) {
      logger.warn('Credo credential offer acceptance failed, falling back to Jose', {
        error: (error as Error).message,
      })
    }
  }

  // Jose-based fallback
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

  // Determine format from credential_configuration_id (e.g. _sdjwt suffix means vc+sd-jwt)
  const configId = credentialConfigIds[0] || ''
  const requestFormat = configId.endsWith('_sdjwt') ? 'vc+sd-jwt' : 'jwt_vc_json'

  // Credential request
  const credentialResponse = await fetch(`${issuerUrl}/api/v1/issuer/credential`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      format: requestFormat,
      credential_configuration_id: configId,
      proof: {
        proof_type: 'jwt',
        jwt: await createHolderProof(tokenData.c_nonce),
      },
    }),
  })

  if (!credentialResponse.ok) {
    throw new Error(`Credential request failed: ${await credentialResponse.text()}`)
  }

  const credentialData = await credentialResponse.json() as { credential: string; format?: string }
  const credentialString = credentialData.credential
  const responseFormat = credentialData.format || requestFormat

  // Parse credential — SD-JWT combined format has ~ separators
  const isSDJWT = responseFormat === 'vc+sd-jwt' || credentialString.includes('~')
  const jwtPart = isSDJWT ? credentialString.split('~')[0] : credentialString

  // JWT'yi decode et
  const parts = jwtPart.split('.')
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())

  // Credential'ı kaydet
  const recordId = uuidv4()
  const type = payload.vc?.type?.[1] || configId.replace(/_sdjwt$/, '') || 'VerifiableCredential'

  storedCredentials.set(recordId, {
    id: recordId,
    jwt: jwtPart,
    type,
    format: responseFormat,
    combined: isSDJWT ? credentialString : undefined,
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
 * Credo aktifken Credo holder API'sini kullanır
 */
export async function presentCredential(
  verificationRequestUri: string
): Promise<{ presentationSubmitted: boolean; redirectUri?: string }> {
  // Credo-first: use Credo holder API for presentation
  if (isUsingCredo()) {
    try {
      const credoResult = await credoPresentCredential(verificationRequestUri)
      if (credoResult && credoResult.submitted) {
        logger.info('Presentation submitted via Credo holder API')
        return { presentationSubmitted: true }
      }
    } catch (error) {
      logger.warn('Credo presentation failed, falling back to Jose', {
        error: (error as Error).message,
      })
    }
  }

  // Jose-based fallback
  const agent = getHolderAgent()

  logger.info(`Processing verification request: ${verificationRequestUri}`)

  try {
    // Verification request URI'yi parse et
    const url = new URL(verificationRequestUri)
    const clientId = url.searchParams.get('client_id')
    const requestUri = url.searchParams.get('request_uri')

    let presentationDefinition: { id: string; input_descriptors: Array<{ id: string; constraints?: { fields?: Array<{ path: string[] }> } }> }
    let nonce: string
    let state: string
    let submitUrl: string | undefined

    if (requestUri) {
      // request_uri pattern: fetch authorization request from endpoint
      const requestResponse = await fetch(requestUri)
      if (!requestResponse.ok) {
        throw new Error(`Failed to fetch request: ${await requestResponse.text()}`)
      }

      const authRequest = await requestResponse.json() as {
        presentation_definition: typeof presentationDefinition
        nonce: string
        state: string
        response_uri?: string
        redirect_uri?: string
      }
      presentationDefinition = authRequest.presentation_definition
      nonce = authRequest.nonce
      state = authRequest.state
      submitUrl = authRequest.response_uri || authRequest.redirect_uri
    } else {
      // Inline params pattern (Draft 13+): all params embedded in URI
      const pdParam = url.searchParams.get('presentation_definition')
      if (!pdParam) {
        throw new Error('No request_uri or presentation_definition in verification request')
      }
      presentationDefinition = JSON.parse(pdParam)
      nonce = url.searchParams.get('nonce') || ''
      state = url.searchParams.get('state') || ''
      submitUrl = url.searchParams.get('response_uri') || url.searchParams.get('redirect_uri') || undefined
    }

    logger.info(`Verification request: ${presentationDefinition.id}`)

    // Matching credentials bul
    const matchingCredentials = findMatchingCredentials(presentationDefinition)
    if (matchingCredentials.length === 0) {
      logger.warn('No matching credentials found')
      return { presentationSubmitted: false }
    }

    // VP token oluştur
    const vpToken = await createVpToken(matchingCredentials, nonce, clientId!)

    if (!submitUrl) {
      throw new Error('No response_uri or redirect_uri in authorization request')
    }

    // Presentation submit et (direct_post)
    const submitResponse = await fetch(submitUrl, {
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

    return { presentationSubmitted: true, redirectUri: submitUrl }
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
  format: string
  combined?: string
  isSDJWT: boolean
  issuerDid: string
  receivedAt: Date
  credentialSubject: Record<string, unknown>
}>> {
  return Array.from(storedCredentials.values()).map(cred => ({
    id: cred.id,
    type: cred.type,
    format: cred.format || 'jwt_vc_json',
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
export function addCredential(credentialString: string): string {
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

  storedCredentials.set(recordId, {
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
