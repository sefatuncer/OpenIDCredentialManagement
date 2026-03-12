/**
 * VP Service — Client-Side Verifiable Presentation
 *
 * Handles authorization request fetching, credential matching,
 * VP token creation, and direct_post submission.
 */

import { v4 as uuidv4 } from '../utils/uuid'
import { getOrCreateWalletKey, signJwt } from './wallet-key.service'

export interface PresentationDefinition {
  id: string
  name?: string
  purpose?: string
  input_descriptors: InputDescriptor[]
}

export interface InputDescriptor {
  id: string
  name?: string
  purpose?: string
  constraints: {
    fields: FieldConstraint[]
    limit_disclosure?: 'required' | 'preferred'
  }
}

export interface FieldConstraint {
  path: string[]
  filter?: {
    type?: string
    const?: string | number | boolean
    enum?: (string | number | boolean)[]
    pattern?: string
  }
}

export interface AuthorizationRequest {
  presentationDefinition: PresentationDefinition
  nonce: string
  state: string
  responseUri: string
  clientId: string
}

export interface WalletCredential {
  id: string
  jwt: string
  type: string
  combined?: string
  isSDJWT?: boolean
  credentialSubject: Record<string, unknown>
}

export function parseVerificationUri(uri: string): {
  valid: boolean
  clientId?: string
  requestUri?: string
  inlineParams?: {
    presentationDefinition: PresentationDefinition
    nonce: string
    state: string
    responseUri: string
  }
} {
  try {
    if (!uri.startsWith('openid4vp://')) {
      return { valid: false }
    }
    const url = new URL(uri)
    const clientId = url.searchParams.get('client_id')

    if (!clientId) return { valid: false }

    const requestUri = url.searchParams.get('request_uri')
    if (requestUri) {
      return { valid: true, clientId, requestUri }
    }

    // Inline params (Draft 13+)
    const pdParam = url.searchParams.get('presentation_definition')
    if (pdParam) {
      return {
        valid: true,
        clientId,
        inlineParams: {
          presentationDefinition: JSON.parse(pdParam),
          nonce: url.searchParams.get('nonce') || '',
          state: url.searchParams.get('state') || '',
          responseUri: url.searchParams.get('response_uri') || url.searchParams.get('redirect_uri') || '',
        },
      }
    }

    return { valid: false }
  } catch {
    return { valid: false }
  }
}

export async function fetchAuthorizationRequest(
  requestUri: string,
  clientId: string
): Promise<AuthorizationRequest> {
  const response = await fetch(requestUri)
  if (!response.ok) {
    throw new Error(`Failed to fetch authorization request: ${response.statusText}`)
  }

  const authRequest = await response.json()

  return {
    presentationDefinition: authRequest.presentation_definition,
    nonce: authRequest.nonce,
    state: authRequest.state,
    responseUri: authRequest.response_uri || authRequest.redirect_uri || '',
    clientId,
  }
}

export function matchCredentials(
  definition: PresentationDefinition,
  credentials: WalletCredential[]
): { descriptorId: string; credential: WalletCredential }[] {
  const matches: { descriptorId: string; credential: WalletCredential }[] = []

  for (const descriptor of definition.input_descriptors) {
    const requiredPaths = descriptor.constraints?.fields?.map(f => f.path[0]) || []

    for (const cred of credentials) {
      const subject = cred.credentialSubject || {}

      const hasAllFields = requiredPaths.every(path => {
        // $.credentialSubject.field_name → field_name
        const fieldName = path.split('.').pop()
        return fieldName && subject[fieldName] !== undefined
      })

      if (hasAllFields) {
        matches.push({ descriptorId: descriptor.id, credential: cred })
        break
      }
    }
  }

  return matches
}

export async function createVpToken(
  credentialJwts: string[],
  nonce: string,
  audience: string
): Promise<string> {
  const keyData = await getOrCreateWalletKey()
  const jti = `urn:uuid:${uuidv4()}`

  const payload = {
    vp: {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiablePresentation'],
      verifiableCredential: credentialJwts,
    },
    iss: keyData.did,
    aud: audience,
    nonce,
    iat: Math.floor(Date.now() / 1000),
    jti,
  }

  return signJwt(payload)
}

export function buildPresentationSubmission(
  definitionId: string,
  matches: { descriptorId: string; credential: WalletCredential }[]
): object {
  return {
    id: uuidv4(),
    definition_id: definitionId,
    descriptor_map: matches.map((match, idx) => ({
      id: match.descriptorId,
      format: 'jwt_vp',
      path: '$',
      path_nested: {
        format: match.credential.isSDJWT ? 'vc+sd-jwt' : 'jwt_vc',
        path: `$.vp.verifiableCredential[${idx}]`,
      },
    })),
  }
}

export async function submitPresentation(
  responseUri: string,
  vpToken: string,
  presentationSubmission: object,
  state: string
): Promise<{ success: boolean; error?: string }> {
  const response = await fetch(responseUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      vp_token: vpToken,
      state,
      presentation_submission: JSON.stringify(presentationSubmission),
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    return { success: false, error: `Submission failed: ${text}` }
  }

  return { success: true }
}
