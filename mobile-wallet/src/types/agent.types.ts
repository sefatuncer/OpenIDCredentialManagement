/**
 * AI Agent Identity Types
 * Based on research from:
 * - https://arxiv.org/html/2511.02841v1 (AI Agents with DIDs and VCs)
 * - https://arxiv.org/abs/2601.14982 (Digital Identity Delegation for AI Agents)
 */

// Agent Status
export type AgentStatus = 'active' | 'suspended' | 'revoked' | 'pending';

// Agent Type Classification
export type AgentType =
  | 'autonomous'      // Fully autonomous AI agents
  | 'semi-autonomous' // Human-supervised agents
  | 'assistant'       // Human-controlled assistants
  | 'service'         // Background service agents
  | 'orchestrator';   // Multi-agent orchestrators

// Trust Level for agents
export type TrustLevel = 'low' | 'medium' | 'high' | 'verified';

/**
 * AI Agent Identity
 * Each agent maintains a dedicated digital wallet storing private keys
 * associated with their DID and Verifiable Credentials issued by trusted parties
 */
export interface AgentIdentity {
  id: string;
  did: string;
  name: string;
  type: AgentType;
  status: AgentStatus;
  trustLevel: TrustLevel;

  // Owner information
  owner: {
    did: string;
    name: string;
    type: 'human' | 'organization' | 'agent';
  };

  // Agent metadata
  metadata: {
    version: string;
    model?: string;           // AI model (e.g., "gpt-4", "claude-3")
    framework?: string;       // Framework (e.g., "langchain", "autogen")
    capabilities: string[];   // List of capabilities
    createdAt: string;
    updatedAt: string;
    lastActiveAt?: string;
  };

  // Security domain
  securityDomain?: {
    id: string;
    name: string;
    orchestratorDid?: string;
  };
}

/**
 * Basic Verifiable Credential (bVC)
 * Minimal credential containing only rudimentary information that
 * "an entity is an agent, without specifying roles, attributes, capabilities"
 */
export interface BasicAgentCredential {
  id: string;
  type: ['VerifiableCredential', 'BasicAgentCredential'];
  issuer: string;  // Security domain orchestrator
  issuanceDate: string;
  expirationDate?: string;
  credentialSubject: {
    id: string;           // Agent DID
    isAgent: true;
    securityDomain: string;
    registrationTimestamp: string;
  };
  proof?: CredentialProof;
}

/**
 * Rich Verifiable Credential (rVC)
 * Enhanced credentials specifying identity attributes such as roles,
 * capabilities, or authorizations of an agent
 */
export interface RichAgentCredential {
  id: string;
  type: ['VerifiableCredential', 'RichAgentCredential'];
  issuer: string;
  issuanceDate: string;
  expirationDate?: string;
  credentialSubject: {
    id: string;                    // Agent DID
    name: string;
    type: AgentType;
    roles: string[];
    capabilities: AgentCapability[];
    authorizations: Authorization[];
    constraints?: AgentConstraints;
    attestedBy?: string[];         // DIDs of attesting agents
  };
  proof?: CredentialProof;
}

/**
 * Agent Capability
 * Defines what an agent can do
 */
export interface AgentCapability {
  id: string;
  name: string;
  description: string;
  category: 'data' | 'compute' | 'communication' | 'transaction' | 'delegation';
  scope: string[];           // Allowed scope
  constraints?: {
    rateLimit?: number;      // Max operations per hour
    maxAmount?: number;      // Max transaction amount
    requiredApproval?: boolean;
  };
}

/**
 * Authorization
 * What an agent is authorized to do
 */
export interface Authorization {
  id: string;
  action: string;
  resource: string;
  effect: 'allow' | 'deny';
  conditions?: Record<string, unknown>;
  expiresAt?: string;
}

/**
 * Agent Constraints
 * Limits on agent behavior
 */
export interface AgentConstraints {
  maxDelegationDepth: number;     // How deep can delegation chain go
  allowedDomains: string[];       // Allowed security domains
  blockedActions: string[];       // Actions the agent cannot perform
  requireHumanApproval: string[]; // Actions requiring human approval
  operatingHours?: {
    timezone: string;
    start: string;
    end: string;
  };
}

/**
 * Delegation Grant (DG)
 * First-class authorization artifact that encodes revocable transfers
 * of authority with enforced scope reduction
 */
export interface DelegationGrant {
  id: string;
  type: ['VerifiableCredential', 'DelegationGrant'];
  issuer: string;          // Delegator DID
  holder: string;          // Delegatee (agent) DID
  issuanceDate: string;
  expirationDate: string;

  // Delegation specifics
  delegation: {
    delegator: {
      did: string;
      name: string;
      type: 'human' | 'organization' | 'agent';
    };
    delegatee: {
      did: string;
      name: string;
      type: AgentType;
    };

    // Scope of delegation - must be subset of delegator's permissions
    scope: {
      actions: string[];
      resources: string[];
      constraints: {
        maxAmount?: number;
        timeWindow?: string;
        approvalRequired?: boolean;
      };
    };

    // Chain information for multi-level delegation
    chain?: {
      depth: number;
      maxDepth: number;
      parentGrantId?: string;
      rootDelegator: string;
    };

    // Revocation
    revocation: {
      revocable: boolean;
      revokedAt?: string;
      revokedBy?: string;
      reason?: string;
    };
  };

  proof?: CredentialProof;
}

/**
 * Credential Proof
 * Cryptographic proof for credentials
 */
export interface CredentialProof {
  type: string;              // e.g., "Ed25519Signature2020"
  created: string;
  verificationMethod: string;
  proofPurpose: string;
  proofValue: string;
}

/**
 * Agent Wallet
 * The complete wallet structure for an AI agent
 */
export interface AgentWallet {
  // Identity
  identity: AgentIdentity;

  // Keys (stored securely)
  keys: {
    did: string;
    keyId: string;
    algorithm: string;
    publicKey: string;
    // privateKey is never exposed, managed by key management service
  }[];

  // Credentials
  credentials: {
    basic: BasicAgentCredential | null;
    rich: RichAgentCredential[];
    delegations: DelegationGrant[];
    others: VerifiableCredential[];
  };

  // Trust relationships
  trustedAgents: {
    did: string;
    name: string;
    trustLevel: TrustLevel;
    establishedAt: string;
    lastInteractionAt?: string;
  }[];

  // Activity log
  activityLog: AgentActivity[];
}

/**
 * Verifiable Credential (generic)
 */
export interface VerifiableCredential {
  '@context': string[];
  id: string;
  type: string[];
  issuer: string;
  issuanceDate: string;
  expirationDate?: string;
  credentialSubject: Record<string, unknown>;
  credentialStatus?: {
    id: string;
    type: string;
    statusListIndex: string;
    statusListCredential: string;
  };
  proof?: CredentialProof;
}

/**
 * Agent Activity
 * Audit log for agent actions
 */
export interface AgentActivity {
  id: string;
  timestamp: string;
  action: string;
  resource?: string;
  result: 'success' | 'failure' | 'pending';
  delegationUsed?: string;
  details?: Record<string, unknown>;
}

/**
 * Agent Registration Request
 */
export interface AgentRegistrationRequest {
  name: string;
  type: AgentType;
  owner: {
    did: string;
    name: string;
    type: 'human' | 'organization' | 'agent';
  };
  capabilities: string[];
  securityDomain?: string;
  metadata?: {
    model?: string;
    framework?: string;
    version?: string;
  };
}

/**
 * Delegation Request
 */
export interface DelegationRequest {
  delegateeToDid: string;
  scope: {
    actions: string[];
    resources: string[];
    constraints?: Record<string, unknown>;
  };
  duration: string;         // ISO 8601 duration (e.g., "P30D")
  revocable: boolean;
  requireApproval?: boolean;
}

/**
 * Trust Establishment Request
 * For agent-to-agent trust
 */
export interface TrustEstablishmentRequest {
  targetAgentDid: string;
  trustLevel: TrustLevel;
  mutualTrust: boolean;     // If true, both agents trust each other
  validityPeriod?: string;  // ISO 8601 duration
}

/**
 * Verification Result
 */
export interface VerificationResult {
  valid: boolean;
  agent?: {
    did: string;
    name: string;
    type: AgentType;
    trustLevel: TrustLevel;
  };
  checks: {
    signature: boolean;
    expiration: boolean;
    revocation: boolean;
    delegation?: boolean;
    capability?: boolean;
  };
  errors?: string[];
  warnings?: string[];
}
