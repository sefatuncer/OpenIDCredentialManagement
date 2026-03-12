/**
 * OAuth 2.0 Bridge Service — RFC 8693 Token Exchange
 *
 * Enables VC ↔ OAuth token exchange. AI agents present a Verifiable Credential
 * and receive a short-lived OAuth access token with mapped scopes.
 */

import * as jose from 'jose'
import { v4 as uuidv4 } from 'uuid'
import { generateToken } from '../api/middleware/auth.middleware'
import { resolvePublicKeyFromDid } from './didResolver.service'
import { isCredentialRevoked } from './revocation.service'
import { logger } from '../utils/logger'

// Bridge token TTL: 15 minutes
const BRIDGE_TOKEN_TTL = '15m'
const BRIDGE_TOKEN_TTL_SECONDS = 900

// Credential type → field containing scopes/capabilities
const SCOPE_MAPPING: Record<string, string> = {
  AIAgentIdentityCredential: 'capabilities',
  DelegationCredential: 'scope',
  CapabilityCredential: 'actions',
}

// Trust level → additional scopes
const TRUST_LEVEL_SCOPES: Record<string, string[]> = {
  basic: ['trust:basic'],
  verified: ['trust:basic', 'trust:verified'],
  certified: ['trust:basic', 'trust:verified', 'trust:certified'],
}

export interface BridgeTokenResponse {
  access_token: string
  token_type: 'Bearer'
  expires_in: number
  scope: string
  issued_token_type: string
}

export interface BridgeIntrospectResponse {
  active: boolean
  sub?: string
  scope?: string
  exp?: number
  iat?: number
  source_credential_type?: string
  issuer_did?: string
}

interface ParsedVC {
  jwt: string
  payload: jose.JWTPayload & {
    vc?: {
      type?: string[]
      credentialSubject?: Record<string, unknown>
    }
    credentialSubject?: Record<string, unknown>
  }
  issuerDid: string
  credentialType: string
  credentialSubject: Record<string, unknown>
  credentialId: string
}

function parseVCJwt(vcString: string): ParsedVC {
  // Handle SD-JWT format (jwt~disclosure1~disclosure2~...)
  const jwtPart = vcString.includes('~') ? vcString.split('~')[0] : vcString

  const parts = jwtPart.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format')
  }

  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())

  const issuerDid = payload.iss
  if (!issuerDid) {
    throw new Error('Missing issuer (iss) claim in credential')
  }

  const credentialSubject = payload.vc?.credentialSubject || payload.credentialSubject || {}
  const types = payload.vc?.type || []
  const credentialType = types.find((t: string) => t !== 'VerifiableCredential') || 'VerifiableCredential'
  const credentialId = payload.jti || payload.vc?.id || uuidv4()

  return { jwt: jwtPart, payload, issuerDid, credentialType, credentialSubject, credentialId }
}

async function verifyVCSignature(jwtString: string, issuerDid: string): Promise<void> {
  const publicKey = await resolvePublicKeyFromDid(issuerDid)
  if (!publicKey) {
    throw new Error(`Cannot resolve public key for issuer DID: ${issuerDid}`)
  }

  await jose.jwtVerify(jwtString, publicKey)
}

function checkExpiration(payload: jose.JWTPayload): void {
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Credential has expired')
  }
}

export function mapCredentialToScopes(
  credentialType: string,
  credentialSubject: Record<string, unknown>
): string[] {
  const scopes: string[] = []

  // Map capabilities/scope/actions from credential
  const scopeField = SCOPE_MAPPING[credentialType]
  if (scopeField && Array.isArray(credentialSubject[scopeField])) {
    scopes.push(...(credentialSubject[scopeField] as string[]))
  }

  // Add trust level scopes
  const trustLevel = credentialSubject.trust_level as string | undefined
  if (trustLevel && TRUST_LEVEL_SCOPES[trustLevel]) {
    scopes.push(...TRUST_LEVEL_SCOPES[trustLevel])
  }

  // Add credential type scope
  scopes.push(`credential:${credentialType}`)

  return [...new Set(scopes)]
}

export async function exchangeVCForToken(
  subjectToken: string,
  requestedScope?: string
): Promise<BridgeTokenResponse> {
  // 1. Parse VC
  const vc = parseVCJwt(subjectToken)

  // 2. Verify signature
  await verifyVCSignature(vc.jwt, vc.issuerDid)

  // 3. Check expiration
  checkExpiration(vc.payload)

  // 4. Check revocation
  const revoked = await isCredentialRevoked(vc.credentialId)
  if (revoked) {
    throw new OAuthBridgeError('invalid_grant', 'Credential has been revoked')
  }

  // 5. Extract scopes
  let scopes = mapCredentialToScopes(vc.credentialType, vc.credentialSubject)

  // 6. Filter by requested scopes (intersection)
  if (requestedScope) {
    const requested = requestedScope.split(' ').filter(Boolean)
    scopes = scopes.filter(s => requested.includes(s))
    if (scopes.length === 0) {
      throw new OAuthBridgeError('invalid_scope', 'No matching scopes between credential and request')
    }
  }

  // 7. Generate bridge token
  const holderDid = vc.payload.sub || vc.credentialSubject.agent_id as string || vc.issuerDid
  const token = generateToken(
    {
      sub: holderDid as string,
      permissions: scopes,
      role: 'bridge',
    },
    undefined,
    BRIDGE_TOKEN_TTL
  )

  logger.info('OAuth bridge token issued', {
    credentialType: vc.credentialType,
    holderDid,
    scopes: scopes.join(' '),
    ttl: BRIDGE_TOKEN_TTL_SECONDS,
  })

  return {
    access_token: token,
    token_type: 'Bearer',
    expires_in: BRIDGE_TOKEN_TTL_SECONDS,
    scope: scopes.join(' '),
    issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
  }
}

export function getScopeMappings(): {
  mappings: Record<string, { field: string; example: string[] }>
  trust_levels: Record<string, string[]>
} {
  return {
    mappings: {
      AIAgentIdentityCredential: {
        field: 'capabilities',
        example: ['read', 'write', 'execute', 'trust:verified'],
      },
      DelegationCredential: {
        field: 'scope',
        example: ['api:read', 'api:write', 'data:access'],
      },
      CapabilityCredential: {
        field: 'actions',
        example: ['read', 'execute', 'admin'],
      },
    },
    trust_levels: { ...TRUST_LEVEL_SCOPES },
  }
}

export class OAuthBridgeError extends Error {
  constructor(
    public readonly errorCode: string,
    public readonly errorDescription: string,
    public readonly statusCode: number = 400
  ) {
    super(errorDescription)
    this.name = 'OAuthBridgeError'
  }
}
