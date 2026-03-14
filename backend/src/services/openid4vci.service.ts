/**
 * OpenID4VCI Service — Barrel Module
 *
 * Implements the OpenID for Verifiable Credential Issuance specification.
 * https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html
 *
 * This file contains types, metadata, and re-exports from sub-modules:
 * - openid4vci-offers.service.ts — Offer CRUD, token exchange, storage, cleanup
 * - openid4vci-signing.service.ts — Signing, issuance, batch, deferred
 */

import { SD_CLAIMS_BY_TYPE as _SD_CLAIMS } from './openid4vci-signing.service'

// ==================== Re-exports ====================

// Offers & storage
export {
  createCredentialOffer,
  getCredentialOffer,
  exchangePreAuthorizedCode,
  validateAccessToken,
  listCredentialOffers,
  cleanupExpired,
  startCleanupInterval,
  stopCleanupInterval,
  getOffersStorage,
  getTokensStorage,
  getDeferredStorage,
  getNonceStorage,
  type StoredCredentialOffer,
  type StoredAccessToken,
  type StoredDeferredCredential,
  type StoredNonce,
} from './openid4vci-offers.service'

// Signing & issuance
export {
  SD_CLAIMS_BY_TYPE,
  getSigningKeyPair,
  signCredentialDirect,
  issueCredential,
  buildCredentialSubject,
  issueBatchCredentials,
  getDeferredCredential,
} from './openid4vci-signing.service'

// ==================== Types ====================

export interface CredentialOffer {
  credential_issuer: string
  credential_configuration_ids: string[]
  credentials?: string[] // deprecated, backward compat
  grants: {
    'urn:ietf:params:oauth:grant-type:pre-authorized_code'?: {
      'pre-authorized_code': string
      tx_code?: {
        input_mode: string
        length: number
        description?: string
      }
      user_pin_required?: boolean // deprecated, backward compat
    }
    authorization_code?: {
      issuer_state?: string
    }
  }
}

export interface IssuerMetadata {
  credential_issuer: string
  authorization_server?: string
  credential_endpoint: string
  batch_credential_endpoint?: string
  deferred_credential_endpoint?: string
  credential_configurations_supported: Record<string, CredentialConfiguration>
  display?: IssuerDisplay[]
}

export interface CredentialConfiguration {
  format: string
  scope?: string
  cryptographic_binding_methods_supported?: string[]
  credential_signing_alg_values_supported?: string[]
  credential_definition: {
    type: string[]
    credentialSubject?: Record<string, unknown>
  }
  display?: CredentialDisplay[]
}

export interface IssuerDisplay {
  name: string
  locale?: string
  logo?: {
    uri: string
    alt_text?: string
  }
}

export interface CredentialDisplay {
  name: string
  locale?: string
  logo?: {
    uri: string
    alt_text?: string
  }
  description?: string
  background_color?: string
  text_color?: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  c_nonce?: string
  c_nonce_expires_in?: number
}

export interface CredentialRequest {
  format: string
  credential_configuration_id?: string
  credential_definition?: {
    type: string[]
  }
  proof?: {
    proof_type: string
    jwt: string
  }
}

export interface CredentialResponse {
  format: string
  credential?: string
  acceptance_token?: string
  c_nonce?: string
  c_nonce_expires_in?: number
}

// ==================== Metadata ====================

/**
 * Get issuer base URL
 */
export function getIssuerBaseUrl(): string {
  return process.env.ISSUER_BASE_URL || 'http://localhost:3001'
}

/**
 * Base credential configuration definitions.
 * SD-JWT VC variants are auto-generated from these with _sdjwt suffix.
 */
interface BaseCredentialConfig {
  scope: string
  credentialType: string
  credentialSubject: Record<string, unknown>
  displayName: string
  description: string
  backgroundColor: string
  logo?: { uri: string; alt_text: string }
}

function buildCredentialConfigurations(baseUrl: string): Record<string, CredentialConfiguration> {
  const baseConfigs: Record<string, BaseCredentialConfig> = {
    AIAgentIdentityCredential: {
      scope: 'agent_identity',
      credentialType: 'AIAgentIdentityCredential',
      credentialSubject: {
        agent_id: { mandatory: true, display: [{ name: 'Agent ID' }] },
        agent_type: { mandatory: true, display: [{ name: 'Agent Type' }] },
        agent_name: { mandatory: true, display: [{ name: 'Agent Name' }] },
        capabilities: { mandatory: false, display: [{ name: 'Capabilities' }] },
        owner_did: { mandatory: true, display: [{ name: 'Owner DID' }] },
        trust_level: { mandatory: false, display: [{ name: 'Trust Level' }] },
      },
      displayName: 'AI Agent Identity',
      description: 'Credential proving the identity and capabilities of an AI agent',
      backgroundColor: '#1E3A5F',
      logo: { uri: `${baseUrl}/logo.png`, alt_text: 'AI Agent Identity Logo' },
    },
    DelegationCredential: {
      scope: 'delegation',
      credentialType: 'DelegationCredential',
      credentialSubject: {
        delegation_id: { mandatory: true },
        delegator_did: { mandatory: true },
        delegate_did: { mandatory: true },
        scope: { mandatory: true },
        valid_until: { mandatory: true },
      },
      displayName: 'Delegation Credential',
      description: 'Credential representing delegated authority',
      backgroundColor: '#2E7D32',
    },
    CapabilityCredential: {
      scope: 'capability',
      credentialType: 'CapabilityCredential',
      credentialSubject: {
        capability_id: { mandatory: true },
        capability_type: { mandatory: true },
        resource: { mandatory: true },
        actions: { mandatory: true },
      },
      displayName: 'Capability Credential',
      description: 'Credential granting specific capabilities',
      backgroundColor: '#7B1FA2',
    },
  }

  const configs: Record<string, CredentialConfiguration> = {}

  for (const [id, base] of Object.entries(baseConfigs)) {
    const commonFields = {
      scope: base.scope,
      cryptographic_binding_methods_supported: ['did:key'] as string[],
      credential_signing_alg_values_supported: ['EdDSA'] as string[],
      credential_definition: {
        type: ['VerifiableCredential', base.credentialType],
        credentialSubject: base.credentialSubject,
      },
    }

    // JWT-VC format
    configs[id] = {
      ...commonFields,
      format: 'jwt_vc_json',
      display: [{
        name: base.displayName,
        locale: 'en-US',
        ...(base.logo ? { logo: base.logo } : {}),
        description: base.description,
        background_color: base.backgroundColor,
        text_color: '#FFFFFF',
      }],
    }

    // SD-JWT VC format (eIDAS 2.0 / EUDI ARF compliant)
    const sdSubject = { ...base.credentialSubject }
    const sdClaims = _SD_CLAIMS[base.credentialType] || []
    for (const claim of sdClaims) {
      if (sdSubject[claim]) {
        sdSubject[claim] = { ...(sdSubject[claim] as Record<string, unknown>), mandatory: false }
      }
    }

    configs[`${id}_sdjwt`] = {
      ...commonFields,
      format: 'vc+sd-jwt',
      credential_definition: {
        type: ['VerifiableCredential', base.credentialType],
        credentialSubject: sdSubject,
      },
      display: [{
        name: `${base.displayName} (SD-JWT)`,
        locale: 'en-US',
        ...(base.logo ? { logo: base.logo } : {}),
        description: `SD-JWT VC credential with selective disclosure for ${base.scope.replace('_', ' ')}`,
        background_color: base.backgroundColor,
        text_color: '#FFFFFF',
      }],
    }
  }

  return configs
}

/**
 * Get issuer metadata (/.well-known/openid-credential-issuer)
 */
export function getIssuerMetadata(): IssuerMetadata {
  const baseUrl = getIssuerBaseUrl()

  return {
    credential_issuer: baseUrl,
    credential_endpoint: `${baseUrl}/credential`,
    batch_credential_endpoint: `${baseUrl}/batch-credential`,
    deferred_credential_endpoint: `${baseUrl}/deferred-credential`,
    credential_configurations_supported: buildCredentialConfigurations(baseUrl),
    display: [
      {
        name: 'AI Agent Identity System',
        locale: 'en-US',
        logo: {
          uri: `${baseUrl}/logo.png`,
          alt_text: 'AI Agent Identity System',
        },
      },
    ],
  }
}

/**
 * Get authorization server metadata (/.well-known/oauth-authorization-server)
 */
export function getAuthorizationServerMetadata() {
  const baseUrl = getIssuerBaseUrl()

  return {
    issuer: baseUrl,
    token_endpoint: `${baseUrl}/token`,
    token_endpoint_auth_methods_supported: ['none'],
    grant_types_supported: ['urn:ietf:params:oauth:grant-type:pre-authorized_code'],
    pre_authorized_grant_anonymous_access_supported: true,
  }
}
