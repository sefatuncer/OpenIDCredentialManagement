// Credential schema definitions for AI Agent Identity System

export const AgentIdentityCredentialSchema = {
  name: 'AIAgentIdentityCredential',
  version: '1.0.0',
  attributes: [
    'agent_id',           // Unique agent identifier
    'agent_type',         // Type: CustomerSupport, DataAnalysis, etc.
    'agent_name',         // Human-readable name
    'agent_version',      // Software version
    'capabilities',       // JSON array of capabilities
    'owner_did',          // DID of the owning organization
    'owner_name',         // Name of the owning organization
    'created_at',         // ISO timestamp
    'valid_until',        // Expiration timestamp
    'trust_level',        // Level: basic, verified, certified
  ],
}

export const DelegationCredentialSchema = {
  name: 'DelegationCredential',
  version: '1.0.0',
  attributes: [
    'delegation_id',      // Unique delegation identifier
    'delegator_did',      // DID of the user delegating
    'delegator_name',     // Name of the delegator
    'delegate_did',       // DID of the AI agent
    'delegate_name',      // Name of the AI agent
    'scope',              // JSON array of permitted actions
    'constraints',        // JSON object of constraints
    'purpose',            // Purpose of delegation
    'created_at',         // ISO timestamp
    'valid_from',         // Start of validity
    'valid_until',        // End of validity
    'revocable',          // Whether delegation can be revoked
  ],
}

export const CapabilityCredentialSchema = {
  name: 'CapabilityCredential',
  version: '1.0.0',
  attributes: [
    'capability_id',      // Unique capability identifier
    'holder_did',         // DID of the capability holder
    'capability_type',    // Type: read, write, execute, admin
    'resource',           // Resource identifier
    'actions',            // JSON array of allowed actions
    'conditions',         // JSON object of conditions
    'granted_by',         // DID of the granter
    'granted_at',         // ISO timestamp
    'valid_until',        // Expiration timestamp
  ],
}

// Credential types for TypeScript
export interface AgentIdentityCredentialSubject {
  agent_id: string
  agent_type: string
  agent_name: string
  agent_version: string
  capabilities: string[]
  owner_did: string
  owner_name: string
  created_at: string
  valid_until: string
  trust_level: 'basic' | 'verified' | 'certified'
}

export interface DelegationCredentialSubject {
  delegation_id: string
  delegator_did: string
  delegator_name: string
  delegate_did: string
  delegate_name: string
  scope: string[]
  constraints: Record<string, any>
  purpose: string
  created_at: string
  valid_from: string
  valid_until: string
  revocable: boolean
}

export interface CapabilityCredentialSubject {
  capability_id: string
  holder_did: string
  capability_type: string
  resource: string
  actions: string[]
  conditions: Record<string, any>
  granted_by: string
  granted_at: string
  valid_until: string
}
