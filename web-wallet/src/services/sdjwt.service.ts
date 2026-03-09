/**
 * SD-JWT Service - Browser-compatible SD-JWT operations
 * Client-side parsing and API integration for selective disclosure
 */

import { apiService } from './api.service'
import type {
  Disclosure,
  SDJWTPayload,
  ParsedSDJWT,
  SDJWTCredentialData,
  PresentationResult,
  VerificationResult,
  SDJWTInfo,
} from '../types/sdjwt.types'

const DISCLOSURE_SEPARATOR = '~'

/**
 * Base64url decode (browser-compatible)
 */
function base64urlDecode(str: string): string {
  // Add padding if needed
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padding = base64.length % 4
  if (padding) {
    base64 += '='.repeat(4 - padding)
  }
  return atob(base64)
}

/**
 * Parse a single disclosure
 */
function parseDisclosure(encoded: string): Disclosure | null {
  try {
    const decoded = base64urlDecode(encoded)
    const [salt, claimName, claimValue] = JSON.parse(decoded)
    return {
      salt,
      claimName,
      claimValue,
      encoded,
    }
  } catch {
    return null
  }
}

/**
 * Decode JWT payload
 */
function decodeJWTPayload(jwt: string): SDJWTPayload | null {
  try {
    const parts = jwt.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(base64urlDecode(parts[1]))
    return payload
  } catch {
    return null
  }
}

/**
 * Check if a credential string is SD-JWT format
 */
export function isSDJWT(credentialString: string): boolean {
  // SD-JWT contains disclosure separator and has _sd or _sd_alg in payload
  if (!credentialString.includes(DISCLOSURE_SEPARATOR)) {
    // Check if single JWT has SD-JWT markers
    const payload = decodeJWTPayload(credentialString)
    return payload?._sd !== undefined || payload?._sd_alg !== undefined
  }
  return true
}

/**
 * Parse an SD-JWT combined string (client-side)
 */
export function parseSDJWT(combined: string): ParsedSDJWT | null {
  try {
    const parts = combined.split(DISCLOSURE_SEPARATOR)
    if (parts.length < 1) return null

    const jwt = parts[0]
    const payload = decodeJWTPayload(jwt)
    if (!payload) return null

    const disclosures: Disclosure[] = []
    let keyBindingJwt: string | undefined

    // Parse disclosures
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i]
      if (!part) continue

      // Check if this is a key binding JWT (last part with 3 segments)
      if (part.split('.').length === 3 && i === parts.length - 1) {
        keyBindingJwt = part
        continue
      }

      const disclosure = parseDisclosure(part)
      if (disclosure) {
        disclosures.push(disclosure)
      }
    }

    // Build disclosed claims map
    const disclosedClaims: Record<string, unknown> = {}
    for (const d of disclosures) {
      disclosedClaims[d.claimName] = d.claimValue
    }

    // Get hidden digests (ones without matching disclosure)
    const sdDigests = payload._sd || []
    const vcSdDigests = payload.vc?.credentialSubject?._sd || []
    const allDigests = [...sdDigests, ...vcSdDigests]

    // Note: We can't compute digest client-side without crypto.subtle
    // So hiddenDigests will be the count of total - disclosed
    const hiddenCount = allDigests.length - disclosures.length
    const hiddenDigests = Array(Math.max(0, hiddenCount)).fill('(hidden)')

    return {
      jwt,
      payload,
      disclosures,
      keyBindingJwt,
      disclosedClaims,
      hiddenDigests,
    }
  } catch {
    return null
  }
}

/**
 * Convert parsed SD-JWT to credential data structure
 */
export function sdJWTToCredentialData(
  id: string,
  combined: string
): SDJWTCredentialData | null {
  const parsed = parseSDJWT(combined)
  if (!parsed) return null

  const { jwt, payload, disclosures, disclosedClaims } = parsed

  // Extract credential type
  let type = 'SD-JWT Credential'
  if (payload.vc?.type) {
    type = payload.vc.type.find((t: string) => t !== 'VerifiableCredential') || type
  }

  // Build subject from plain claims + disclosed claims
  const subject: Record<string, unknown> = { ...disclosedClaims }

  // Add plain claims from VC credentialSubject
  if (payload.vc?.credentialSubject) {
    for (const [key, value] of Object.entries(payload.vc.credentialSubject)) {
      if (key !== '_sd' && key !== 'id') {
        subject[key] = value
      }
    }
  }

  return {
    id,
    combined,
    jwt,
    disclosures,
    type,
    issuer: payload.iss,
    issuanceDate: new Date(payload.iat * 1000).toISOString(),
    expirationDate: payload.exp ? new Date(payload.exp * 1000).toISOString() : undefined,
    subject,
    isSDJWT: true,
  }
}

/**
 * Get all selectively disclosable claims from a credential
 */
export function getSelectableDisclosures(credential: SDJWTCredentialData): string[] {
  return credential.disclosures.map((d) => d.claimName)
}

/**
 * Create a presentation with selected disclosures (via API)
 */
export async function createPresentation(
  combined: string,
  claimsToDisclose: string[],
  options: {
    audience?: string
    nonce?: string
  } = {}
): Promise<PresentationResult> {
  const response = await apiService.post<{
    presentation: PresentationResult
  }>('/sdjwt/presentation', {
    credential: combined,
    claimsToDisclose,
    audience: options.audience,
    nonce: options.nonce,
  })

  return response.presentation
}

/**
 * Verify an SD-JWT presentation (via API)
 */
export async function verifyPresentation(
  presentation: string,
  options: {
    expectedAudience?: string
    expectedNonce?: string
  } = {}
): Promise<VerificationResult> {
  const response = await apiService.post<VerificationResult>('/sdjwt/verify', {
    presentation,
    expectedAudience: options.expectedAudience,
    expectedNonce: options.expectedNonce,
  })

  return response
}

/**
 * Parse SD-JWT via API (for detailed parsing with digest verification)
 */
export async function parseSDJWTViaAPI(combined: string): Promise<ParsedSDJWT> {
  const response = await apiService.post<{
    jwt: string
    payload: SDJWTPayload
    disclosures: Disclosure[]
    keyBindingJwt?: string
  }>('/sdjwt/parse', { sdjwt: combined })

  // Build disclosed claims
  const disclosedClaims: Record<string, unknown> = {}
  for (const d of response.disclosures) {
    disclosedClaims[d.claimName] = d.claimValue
  }

  // Calculate hidden digests
  const sdDigests = response.payload._sd || []
  const hiddenCount = sdDigests.length - response.disclosures.length

  return {
    jwt: response.jwt,
    payload: response.payload,
    disclosures: response.disclosures,
    keyBindingJwt: response.keyBindingJwt,
    disclosedClaims,
    hiddenDigests: Array(Math.max(0, hiddenCount)).fill('(hidden)'),
  }
}

/**
 * Get SD-JWT service info
 */
export async function getSDJWTInfo(): Promise<SDJWTInfo> {
  return await apiService.get<SDJWTInfo>('/sdjwt/info')
}

/**
 * Generate a random nonce for key binding
 */
export function generateNonce(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('')
}

export const sdjwtService = {
  isSDJWT,
  parseSDJWT,
  sdJWTToCredentialData,
  getSelectableDisclosures,
  createPresentation,
  verifyPresentation,
  parseSDJWTViaAPI,
  getSDJWTInfo,
  generateNonce,
}
