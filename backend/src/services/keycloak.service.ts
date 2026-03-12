/**
 * Keycloak OIDC Service
 * Validates Keycloak-issued JWTs via JWKS endpoint, maps realm roles to system roles.
 */

import * as jose from 'jose'
import { logger } from '../utils/logger'

export interface KeycloakConfig {
  realmUrl: string
  clientId: string
  clientSecret?: string
  frontendClientId?: string
}

export interface KeycloakTokenPayload {
  sub: string
  preferred_username?: string
  email?: string
  realm_access?: {
    roles: string[]
  }
  resource_access?: Record<string, { roles: string[] }>
  exp: number
  iat: number
  iss: string
}

export interface KeycloakUser {
  sub: string
  username?: string
  email?: string
  roles: string[]
  permissions: string[]
}

// JWKS cache
let jwks: ReturnType<typeof jose.createRemoteJWKSet> | null = null
let jwksLastFetch = 0
const JWKS_CACHE_TTL = 10 * 60 * 1000 // 10 minutes

// Role → permission mapping
const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ['*'],
  issuer: ['credentials:issue', 'credentials:revoke', 'schemas:manage', 'audit:read'],
  verifier: ['credentials:verify', 'trust:manage', 'audit:read'],
  holder: ['credentials:hold', 'delegations:manage'],
}

let config: KeycloakConfig | null = null

export function initKeycloak(cfg: KeycloakConfig): void {
  config = cfg
  // Reset JWKS cache when config changes
  jwksLastFetch = 0
  logger.info('Keycloak service initialized', { realmUrl: cfg.realmUrl, clientId: cfg.clientId })
}

export function isKeycloakConfigured(): boolean {
  return config !== null
}

export function getKeycloakConfig(): { realmUrl: string; clientId: string; frontendClientId: string } | null {
  if (!config) return null
  return {
    realmUrl: config.realmUrl,
    clientId: config.clientId,
    frontendClientId: config.frontendClientId || config.clientId,
  }
}

function getJWKS(): ReturnType<typeof jose.createRemoteJWKSet> {
  if (!config) throw new Error('Keycloak not configured')

  const now = Date.now()
  if (!jwks || now - jwksLastFetch > JWKS_CACHE_TTL) {
    const jwksUrl = new URL(`${config.realmUrl}/protocol/openid-connect/certs`)
    jwks = jose.createRemoteJWKSet(jwksUrl)
    jwksLastFetch = now
  }
  return jwks
}

/**
 * Check if a JWT token was issued by Keycloak (by inspecting `iss` claim without full verification)
 */
export function isKeycloakToken(token: string): boolean {
  if (!config) return false
  try {
    const payload = jose.decodeJwt(token)
    return payload.iss === config.realmUrl
  } catch {
    return false
  }
}

/**
 * Validate a Keycloak-issued JWT and extract user info + roles
 */
export async function validateKeycloakToken(token: string): Promise<KeycloakUser | null> {
  if (!config) return null

  try {
    const keySet = getJWKS()
    const { payload } = await jose.jwtVerify(token, keySet, {
      issuer: config.realmUrl,
      audience: config.clientId,
    })

    const kPayload = payload as unknown as KeycloakTokenPayload
    const realmRoles = kPayload.realm_access?.roles || []
    const permissions = resolvePermissions(realmRoles)

    return {
      sub: kPayload.sub,
      username: kPayload.preferred_username,
      email: kPayload.email,
      roles: realmRoles,
      permissions,
    }
  } catch (err) {
    // If audience validation fails, retry without audience (some Keycloak configs don't include client in aud)
    try {
      const keySet = getJWKS()
      const { payload } = await jose.jwtVerify(token, keySet, {
        issuer: config.realmUrl,
      })

      const kPayload = payload as unknown as KeycloakTokenPayload
      const realmRoles = kPayload.realm_access?.roles || []
      const permissions = resolvePermissions(realmRoles)

      return {
        sub: kPayload.sub,
        username: kPayload.preferred_username,
        email: kPayload.email,
        roles: realmRoles,
        permissions,
      }
    } catch (retryErr) {
      logger.debug('Keycloak token validation failed', {
        error: retryErr instanceof Error ? retryErr.message : 'Unknown error',
      })
      return null
    }
  }
}

/**
 * Exchange authorization code for tokens (backend-side callback)
 */
export async function exchangeAuthorizationCode(
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<{ accessToken: string; refreshToken?: string; idToken?: string } | null> {
  if (!config) return null

  try {
    const tokenUrl = `${config.realmUrl}/protocol/openid-connect/token`
    // Use frontendClientId (public client) + PKCE code_verifier — NOT backend confidential client
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: config.frontendClientId || config.clientId,
      code_verifier: codeVerifier,
    })

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })

    if (!response.ok) {
      const errBody = await response.text()
      logger.warn('Keycloak token exchange failed', { status: response.status, body: errBody })
      return null
    }

    const data = await response.json() as {
      access_token: string
      refresh_token?: string
      id_token?: string
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      idToken: data.id_token,
    }
  } catch (err) {
    logger.error('Keycloak code exchange error', { error: err })
    return null
  }
}

// --- Helpers ---

function resolvePermissions(realmRoles: string[]): string[] {
  const perms = new Set<string>()
  for (const role of realmRoles) {
    const rolePerms = ROLE_PERMISSIONS[role]
    if (rolePerms) {
      for (const p of rolePerms) perms.add(p)
    }
  }
  return perms.size > 0 ? Array.from(perms) : ['read']
}
