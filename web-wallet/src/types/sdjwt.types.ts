/**
 * SD-JWT (Selective Disclosure JWT) Types
 * Browser-compatible type definitions for SD-JWT operations
 */

export interface Disclosure {
  salt: string
  claimName: string
  claimValue: unknown
  encoded: string
  digest?: string
}

export interface SDJWTPayload {
  iss: string
  iat: number
  exp?: number
  nbf?: number
  sub?: string
  vc?: {
    '@context': string[]
    type: string[]
    credentialSubject: Record<string, unknown> & { _sd?: string[] }
    id?: string
  }
  _sd?: string[]
  _sd_alg?: string
  [key: string]: unknown
}

export interface ParsedSDJWT {
  jwt: string
  payload: SDJWTPayload
  disclosures: Disclosure[]
  keyBindingJwt?: string
  disclosedClaims: Record<string, unknown>
  hiddenDigests: string[]
}

export interface SDJWTCredentialData {
  id: string
  combined: string  // jwt~disclosure1~disclosure2~...
  jwt: string
  disclosures: Disclosure[]
  type: string
  issuer: string
  issuanceDate: string
  expirationDate?: string
  subject: Record<string, unknown>
  isSDJWT: true
}

export interface PresentationRequest {
  credential: SDJWTCredentialData
  claimsToDisclose: string[]
  audience?: string
  nonce?: string
}

export interface PresentationResult {
  combined: string
  jwt: string
  disclosures: Disclosure[]
  keyBindingJwt?: string
}

export interface VerificationResult {
  verified: boolean
  claims: Record<string, unknown>
  disclosedClaims: string[]
  hiddenClaims: string[]
  issuer: string
  subject?: string
  issuedAt: string
  expiresAt?: string
  error?: string
}

export interface SDJWTInfo {
  version: string
  hashAlgorithm: string
  supportedFeatures: string[]
}
