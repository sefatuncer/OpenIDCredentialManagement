/**
 * OpenID Connect Service for Issuer Authentication
 *
 * Provides OIDC authentication for credential issuers
 */

import * as crypto from 'crypto'
import { logger } from '../utils/logger'
import {
  IStorageAdapter,
  createStorageAdapter,
  getStorageType,
} from '../core/storage'

export interface OIDCConfig {
  issuerUrl: string
  clientId: string
  clientSecret?: string
  redirectUri: string
  scopes: string[]
  responseType: 'code' | 'token' | 'id_token'
}

export interface OIDCTokens {
  accessToken: string
  idToken?: string
  refreshToken?: string
  tokenType: string
  expiresIn: number
  scope?: string
}

export interface OIDCUserInfo {
  sub: string
  name?: string
  email?: string
  emailVerified?: boolean
  picture?: string
  [key: string]: any
}

export interface OIDCMetadata {
  issuer: string
  authorizationEndpoint: string
  tokenEndpoint: string
  userinfoEndpoint?: string
  jwksUri: string
  registrationEndpoint?: string
  scopesSupported?: string[]
  responseTypesSupported: string[]
  grantTypesSupported?: string[]
}

interface AuthSession {
  state: string
  nonce: string
  codeVerifier?: string
  redirectUri: string
  createdAt: Date
}

interface StoredOIDCConfig extends OIDCConfig {
  providerId: string
}

class OIDCService {
  private configsStorage: IStorageAdapter<StoredOIDCConfig> | null = null
  private metadataCache: Map<string, OIDCMetadata> = new Map()
  private sessions: Map<string, AuthSession> = new Map()

  private getConfigsStorage(): IStorageAdapter<StoredOIDCConfig> {
    if (!this.configsStorage) {
      this.configsStorage = createStorageAdapter<StoredOIDCConfig>('oidc_provider_configs')
      logger.info('OIDC provider configs storage initialized', { type: getStorageType() })
    }
    return this.configsStorage
  }

  /**
   * Register an OIDC provider
   */
  async registerProvider(providerId: string, config: OIDCConfig): Promise<void> {
    await this.getConfigsStorage().save(providerId, { providerId, ...config })
    logger.info(`OIDC provider registered: ${providerId}`)
  }

  /**
   * Get registered provider
   */
  async getProvider(providerId: string): Promise<OIDCConfig | null> {
    return this.getConfigsStorage().get(providerId)
  }

  /**
   * List registered providers
   */
  async listProviders(): Promise<string[]> {
    const configs = await this.getConfigsStorage().list()
    return configs.map(c => c.providerId)
  }

  /**
   * Discover OIDC metadata from well-known endpoint
   */
  async discoverMetadata(issuerUrl: string): Promise<OIDCMetadata> {
    // Check cache first
    const cached = this.metadataCache.get(issuerUrl)
    if (cached) {
      return cached
    }

    // Security check: warn if not using HTTPS
    if (!issuerUrl.startsWith('https://')) {
      logger.warn(`SECURITY WARNING: OIDC issuer URL is not using HTTPS: ${issuerUrl}. This is insecure and should not be used in production.`)
    }

    const wellKnownUrl = `${issuerUrl.replace(/\/$/, '')}/.well-known/openid-configuration`

    try {
      const response = await fetch(wellKnownUrl)
      if (!response.ok) {
        throw new Error(`Failed to fetch OIDC metadata: ${response.status}`)
      }

      const metadata = (await response.json()) as Record<string, any>

      const oidcMetadata: OIDCMetadata = {
        issuer: metadata.issuer,
        authorizationEndpoint: metadata.authorization_endpoint,
        tokenEndpoint: metadata.token_endpoint,
        userinfoEndpoint: metadata.userinfo_endpoint,
        jwksUri: metadata.jwks_uri,
        registrationEndpoint: metadata.registration_endpoint,
        scopesSupported: metadata.scopes_supported,
        responseTypesSupported: metadata.response_types_supported,
        grantTypesSupported: metadata.grant_types_supported,
      }

      // Cache for 1 hour
      this.metadataCache.set(issuerUrl, oidcMetadata)
      setTimeout(() => this.metadataCache.delete(issuerUrl), 60 * 60 * 1000)

      return oidcMetadata
    } catch (error) {
      logger.error(`Failed to discover OIDC metadata for ${issuerUrl}:`, error)
      throw error
    }
  }

  /**
   * Generate authorization URL
   */
  async getAuthorizationUrl(
    providerId: string,
    options: { state?: string; nonce?: string; prompt?: string } = {}
  ): Promise<{ url: string; state: string; nonce: string }> {
    const config = await this.getProvider(providerId)
    if (!config) {
      throw new Error(`Provider not found: ${providerId}`)
    }

    const metadata = await this.discoverMetadata(config.issuerUrl)

    const state = options.state || this.generateRandomString(32)
    const nonce = options.nonce || this.generateRandomString(32)
    const codeVerifier = this.generateRandomString(64)
    const codeChallenge = this.generateCodeChallenge(codeVerifier)

    // Store session
    this.sessions.set(state, {
      state,
      nonce,
      codeVerifier,
      redirectUri: config.redirectUri,
      createdAt: new Date(),
    })

    // Clean up old sessions
    this.cleanupSessions()

    const params = new URLSearchParams({
      response_type: config.responseType,
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: config.scopes.join(' '),
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    })

    if (options.prompt) {
      params.set('prompt', options.prompt)
    }

    const url = `${metadata.authorizationEndpoint}?${params.toString()}`

    return { url, state, nonce }
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCode(
    providerId: string,
    code: string,
    state: string
  ): Promise<OIDCTokens> {
    const config = await this.getProvider(providerId)
    if (!config) {
      throw new Error(`Provider not found: ${providerId}`)
    }

    const session = this.sessions.get(state)
    if (!session) {
      throw new Error('Invalid or expired state')
    }

    const metadata = await this.discoverMetadata(config.issuerUrl)

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: session.redirectUri,
      client_id: config.clientId,
    })

    if (config.clientSecret) {
      params.set('client_secret', config.clientSecret)
    }

    if (session.codeVerifier) {
      params.set('code_verifier', session.codeVerifier)
    }

    const response = await fetch(metadata.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { error_description?: string }
      throw new Error(error.error_description || `Token exchange failed: ${response.status}`)
    }

    const tokenResponse = (await response.json()) as Record<string, any>

    // Clean up session
    this.sessions.delete(state)

    return {
      accessToken: tokenResponse.access_token,
      idToken: tokenResponse.id_token,
      refreshToken: tokenResponse.refresh_token,
      tokenType: tokenResponse.token_type || 'Bearer',
      expiresIn: tokenResponse.expires_in || 3600,
      scope: tokenResponse.scope,
    }
  }

  /**
   * Get user info from OIDC provider
   */
  async getUserInfo(providerId: string, accessToken: string): Promise<OIDCUserInfo> {
    const config = await this.getProvider(providerId)
    if (!config) {
      throw new Error(`Provider not found: ${providerId}`)
    }

    const metadata = await this.discoverMetadata(config.issuerUrl)

    if (!metadata.userinfoEndpoint) {
      throw new Error('UserInfo endpoint not available')
    }

    const response = await fetch(metadata.userinfoEndpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.status}`)
    }

    return (await response.json()) as OIDCUserInfo
  }

  /**
   * Refresh access token
   */
  async refreshToken(providerId: string, refreshToken: string): Promise<OIDCTokens> {
    const config = await this.getProvider(providerId)
    if (!config) {
      throw new Error(`Provider not found: ${providerId}`)
    }

    const metadata = await this.discoverMetadata(config.issuerUrl)

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.clientId,
    })

    if (config.clientSecret) {
      params.set('client_secret', config.clientSecret)
    }

    const response = await fetch(metadata.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { error_description?: string }
      throw new Error(error.error_description || `Token refresh failed: ${response.status}`)
    }

    const tokenResponse = (await response.json()) as Record<string, any>

    return {
      accessToken: tokenResponse.access_token,
      idToken: tokenResponse.id_token,
      refreshToken: tokenResponse.refresh_token || refreshToken,
      tokenType: tokenResponse.token_type || 'Bearer',
      expiresIn: tokenResponse.expires_in || 3600,
      scope: tokenResponse.scope,
    }
  }

  /**
   * Validate ID token (basic validation)
   *
   * WARNING: This performs only basic structural validation (format, expiration, nonce).
   * For production use, you MUST implement proper cryptographic signature verification
   * by fetching the provider's JWKS and verifying the token signature against the public keys.
   * Without signature verification, tokens could be forged by malicious actors.
   */
  validateIdToken(idToken: string, expectedNonce?: string): {
    valid: boolean
    payload?: any
    error?: string
  } {
    // TODO: Implement signature verification using JWKS for production security
    logger.warn('ID token validation does not verify signature - implement JWKS verification for production')

    try {
      const parts = idToken.split('.')
      if (parts.length !== 3) {
        return { valid: false, error: 'Invalid token format' }
      }

      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())

      // Check expiration
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return { valid: false, error: 'Token expired' }
      }

      // Check nonce if provided
      if (expectedNonce && payload.nonce !== expectedNonce) {
        return { valid: false, error: 'Nonce mismatch' }
      }

      return { valid: true, payload }
    } catch (error) {
      return { valid: false, error: (error as Error).message }
    }
  }

  // Helper methods

  private generateRandomString(length: number): string {
    return crypto.randomBytes(length).toString('base64url').substring(0, length)
  }

  private generateCodeChallenge(verifier: string): string {
    return crypto.createHash('sha256').update(verifier).digest('base64url')
  }

  private cleanupSessions(): void {
    const maxAge = 10 * 60 * 1000 // 10 minutes
    const now = Date.now()

    for (const [state, session] of this.sessions) {
      if (now - session.createdAt.getTime() > maxAge) {
        this.sessions.delete(state)
      }
    }
  }
}

export const oidcService = new OIDCService()
