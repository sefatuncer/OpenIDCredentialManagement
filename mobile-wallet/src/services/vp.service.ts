/**
 * VP Service — Client-Side Verifiable Presentation
 * Handles authorization request fetching, credential matching,
 * VP token creation, and direct_post submission.
 * Pure JS — works in React Native without changes.
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

// --- URL and data validation ---

const PRIVATE_IP_PATTERNS = [
  /^localhost$/i, /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./, /^0\./, /^::1$/, /^fe80:/i, /^fc00:/i, /^fd/i,
]

function validateUrl(url: string): void {
  const parsed = new URL(url)
  const hostname = parsed.hostname
  if (PRIVATE_IP_PATTERNS.some((p) => p.test(hostname))) {
    throw new Error('Request to private/reserved IP is not allowed')
  }
  // eslint-disable-next-line no-undef
  if (typeof __DEV__ !== 'undefined' && !__DEV__ && parsed.protocol !== 'https:') {
    throw new Error('HTTPS required for authorization requests')
  }
}

function validatePresentationDefinition(pd: unknown): pd is PresentationDefinition {
  if (!pd || typeof pd !== 'object') return false
  const obj = pd as Record<string, unknown>
  if (typeof obj.id !== 'string') return false
  if (!Array.isArray(obj.input_descriptors) || obj.input_descriptors.length === 0) return false
  return obj.input_descriptors.every((d: unknown) => {
    if (!d || typeof d !== 'object') return false
    const desc = d as Record<string, unknown>
    return typeof desc.id === 'string'
  })
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

    const pdParam = url.searchParams.get('presentation_definition')
    if (pdParam) {
      const parsed = JSON.parse(pdParam)
      if (!validatePresentationDefinition(parsed)) {
        return { valid: false }
      }
      return {
        valid: true,
        clientId,
        inlineParams: {
          presentationDefinition: parsed,
          nonce: url.searchParams.get('nonce') || '',
          state: url.searchParams.get('state') || '',
          responseUri:
            url.searchParams.get('response_uri') ||
            url.searchParams.get('redirect_uri') ||
            '',
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
  validateUrl(requestUri)

  const response = await fetch(requestUri)
  if (!response.ok) {
    throw new Error(`Failed to fetch authorization request: ${response.statusText}`)
  }

  const authRequest = await response.json()

  if (!validatePresentationDefinition(authRequest.presentation_definition)) {
    throw new Error('Invalid presentation_definition in authorization request')
  }

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
    const fields = descriptor.constraints?.fields || []

    for (const cred of credentials) {
      const subject = cred.credentialSubject || {}

      const allMatch = fields.every((field) => {
        const fieldName = field.path[0]?.split('.').pop()
        if (!fieldName) return false
        const value = subject[fieldName]
        if (value === undefined) return false

        // Check filter constraints if present
        if (field.filter) {
          if (field.filter.const !== undefined && value !== field.filter.const) return false
          if (field.filter.enum && !field.filter.enum.includes(value as string | number | boolean)) return false
          if (field.filter.pattern && !new RegExp(field.filter.pattern).test(String(value))) return false
        }

        return true
      })

      if (allMatch) {
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
  validateUrl(responseUri)

  const body = `vp_token=${encodeURIComponent(vpToken)}&state=${encodeURIComponent(state)}&presentation_submission=${encodeURIComponent(JSON.stringify(presentationSubmission))}`

  const response = await fetch(responseUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!response.ok) {
    const text = await response.text()
    return { success: false, error: `Submission failed: ${text}` }
  }

  return { success: true }
}
