/**
 * Agent Credential Request Service
 *
 * Handles external AI agent credential requests with proof verification.
 * Implements the federated trust model described in AGENT_ONBOARDING.md
 */

import { v4 as uuidv4 } from 'uuid'
import { logger } from '../utils/logger'
import { getTrustedEntity, getEntityTrustLevel, TrustLevel } from './trustRegistry.service'
import { getAgentByDid, registerAgent, logAgentActivity, TrustLevel as AgentTrustLevel } from './agent.service'
import { query, queryOne } from '../database/connection'
import {
  IStorageAdapter,
  createStorageAdapter,
  getStorageType,
} from '../core/storage'

// Capability definitions with risk levels
export const CAPABILITIES = {
  // Low risk
  'text-generation': { risk: 'low', description: 'Generate text content' },
  'code-analysis': { risk: 'low', description: 'Analyze code' },
  'image-generation': { risk: 'low', description: 'Generate images' },

  // Medium risk
  'web-search': { risk: 'medium', description: 'Search the web' },
  'api-call': { risk: 'medium', description: 'Make API calls' },
  'file-read': { risk: 'medium', description: 'Read files' },

  // High risk
  'file-write': { risk: 'high', description: 'Write files' },
  'code-execution': { risk: 'high', description: 'Execute code' },
  'network-access': { risk: 'high', description: 'Access network resources' },

  // Critical risk
  'delegation': { risk: 'critical', description: 'Delegate permissions' },
  'agent-spawn': { risk: 'critical', description: 'Spawn new agents' },
  'credential-issue': { risk: 'critical', description: 'Issue credentials' },
} as const

// Trust level to allowed capabilities mapping
const TRUST_LEVEL_CAPABILITIES: Record<AgentTrustLevel, string[]> = {
  low: ['text-generation', 'code-analysis', 'image-generation'],
  medium: ['text-generation', 'code-analysis', 'image-generation', 'web-search', 'api-call', 'file-read'],
  high: ['text-generation', 'code-analysis', 'image-generation', 'web-search', 'api-call', 'file-read', 'file-write', 'code-execution', 'network-access'],
  verified: Object.keys(CAPABILITIES),
}

// Storage types for persistent partner keys and org agent counts
interface StoredPartnerKey {
  organizationDid: string
  organizationName: string
  trustLevel: AgentTrustLevel
}

interface StoredOrgAgentCount {
  count: number
}

// Persistent storage (PostgreSQL via IStorageAdapter)
let partnerKeysStorage: IStorageAdapter<StoredPartnerKey> | null = null
let orgAgentCountsStorage: IStorageAdapter<StoredOrgAgentCount> | null = null

function getPartnerKeysStorage(): IStorageAdapter<StoredPartnerKey> {
  if (!partnerKeysStorage) {
    partnerKeysStorage = createStorageAdapter<StoredPartnerKey>('partner_keys')
    logger.info('Partner keys storage initialized', { type: getStorageType() })
  }
  return partnerKeysStorage
}

function getOrgAgentCountsStorage(): IStorageAdapter<StoredOrgAgentCount> {
  if (!orgAgentCountsStorage) {
    orgAgentCountsStorage = createStorageAdapter<StoredOrgAgentCount>('org_agent_counts')
    logger.info('Organization agent counts storage initialized', { type: getStorageType() })
  }
  return orgAgentCountsStorage
}

const MAX_AGENTS_PER_ORG = 100

export interface CredentialRequestInput {
  agent: {
    name: string
    type: 'autonomous' | 'semi-autonomous' | 'assistant' | 'service' | 'orchestrator'
    requestedCapabilities: string[]
  }
  proof: OrganizationApprovalProof | ExistingCredentialProof | PartnerKeyProof
}

interface OrganizationApprovalProof {
  type: 'organization_approval'
  organizationDid: string
  organizationName: string
  approval: {
    signedBy: string
    signature: string
    timestamp: string
    nonce: string
  }
}

interface ExistingCredentialProof {
  type: 'existing_credential'
  credential: string
  issuer: string
}

interface PartnerKeyProof {
  type: 'partner_key'
  apiKey: string
  apiSecret: string
}

export interface CredentialRequestResult {
  success: boolean
  error?: string
  message?: string
  details?: Record<string, unknown>
  agent?: {
    id: string
    did: string
    name: string
    type: string
    owner: {
      did: string
      name: string
    }
  }
  credential?: {
    format: string
    credential: string
    expiresAt: string
  }
  grantedCapabilities?: string[]
  trustLevel?: AgentTrustLevel
  restrictions?: {
    maxApiCallsPerDay: number
    allowedDomains: string[]
    dataRetentionDays: number
  }
}

/**
 * Process agent credential request
 */
export async function processCredentialRequest(input: CredentialRequestInput): Promise<CredentialRequestResult> {
  const { agent, proof } = input

  // Step 1: Validate proof and determine trust level
  const proofResult = await validateProof(proof)
  if (!proofResult.valid) {
    return {
      success: false,
      error: proofResult.error || 'proof_invalid',
      message: proofResult.message || 'Proof validation failed',
      details: proofResult.details,
    }
  }

  const organizationDid = proofResult.organizationDid!
  const organizationName = proofResult.organizationName!
  const trustLevel = proofResult.trustLevel!

  // Step 2: Check organization limits
  const countRecord = await getOrgAgentCountsStorage().get(organizationDid)
  const currentCount = countRecord?.count || 0
  if (currentCount >= MAX_AGENTS_PER_ORG) {
    return {
      success: false,
      error: 'organization_limit_exceeded',
      message: 'Organization agent limit reached',
      details: {
        currentAgents: currentCount,
        maxAgents: MAX_AGENTS_PER_ORG,
        suggestion: 'Upgrade your plan or revoke unused agents',
      },
    }
  }

  // Step 3: Validate requested capabilities
  const capabilityResult = validateCapabilities(agent.requestedCapabilities, trustLevel)
  if (!capabilityResult.valid) {
    return {
      success: false,
      error: 'capability_not_allowed',
      message: capabilityResult.message,
      details: {
        requestedCapability: capabilityResult.deniedCapability,
        requiredTrustLevel: capabilityResult.requiredLevel,
        currentTrustLevel: trustLevel,
      },
    }
  }

  // Step 4: Register agent
  const registeredAgent = await registerAgent({
    name: agent.name,
    type: agent.type,
    owner: {
      did: organizationDid,
      name: organizationName,
      type: 'organization',
    },
    capabilities: capabilityResult.grantedCapabilities,
    metadata: {
      proofType: proof.type,
      registeredAt: new Date().toISOString(),
    },
  })

  // Step 5: Update agent trust level
  await query(
    `UPDATE agents SET trust_level = $1 WHERE id = $2`,
    [trustLevel, registeredAgent.id]
  )

  // Step 6: Generate credential
  const credential = await generateAgentCredential(registeredAgent.did, {
    name: agent.name,
    type: agent.type,
    capabilities: capabilityResult.grantedCapabilities,
    owner: { did: organizationDid, name: organizationName },
    trustLevel,
  })

  // Step 7: Update organization agent count
  await getOrgAgentCountsStorage().save(organizationDid, { count: currentCount + 1 })

  // Step 8: Log activity
  await logAgentActivity(registeredAgent.id, 'credential_requested', 'success', undefined, {
    proofType: proof.type,
    grantedCapabilities: capabilityResult.grantedCapabilities,
  })

  logger.info('Agent credential issued', {
    agentDid: registeredAgent.did,
    organizationDid,
    trustLevel,
    capabilities: capabilityResult.grantedCapabilities,
  })

  return {
    success: true,
    agent: {
      id: registeredAgent.id,
      did: registeredAgent.did,
      name: agent.name,
      type: agent.type,
      owner: {
        did: organizationDid,
        name: organizationName,
      },
    },
    credential: {
      format: 'jwt_vc_json',
      credential: credential.jwt,
      expiresAt: credential.expiresAt,
    },
    grantedCapabilities: capabilityResult.grantedCapabilities,
    trustLevel,
    restrictions: getRestrictions(trustLevel),
  }
}

/**
 * Validate proof from agent
 */
async function validateProof(proof: CredentialRequestInput['proof']): Promise<{
  valid: boolean
  error?: string
  message?: string
  details?: Record<string, unknown>
  organizationDid?: string
  organizationName?: string
  trustLevel?: AgentTrustLevel
}> {
  switch (proof.type) {
    case 'organization_approval':
      return validateOrganizationApproval(proof)
    case 'existing_credential':
      return validateExistingCredential(proof)
    case 'partner_key':
      return validatePartnerKey(proof)
    default:
      return {
        valid: false,
        error: 'invalid_proof_type',
        message: 'Unknown proof type',
      }
  }
}

/**
 * Validate organization approval proof
 */
async function validateOrganizationApproval(proof: OrganizationApprovalProof): Promise<{
  valid: boolean
  error?: string
  message?: string
  details?: Record<string, unknown>
  organizationDid?: string
  organizationName?: string
  trustLevel?: AgentTrustLevel
}> {
  const { organizationDid, organizationName, approval } = proof

  // Check if organization is in trust registry
  const trustedEntity = await getTrustedEntity(organizationDid)
  if (!trustedEntity) {
    return {
      valid: false,
      error: 'insufficient_trust',
      message: 'Organization not found in trust registry',
      details: {
        reason: 'Organization DID not found in trust registry',
        suggestion: 'Register your organization at /api/v1/organizations/register',
      },
    }
  }

  if (!trustedEntity.active) {
    return {
      valid: false,
      error: 'organization_inactive',
      message: 'Organization is not active',
    }
  }

  // Verify signature (simplified - in production use proper crypto verification)
  if (!approval.signature || approval.signature.length < 10) {
    return {
      valid: false,
      error: 'invalid_signature',
      message: 'Invalid organization signature',
    }
  }

  // Check timestamp freshness (within 1 hour)
  const signedAt = new Date(approval.timestamp)
  const now = new Date()
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000)
  if (signedAt < hourAgo) {
    return {
      valid: false,
      error: 'signature_expired',
      message: 'Approval signature has expired',
    }
  }

  // Map trust registry level to agent trust level
  const trustLevel = mapTrustLevel(trustedEntity.trustLevel)

  return {
    valid: true,
    organizationDid,
    organizationName,
    trustLevel,
  }
}

/**
 * Validate existing credential proof
 */
async function validateExistingCredential(proof: ExistingCredentialProof): Promise<{
  valid: boolean
  error?: string
  message?: string
  details?: Record<string, unknown>
  organizationDid?: string
  organizationName?: string
  trustLevel?: AgentTrustLevel
}> {
  const { credential, issuer } = proof

  // Check if issuer is trusted
  const trustedIssuer = await getTrustedEntity(issuer)
  if (!trustedIssuer) {
    return {
      valid: false,
      error: 'untrusted_issuer',
      message: 'Credential issuer is not trusted',
      details: {
        issuer,
        suggestion: 'Use a credential from a trusted issuer',
      },
    }
  }

  // Verify credential format (simplified)
  if (!credential || !credential.startsWith('eyJ')) {
    return {
      valid: false,
      error: 'invalid_credential_format',
      message: 'Invalid credential format',
    }
  }

  // Parse JWT payload (simplified)
  try {
    const parts = credential.split('.')
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format')
    }
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())

    // Check expiration
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return {
        valid: false,
        error: 'credential_expired',
        message: 'The provided credential has expired',
      }
    }

    // Extract organization info from credential
    const subject = payload.vc?.credentialSubject || payload.credentialSubject || {}

    return {
      valid: true,
      organizationDid: subject.owner_did || issuer,
      organizationName: subject.owner_name || 'Unknown Organization',
      trustLevel: mapTrustLevel(trustedIssuer.trustLevel),
    }
  } catch (e) {
    return {
      valid: false,
      error: 'credential_parse_error',
      message: 'Failed to parse credential',
    }
  }
}

/**
 * Validate partner API key proof
 */
async function validatePartnerKey(proof: PartnerKeyProof): Promise<{
  valid: boolean
  error?: string
  message?: string
  details?: Record<string, unknown>
  organizationDid?: string
  organizationName?: string
  trustLevel?: AgentTrustLevel
}> {
  const { apiKey, apiSecret } = proof

  // Check partner key from persistent storage
  const partner = await getPartnerKeysStorage().get(apiKey)
  if (!partner) {
    return {
      valid: false,
      error: 'invalid_partner_key',
      message: 'Partner API key not recognized',
    }
  }

  // Verify secret (simplified)
  const expectedSecret = `ps_${Buffer.from(apiKey).toString('base64url').substring(0, 20)}`
  if (apiSecret !== expectedSecret && apiSecret.length < 10) {
    return {
      valid: false,
      error: 'invalid_partner_secret',
      message: 'Partner API secret is invalid',
    }
  }

  return {
    valid: true,
    organizationDid: partner.organizationDid,
    organizationName: partner.organizationName,
    trustLevel: partner.trustLevel,
  }
}

/**
 * Validate requested capabilities against trust level
 */
function validateCapabilities(
  requested: string[],
  trustLevel: AgentTrustLevel
): {
  valid: boolean
  message?: string
  deniedCapability?: string
  requiredLevel?: string
  grantedCapabilities: string[]
} {
  const allowedCaps = TRUST_LEVEL_CAPABILITIES[trustLevel]
  const grantedCapabilities: string[] = []

  for (const cap of requested) {
    // Check if capability exists
    if (!(cap in CAPABILITIES)) {
      return {
        valid: false,
        message: `Unknown capability: ${cap}`,
        deniedCapability: cap,
        grantedCapabilities: [],
      }
    }

    // Check if allowed for trust level
    if (!allowedCaps.includes(cap)) {
      const capInfo = CAPABILITIES[cap as keyof typeof CAPABILITIES]
      const requiredLevel = getRequiredTrustLevel(cap)
      return {
        valid: false,
        message: `Capability '${cap}' is not allowed for trust level '${trustLevel}'`,
        deniedCapability: cap,
        requiredLevel,
        grantedCapabilities: [],
      }
    }

    grantedCapabilities.push(cap)
  }

  return {
    valid: true,
    grantedCapabilities,
  }
}

/**
 * Get required trust level for a capability
 */
function getRequiredTrustLevel(capability: string): string {
  for (const [level, caps] of Object.entries(TRUST_LEVEL_CAPABILITIES)) {
    if (caps.includes(capability)) {
      return level
    }
  }
  return 'verified'
}

/**
 * Map trust registry level to agent trust level
 */
function mapTrustLevel(registryLevel: TrustLevel): AgentTrustLevel {
  switch (registryLevel) {
    case 'untrusted':
    case 'basic':
      return 'low'
    case 'standard':
      return 'medium'
    case 'elevated':
      return 'high'
    case 'high':
      return 'verified'
    default:
      return 'low'
  }
}

/**
 * Generate agent credential JWT
 */
async function generateAgentCredential(
  agentDid: string,
  subject: {
    name: string
    type: string
    capabilities: string[]
    owner: { did: string; name: string }
    trustLevel: AgentTrustLevel
  }
): Promise<{ jwt: string; expiresAt: string }> {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000) // 1 year

  const credentialId = `urn:uuid:${uuidv4()}`

  // Create credential payload
  const payload = {
    iss: 'did:key:z6MkSystemIssuer',
    sub: agentDid,
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor(expiresAt.getTime() / 1000),
    vc: {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1',
      ],
      id: credentialId,
      type: ['VerifiableCredential', 'AgentIdentityCredential'],
      issuer: {
        id: 'did:key:z6MkSystemIssuer',
        name: 'AI Agent Identity System',
      },
      issuanceDate: now.toISOString(),
      expirationDate: expiresAt.toISOString(),
      credentialSubject: {
        id: agentDid,
        agent_name: subject.name,
        agent_type: subject.type,
        capabilities: subject.capabilities,
        owner_did: subject.owner.did,
        owner_name: subject.owner.name,
        trust_level: subject.trustLevel,
      },
    },
  }

  // Create JWT (simplified - in production use proper signing)
  const header = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = Buffer.from(`sig_${credentialId}`).toString('base64url')

  const jwt = `${header}.${body}.${signature}`

  // Store credential reference
  await query(
    `INSERT INTO agent_credentials (id, agent_id, type, credential, issued_at, expires_at)
     SELECT $1, id, $2, $3, $4, $5 FROM agents WHERE did = $6`,
    [uuidv4(), 'AgentIdentityCredential', JSON.stringify(payload.vc), now, expiresAt, agentDid]
  )

  return { jwt, expiresAt: expiresAt.toISOString() }
}

/**
 * Get restrictions based on trust level
 */
function getRestrictions(trustLevel: AgentTrustLevel): {
  maxApiCallsPerDay: number
  allowedDomains: string[]
  dataRetentionDays: number
} {
  switch (trustLevel) {
    case 'low':
      return {
        maxApiCallsPerDay: 1000,
        allowedDomains: ['*.owner-domain.com'],
        dataRetentionDays: 7,
      }
    case 'medium':
      return {
        maxApiCallsPerDay: 10000,
        allowedDomains: ['*.owner-domain.com', '*.trusted-partners.com'],
        dataRetentionDays: 30,
      }
    case 'high':
      return {
        maxApiCallsPerDay: 100000,
        allowedDomains: ['*'],
        dataRetentionDays: 90,
      }
    case 'verified':
      return {
        maxApiCallsPerDay: -1, // unlimited
        allowedDomains: ['*'],
        dataRetentionDays: 365,
      }
  }
}

/**
 * Register a partner API key
 */
export async function registerPartnerKey(
  apiKey: string,
  organizationDid: string,
  organizationName: string,
  trustLevel: AgentTrustLevel
): Promise<void> {
  await getPartnerKeysStorage().save(apiKey, { organizationDid, organizationName, trustLevel })
  logger.info('Partner key registered', { organizationDid, organizationName })
}

/**
 * Revoke a partner API key
 */
export async function revokePartnerKey(apiKey: string): Promise<boolean> {
  return getPartnerKeysStorage().delete(apiKey)
}

/**
 * Get organization agent count
 */
export async function getOrganizationAgentCount(organizationDid: string): Promise<number> {
  const record = await getOrgAgentCountsStorage().get(organizationDid)
  return record?.count || 0
}

/**
 * Decrement organization agent count (when agent is deleted)
 */
export async function decrementOrganizationAgentCount(organizationDid: string): Promise<void> {
  const record = await getOrgAgentCountsStorage().get(organizationDid)
  const current = record?.count || 0
  if (current > 0) {
    await getOrgAgentCountsStorage().save(organizationDid, { count: current - 1 })
  }
}
