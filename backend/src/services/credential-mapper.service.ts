/**
 * Credential Mapper Service
 * Credo credential request'lerini credential'lara dönüştürür
 */

import { v4 as uuidv4 } from 'uuid'
import { logger } from '../utils/logger'
import {
  AgentIdentityCredentialSubject,
  DelegationCredentialSubject,
  CapabilityCredentialSubject,
} from '../config/credentials.config'

// Credential configuration IDs
export const CREDENTIAL_CONFIGURATION_IDS = {
  AGENT_IDENTITY: 'AIAgentIdentityCredential',
  DELEGATION: 'DelegationCredential',
  CAPABILITY: 'CapabilityCredential',
} as const

export type CredentialConfigurationId =
  (typeof CREDENTIAL_CONFIGURATION_IDS)[keyof typeof CREDENTIAL_CONFIGURATION_IDS]

// Credential display configurations
export const CREDENTIAL_DISPLAY_CONFIGS: Record<
  CredentialConfigurationId,
  {
    name: string
    description: string
    backgroundColor: string
    textColor: string
    logo?: string
  }
> = {
  [CREDENTIAL_CONFIGURATION_IDS.AGENT_IDENTITY]: {
    name: 'AI Agent Identity',
    description: 'Credential proving the identity and capabilities of an AI agent',
    backgroundColor: '#1E3A5F',
    textColor: '#FFFFFF',
  },
  [CREDENTIAL_CONFIGURATION_IDS.DELEGATION]: {
    name: 'Delegation Credential',
    description: 'Credential representing delegated authority',
    backgroundColor: '#2E7D32',
    textColor: '#FFFFFF',
  },
  [CREDENTIAL_CONFIGURATION_IDS.CAPABILITY]: {
    name: 'Capability Credential',
    description: 'Credential granting specific capabilities',
    backgroundColor: '#7B1FA2',
    textColor: '#FFFFFF',
  },
}

/**
 * Credential mapper options
 */
export interface CredentialMapperOptions {
  credentialRequest: any
  holderBinding: {
    method: string
    didUrl?: string
  }
  credentialConfigurationId: CredentialConfigurationId
  additionalData?: Record<string, any>
}

/**
 * Mapped credential result
 */
export interface MappedCredential {
  format: 'jwt_vc_json' | 'jwt_vc_json-ld' | 'ldp_vc'
  credential: {
    '@context': string[]
    type: string[]
    issuer?: string
    issuanceDate: string
    expirationDate?: string
    credentialSubject: Record<string, any>
  }
}

/**
 * Ana credential mapper fonksiyonu
 * Credo'nun credentialRequestToCredentialMapper callback'i için kullanılır
 */
export async function mapCredentialRequest(
  options: CredentialMapperOptions
): Promise<MappedCredential> {
  const { credentialConfigurationId, holderBinding, additionalData } = options

  logger.debug('Mapping credential request', {
    configId: credentialConfigurationId,
    holderMethod: holderBinding.method,
  })

  const holderDid = holderBinding.didUrl || 'unknown'
  const now = new Date()
  const oneYearFromNow = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)

  // Credential subject'i oluştur
  const credentialSubject = buildCredentialSubject(
    credentialConfigurationId,
    holderDid,
    additionalData
  )

  // Credential tiplerini belirle
  const types = getCredentialTypes(credentialConfigurationId)

  return {
    format: 'jwt_vc_json',
    credential: {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://www.w3.org/2018/credentials/examples/v1',
      ],
      type: types,
      issuanceDate: now.toISOString(),
      expirationDate: oneYearFromNow.toISOString(),
      credentialSubject,
    },
  }
}

/**
 * Credential tipine göre types array döndür
 */
function getCredentialTypes(configId: CredentialConfigurationId): string[] {
  switch (configId) {
    case CREDENTIAL_CONFIGURATION_IDS.AGENT_IDENTITY:
      return ['VerifiableCredential', 'AIAgentIdentityCredential']
    case CREDENTIAL_CONFIGURATION_IDS.DELEGATION:
      return ['VerifiableCredential', 'DelegationCredential']
    case CREDENTIAL_CONFIGURATION_IDS.CAPABILITY:
      return ['VerifiableCredential', 'CapabilityCredential']
    default:
      return ['VerifiableCredential', configId]
  }
}

/**
 * Credential tipine göre subject oluştur
 */
function buildCredentialSubject(
  configId: CredentialConfigurationId,
  holderDid: string,
  additionalData?: Record<string, any>
): Record<string, any> {
  const now = new Date().toISOString()
  const oneYearFromNow = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()

  // Base subject with id
  const baseSubject = {
    id: holderDid,
  }

  switch (configId) {
    case CREDENTIAL_CONFIGURATION_IDS.AGENT_IDENTITY:
      return buildAgentIdentitySubject(holderDid, now, oneYearFromNow, additionalData)

    case CREDENTIAL_CONFIGURATION_IDS.DELEGATION:
      return buildDelegationSubject(holderDid, now, oneYearFromNow, additionalData)

    case CREDENTIAL_CONFIGURATION_IDS.CAPABILITY:
      return buildCapabilitySubject(holderDid, now, oneYearFromNow, additionalData)

    default:
      return {
        ...baseSubject,
        type: configId,
        issuedAt: now,
        ...additionalData,
      }
  }
}

/**
 * AI Agent Identity credential subject
 */
function buildAgentIdentitySubject(
  holderDid: string,
  now: string,
  validUntil: string,
  additionalData?: Record<string, any>
): AgentIdentityCredentialSubject & { id: string } {
  return {
    id: holderDid,
    agent_id: additionalData?.agent_id || `agent-${uuidv4().substring(0, 8)}`,
    agent_type: additionalData?.agent_type || 'autonomous',
    agent_name: additionalData?.agent_name || 'AI Agent',
    agent_version: additionalData?.agent_version || '1.0.0',
    capabilities: additionalData?.capabilities || ['text-generation', 'data-analysis'],
    owner_did: additionalData?.owner_did || holderDid,
    owner_name: additionalData?.owner_name || 'Agent Owner',
    created_at: now,
    valid_until: additionalData?.valid_until || validUntil,
    trust_level: additionalData?.trust_level || 'basic',
  }
}

/**
 * Delegation credential subject
 */
function buildDelegationSubject(
  holderDid: string,
  now: string,
  validUntil: string,
  additionalData?: Record<string, any>
): DelegationCredentialSubject & { id: string } {
  return {
    id: holderDid,
    delegation_id: additionalData?.delegation_id || `del-${uuidv4().substring(0, 8)}`,
    delegator_did: additionalData?.delegator_did || holderDid,
    delegator_name: additionalData?.delegator_name || 'Delegator',
    delegate_did: additionalData?.delegate_did || `did:key:delegate-${uuidv4().substring(0, 8)}`,
    delegate_name: additionalData?.delegate_name || 'AI Agent Delegate',
    scope: additionalData?.scope || ['read', 'write'],
    constraints: additionalData?.constraints || { max_operations: 1000 },
    purpose: additionalData?.purpose || 'General delegation',
    created_at: now,
    valid_from: additionalData?.valid_from || now,
    valid_until: additionalData?.valid_until || validUntil,
    revocable: additionalData?.revocable ?? true,
  }
}

/**
 * Capability credential subject
 */
function buildCapabilitySubject(
  holderDid: string,
  now: string,
  validUntil: string,
  additionalData?: Record<string, any>
): CapabilityCredentialSubject & { id: string } {
  return {
    id: holderDid,
    capability_id: additionalData?.capability_id || `cap-${uuidv4().substring(0, 8)}`,
    holder_did: additionalData?.holder_did || holderDid,
    capability_type: additionalData?.capability_type || 'api_access',
    resource: additionalData?.resource || 'https://api.example.com/*',
    actions: additionalData?.actions || ['read', 'write'],
    conditions: additionalData?.conditions || { rate_limit: '1000/hour' },
    granted_by: additionalData?.granted_by || 'did:key:admin',
    granted_at: now,
    valid_until: additionalData?.valid_until || validUntil,
  }
}

/**
 * Credential configuration metadata
 */
export function getCredentialConfigurationMetadata(configId: CredentialConfigurationId) {
  const displayConfig = CREDENTIAL_DISPLAY_CONFIGS[configId]

  return {
    format: 'jwt_vc_json',
    scope: configId.toLowerCase().replace('credential', ''),
    cryptographic_binding_methods_supported: ['did:key', 'did:web', 'did:peer'],
    cryptographic_suites_supported: ['EdDSA', 'ES256'],
    credential_definition: {
      type: getCredentialTypes(configId),
      credentialSubject: getCredentialSubjectSchema(configId),
    },
    display: [
      {
        name: displayConfig.name,
        locale: 'en-US',
        description: displayConfig.description,
        background_color: displayConfig.backgroundColor,
        text_color: displayConfig.textColor,
      },
    ],
  }
}

/**
 * Credential subject schema
 */
function getCredentialSubjectSchema(configId: CredentialConfigurationId): Record<string, any> {
  switch (configId) {
    case CREDENTIAL_CONFIGURATION_IDS.AGENT_IDENTITY:
      return {
        agent_id: { mandatory: true, display: [{ name: 'Agent ID' }] },
        agent_type: { mandatory: true, display: [{ name: 'Agent Type' }] },
        agent_name: { mandatory: true, display: [{ name: 'Agent Name' }] },
        capabilities: { mandatory: false, display: [{ name: 'Capabilities' }] },
        owner_did: { mandatory: true, display: [{ name: 'Owner DID' }] },
        trust_level: { mandatory: false, display: [{ name: 'Trust Level' }] },
      }

    case CREDENTIAL_CONFIGURATION_IDS.DELEGATION:
      return {
        delegation_id: { mandatory: true },
        delegator_did: { mandatory: true },
        delegate_did: { mandatory: true },
        scope: { mandatory: true },
        valid_until: { mandatory: true },
      }

    case CREDENTIAL_CONFIGURATION_IDS.CAPABILITY:
      return {
        capability_id: { mandatory: true },
        capability_type: { mandatory: true },
        resource: { mandatory: true },
        actions: { mandatory: true },
      }

    default:
      return {}
  }
}

/**
 * Tüm credential configuration'ları getir
 */
export function getAllCredentialConfigurations(): Record<
  string,
  ReturnType<typeof getCredentialConfigurationMetadata>
> {
  return {
    [CREDENTIAL_CONFIGURATION_IDS.AGENT_IDENTITY]: getCredentialConfigurationMetadata(
      CREDENTIAL_CONFIGURATION_IDS.AGENT_IDENTITY
    ),
    [CREDENTIAL_CONFIGURATION_IDS.DELEGATION]: getCredentialConfigurationMetadata(
      CREDENTIAL_CONFIGURATION_IDS.DELEGATION
    ),
    [CREDENTIAL_CONFIGURATION_IDS.CAPABILITY]: getCredentialConfigurationMetadata(
      CREDENTIAL_CONFIGURATION_IDS.CAPABILITY
    ),
  }
}

// Export mapper
export const credentialMapper = {
  map: mapCredentialRequest,
  getConfiguration: getCredentialConfigurationMetadata,
  getAllConfigurations: getAllCredentialConfigurations,
  CONFIGURATION_IDS: CREDENTIAL_CONFIGURATION_IDS,
  DISPLAY_CONFIGS: CREDENTIAL_DISPLAY_CONFIGS,
}
