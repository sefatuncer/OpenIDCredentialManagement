/**
 * SD-JWT Service - React Native compatible
 * Client-side parsing and API integration for selective disclosure.
 * Pure JS — no browser-specific APIs.
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

function base64urlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padding = base64.length % 4
  if (padding) {
    base64 += '='.repeat(4 - padding)
  }
  return atob(base64)
}

function parseDisclosure(encoded: string): Disclosure | null {
  try {
    const decoded = base64urlDecode(encoded)
    const [salt, claimName, claimValue] = JSON.parse(decoded)
    return { salt, claimName, claimValue, encoded }
  } catch {
    return null
  }
}

function decodeJWTPayload(jwt: string): SDJWTPayload | null {
  try {
    const parts = jwt.split('.')
    if (parts.length !== 3) return null
    return JSON.parse(base64urlDecode(parts[1]))
  } catch {
    return null
  }
}

export function isSDJWT(credentialString: string): boolean {
  if (!credentialString.includes(DISCLOSURE_SEPARATOR)) {
    const payload = decodeJWTPayload(credentialString)
    return payload?._sd !== undefined || payload?._sd_alg !== undefined
  }
  return true
}

export function parseSDJWT(combined: string): ParsedSDJWT | null {
  try {
    const parts = combined.split(DISCLOSURE_SEPARATOR)
    if (parts.length < 1) return null

    const jwt = parts[0]
    const payload = decodeJWTPayload(jwt)
    if (!payload) return null

    const disclosures: Disclosure[] = []
    let keyBindingJwt: string | undefined

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i]
      if (!part) continue

      if (part.split('.').length === 3 && i === parts.length - 1) {
        keyBindingJwt = part
        continue
      }

      const disclosure = parseDisclosure(part)
      if (disclosure) {
        disclosures.push(disclosure)
      }
    }

    const disclosedClaims: Record<string, unknown> = {}
    for (const d of disclosures) {
      disclosedClaims[d.claimName] = d.claimValue
    }

    const sdDigests = payload._sd || []
    const vcSdDigests = payload.vc?.credentialSubject?._sd || []
    const allDigests = [...sdDigests, ...vcSdDigests]
    const hiddenCount = allDigests.length - disclosures.length
    const hiddenDigests = Array(Math.max(0, hiddenCount)).fill('(hidden)')

    return { jwt, payload, disclosures, keyBindingJwt, disclosedClaims, hiddenDigests }
  } catch {
    return null
  }
}

export function sdJWTToCredentialData(
  id: string,
  combined: string
): SDJWTCredentialData | null {
  const parsed = parseSDJWT(combined)
  if (!parsed) return null

  const { jwt, payload, disclosures, disclosedClaims } = parsed

  let type = 'SD-JWT Credential'
  if (payload.vc?.type) {
    type = payload.vc.type.find((t: string) => t !== 'VerifiableCredential') || type
  }

  const subject: Record<string, unknown> = { ...disclosedClaims }
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

export function getSelectableDisclosures(credential: SDJWTCredentialData): string[] {
  return credential.disclosures.map((d) => d.claimName)
}

export async function createPresentation(
  combined: string,
  claimsToDisclose: string[],
  options: { audience?: string; nonce?: string } = {}
): Promise<PresentationResult> {
  const response = await apiService.post<{ presentation: PresentationResult }>(
    '/sdjwt/presentation',
    { credential: combined, claimsToDisclose, audience: options.audience, nonce: options.nonce }
  )
  return response.presentation
}

export async function verifyPresentation(
  presentation: string,
  options: { expectedAudience?: string; expectedNonce?: string } = {}
): Promise<VerificationResult> {
  return apiService.post<VerificationResult>('/sdjwt/verify', {
    presentation,
    expectedAudience: options.expectedAudience,
    expectedNonce: options.expectedNonce,
  })
}

export async function getSDJWTInfo(): Promise<SDJWTInfo> {
  return apiService.get<SDJWTInfo>('/sdjwt/info')
}

export function generateNonce(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('')
}
