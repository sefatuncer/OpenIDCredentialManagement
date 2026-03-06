/**
 * Simulation Types
 * Type definitions for the autonomous agent simulation system
 */

export type SimulationSpeed = 'slow' | 'normal' | 'fast'
export type SimulationStatus = 'idle' | 'running' | 'paused' | 'stopped'
export type AgentRole = 'issuer' | 'verifier' | 'holder'

export interface SimulationConfig {
  issuerCount: number
  verifierCount: number
  holderCount: number
  speed: SimulationSpeed
  tickDelay?: number // ms between actions
  duration?: number // seconds, undefined = infinite
}

export interface SimulationState {
  sessionId: string
  status: SimulationStatus
  agentCount: number
  eventCount: number
  startedAt: Date | null
  uptime: number // seconds
  config: SimulationConfig
}

export interface SimulationStats {
  // Existing
  totalAgents: number
  credentialsIssued: number
  delegationsCreated: number
  trustRelationships: number
  verificationsPerformed: number
  totalEvents: number
  duration: number
  // New
  messagesSent: number
  credentialsRevoked: number
  agentsDiscovered: number
  delegationChainsResolved: number
}

export interface AgentState {
  // Existing
  did: string
  name: string
  role: AgentRole
  status: 'spawning' | 'active' | 'idle' | 'terminated'
  hasBasicCredential: boolean
  hasRichCredential: boolean
  lastAction: string | null
  lastActionTime: Date | null

  // Updated counters
  credentialsIssued: number
  credentialsReceived: number
  credentialsRevoked: number
  presentationsMade: number
  verificationsPerformed: number

  // Legacy compatibility
  delegationsGiven: number
  delegationsReceived: number
  trustedAgents: string[]

  // New - Messaging
  messagesSent: number
  messagesReceived: number
  unreadMessages: number

  // New - Trust
  trustRelationships: number
  trustedBy: number
  trustScore: number

  // New - Delegation
  activeDelegations: number

  // New - Discovery
  discoveredAgents: number
  discoveredBy: number
}

export interface Observation {
  otherAgents: AgentState[]
  myCredentials: {
    basic: boolean
    rich: boolean
  }
  myDelegations: {
    given: number
    received: number
  }
  trustedAgents: string[]
  pendingRequests: unknown[]
}

// Extended ActionType
export type ActionType =
  | 'IDLE'
  // Existing
  | 'ISSUE_CREDENTIAL'
  | 'PRESENT_CREDENTIAL'
  | 'VERIFY_PRESENTATION'
  // Legacy (kept for compatibility)
  | 'REQUEST_BVC'
  | 'REQUEST_RVC'
  | 'ACCEPT_DELEGATION'
  | 'VERIFY_AGENT'
  // New - Messaging
  | 'SEND_MESSAGE'
  | 'RECEIVE_MESSAGE'
  | 'BROADCAST_MESSAGE'
  // New - Trust
  | 'ESTABLISH_TRUST'
  | 'UPDATE_TRUST'
  | 'REVOKE_TRUST'
  // New - Revocation
  | 'REVOKE_CREDENTIAL'
  // New - Delegation
  | 'CREATE_DELEGATION'
  | 'USE_DELEGATION'
  | 'REVOKE_DELEGATION'
  // New - Discovery
  | 'DISCOVER_AGENT'
  | 'UPDATE_PROFILE'

export interface Action {
  type: ActionType
  targetDid?: string
  priority: number
  params?: Record<string, unknown>
}

export interface ActionResult {
  success: boolean
  message: string
  data?: unknown
}

export interface SimulationEvent {
  id: string
  timestamp: Date
  eventType: string
  agentDid?: string
  agentName?: string
  targetDid?: string
  targetName?: string
  action?: string
  result?: string
  data?: unknown
}

// Extended NetworkEdge
export interface NetworkEdge {
  source: string
  target: string
  type: 'delegation' | 'trust' | 'communication' | 'message' | 'discovery'
  label?: string
  weight?: number // for trust score
}

export interface NetworkState {
  nodes: Array<{
    id: string
    name: string
    role: AgentRole
    status: string
  }>
  edges: NetworkEdge[]
}

// ============== NEW INTERFACES ==============

/**
 * Message between agents
 */
export interface Message {
  id: string
  from: string        // sender DID
  to: string          // receiver DID
  type: 'request' | 'response' | 'broadcast' | 'notification'
  subject: string
  content: unknown
  timestamp: Date
  read: boolean
}

/**
 * Trust relationship between agents
 */
export interface TrustRelation {
  id: string
  trustor: string     // who trusts
  trustee: string     // who is trusted
  level: 'low' | 'medium' | 'high' | 'full'
  reason: string      // why trusted
  establishedAt: Date
  expiresAt?: Date
  score: number       // 0-100
}

/**
 * Delegation from one agent to another
 */
export interface Delegation {
  id: string
  delegator: string      // who delegates
  delegate: string       // who receives delegation
  permissions: string[]  // what is delegated
  chainDepth: number     // 0 = direct, 1+ = transitive
  parentDelegationId?: string
  createdAt: Date
  expiresAt?: Date
  revoked: boolean
}

/**
 * Agent profile for discovery
 */
export interface AgentProfile {
  did: string
  name: string
  role: AgentRole
  capabilities: string[]
  publicKey?: string
  serviceEndpoint?: string
  discoveredAt: Date
  lastSeenAt: Date
  reputation: number
}

/**
 * Simulation credential with revocation support
 */
export interface SimulationCredential {
  id: string
  type: string[]
  issuer: string
  holder: string
  issuanceDate: string
  expirationDate: string
  credentialSubject: {
    id: string
    name: string
    type: string
    attributes: Record<string, unknown>
  }
  // Revocation support
  revoked: boolean
  revokedAt?: Date
  revocationReason?: string
}

/**
 * Simulation presentation for VP flow
 */
export interface SimulationPresentation {
  id: string
  type: string[]
  holder: string
  verifier: string
  verifiableCredential: SimulationCredential[]
  presentedAt: string
}

/**
 * Tick result returned by agent actions
 */
export interface TickResult {
  action: ActionType
  result: ActionResult
}

// ============== PHASE 4: ADVANCED BEHAVIORS ==============

/**
 * Agent Goal - What the agent is trying to achieve
 */
export type GoalType =
  | 'COLLECT_CREDENTIALS'      // Holder: Collect N credentials
  | 'VERIFY_AGENTS'            // Verifier: Verify N agents
  | 'ISSUE_TO_ALL'             // Issuer: Issue to all holders
  | 'BUILD_TRUST_NETWORK'      // Build trust with N agents
  | 'BECOME_HUB'               // Become central node in network
  | 'MAINTAIN_REPUTATION'      // Keep reputation above threshold
  | 'COLLABORATE_ON_TASK'      // Work with others on shared goal

export interface AgentGoal {
  id: string
  type: GoalType
  description: string
  priority: number           // 1-10, higher = more important
  progress: number           // 0-100
  target: number             // Target value to achieve
  current: number            // Current value
  deadline?: Date            // Optional deadline
  status: 'active' | 'completed' | 'failed' | 'abandoned'
  collaborators?: string[]   // DIDs of cooperating agents
  createdAt: Date
  completedAt?: Date
}

/**
 * Cooperation Request - Agent asking for help
 */
export interface CooperationRequest {
  id: string
  requester: string          // DID of requesting agent
  type: 'credential_request' | 'verification_help' | 'trust_endorsement' | 'task_share'
  description: string
  priority: number
  reward?: string            // What requester offers in return
  deadline?: Date
  status: 'pending' | 'accepted' | 'rejected' | 'completed'
  acceptedBy?: string        // DID of accepting agent
  createdAt: Date
}

/**
 * Conflict - Competing requests or resources
 */
export interface Conflict {
  id: string
  type: 'resource' | 'priority' | 'trust' | 'delegation'
  participants: string[]     // DIDs of conflicting agents
  description: string
  resolution?: 'negotiation' | 'priority' | 'random' | 'reputation'
  winner?: string            // DID of winner
  resolvedAt?: Date
  createdAt: Date
}

/**
 * Learning Memory - Past experiences for adaptation
 */
export interface LearningMemory {
  // Action success rates per target agent
  actionSuccessRates: Map<string, Map<ActionType, { success: number; total: number }>>

  // Best times to interact with agents
  optimalInteractionTimes: Map<string, number[]>

  // Learned preferences
  preferences: {
    preferredIssuers: string[]     // DIDs of reliable issuers
    preferredVerifiers: string[]   // DIDs of fair verifiers
    avoidAgents: string[]          // DIDs to avoid
  }

  // Adaptation parameters
  explorationRate: number      // 0-1, how often to try new things
  riskTolerance: number        // 0-1, how much risk to take
  cooperationBias: number      // 0-1, preference for cooperation
}

/**
 * Behavior Pattern - Complex multi-step behavior
 */
export interface BehaviorPattern {
  id: string
  name: string
  description: string
  steps: BehaviorStep[]
  currentStep: number
  status: 'idle' | 'running' | 'completed' | 'failed'
  startedAt?: Date
  completedAt?: Date
}

export interface BehaviorStep {
  action: ActionType
  condition?: string          // Condition to proceed
  targetRole?: AgentRole      // Target agent role
  targetDid?: string          // Specific target DID
  params?: Record<string, unknown>
  onSuccess: 'next' | 'complete' | 'repeat'
  onFailure: 'retry' | 'skip' | 'abort' | 'complete'
  maxRetries: number
  retryCount: number
}

/**
 * Extended ActionType for Phase 4
 */
export type Phase4ActionType =
  | ActionType
  // Cooperation
  | 'REQUEST_COOPERATION'
  | 'ACCEPT_COOPERATION'
  | 'REJECT_COOPERATION'
  | 'COMPLETE_COOPERATION'
  // Conflict
  | 'REPORT_CONFLICT'
  | 'NEGOTIATE'
  | 'YIELD'
  // Goals
  | 'SET_GOAL'
  | 'ABANDON_GOAL'
  | 'COMPLETE_GOAL'
  // Learning
  | 'ADAPT_BEHAVIOR'
  | 'EXPLORE_NEW'
