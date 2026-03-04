/**
 * AI Agent Service
 * Handles agent registration, wallet management, and credential operations
 */

import { v4 as uuidv4 } from 'uuid'
import { query, queryOne } from '../database/connection'
import { logger } from '../utils/logger'

// Types
export type AgentStatus = 'active' | 'suspended' | 'revoked' | 'pending'
export type AgentType = 'autonomous' | 'semi-autonomous' | 'assistant' | 'service' | 'orchestrator'
export type TrustLevel = 'low' | 'medium' | 'high' | 'verified'

export interface Agent {
  id: string
  did: string
  name: string
  type: AgentType
  status: AgentStatus
  trustLevel: TrustLevel
  ownerDid: string | null
  ownerName: string | null
  ownerType: 'human' | 'organization' | 'agent' | null
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export interface CreateAgentInput {
  did?: string  // Optional: Agent can bring their own DID
  name: string
  type: AgentType
  owner?: {
    did?: string
    name?: string
    type?: 'human' | 'organization' | 'agent'
  }
  capabilities?: string[]
  metadata?: Record<string, unknown>
}

export interface AgentWallet {
  identity: Agent
  keys: Array<{
    keyId: string
    did: string
    algorithm: string
    publicKey: string
  }>
  credentials: {
    basic: Record<string, unknown> | null
    rich: Array<Record<string, unknown>>
    delegations: Array<Record<string, unknown>>
    others: Array<Record<string, unknown>>
  }
  trustedAgents: Array<{
    did: string
    name: string
    type: string
    trustLevel: TrustLevel
    establishedAt: Date
  }>
  activityLog: Array<{
    id: string
    action: string
    resource: string | null
    result: string
    timestamp: Date
  }>
}

/**
 * Generate a DID for a new agent
 */
function generateDid(): string {
  const randomBytes = Buffer.from(uuidv4().replace(/-/g, ''), 'hex')
  const encoded = randomBytes.toString('base64url')
  return `did:key:z6Mk${encoded}`
}

/**
 * Validate DID format
 */
function isValidDid(did: string): boolean {
  // Basic DID format validation
  const didRegex = /^did:(key|web|peer):[a-zA-Z0-9._%-]+$/
  return didRegex.test(did)
}

/**
 * Register a new AI agent
 * Agent can bring their own DID or system will generate one
 */
export async function registerAgent(input: CreateAgentInput): Promise<Agent> {
  const id = uuidv4()
  const now = new Date()

  // Use provided DID or generate new one
  let did: string
  if (input.did) {
    // Validate external DID format
    if (!isValidDid(input.did)) {
      throw new Error('Invalid DID format. Supported methods: did:key, did:web, did:peer')
    }
    // Check if DID already exists
    const existingAgent = await getAgentByDid(input.did)
    if (existingAgent) {
      throw new Error('DID already registered')
    }
    did = input.did
  } else {
    did = generateDid()
  }

  const metadata = {
    version: '1.0.0',
    capabilities: input.capabilities || [],
    ...input.metadata,
  }

  const result = await queryOne(
    `INSERT INTO agents (id, did, name, type, status, trust_level, owner_did, owner_name, owner_type, metadata, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      id,
      did,
      input.name,
      input.type,
      'active',
      'low',
      input.owner?.did || null,
      input.owner?.name || null,
      input.owner?.type || null,
      JSON.stringify(metadata),
      now,
      now,
    ]
  )

  if (!result) {
    throw new Error('Failed to create agent')
  }

  // Create wallet for agent
  await query(
    `INSERT INTO agent_wallets (id, agent_id, keys, created_at) VALUES ($1, $2, $3, $4)`,
    [uuidv4(), id, JSON.stringify([]), now]
  )

  // Log activity
  await logAgentActivity(id, 'agent_registered', 'success')

  logger.info('Agent registered', { agentId: id, did })

  return mapAgent(result)
}

/**
 * Get agent by DID
 */
export async function getAgentByDid(did: string): Promise<Agent | null> {
  const result = await queryOne(`SELECT * FROM agents WHERE did = $1`, [did])
  return result ? mapAgent(result) : null
}

/**
 * Get agent by ID
 */
export async function getAgentById(id: string): Promise<Agent | null> {
  const result = await queryOne(`SELECT * FROM agents WHERE id = $1`, [id])
  return result ? mapAgent(result) : null
}

/**
 * Update agent
 */
export async function updateAgent(
  did: string,
  updates: Partial<{ name: string; status: AgentStatus; trustLevel: TrustLevel; metadata: Record<string, unknown> }>
): Promise<Agent | null> {
  const setClauses: string[] = []
  const values: unknown[] = []
  let paramIndex = 1

  if (updates.name !== undefined) {
    setClauses.push(`name = $${paramIndex++}`)
    values.push(updates.name)
  }
  if (updates.status !== undefined) {
    setClauses.push(`status = $${paramIndex++}`)
    values.push(updates.status)
  }
  if (updates.trustLevel !== undefined) {
    setClauses.push(`trust_level = $${paramIndex++}`)
    values.push(updates.trustLevel)
  }
  if (updates.metadata !== undefined) {
    setClauses.push(`metadata = metadata || $${paramIndex++}::jsonb`)
    values.push(JSON.stringify(updates.metadata))
  }

  setClauses.push(`updated_at = $${paramIndex++}`)
  values.push(new Date())
  values.push(did)

  const result = await queryOne(
    `UPDATE agents SET ${setClauses.join(', ')} WHERE did = $${paramIndex} RETURNING *`,
    values
  )

  return result ? mapAgent(result) : null
}

/**
 * Delete agent
 */
export async function deleteAgent(did: string): Promise<boolean> {
  const result = await query(`DELETE FROM agents WHERE did = $1 RETURNING id`, [did])
  return result.rows.length > 0
}

/**
 * List agents
 */
export async function listAgents(
  limit = 50,
  offset = 0,
  status?: string
): Promise<{ agents: Agent[]; total: number }> {
  let whereClause = ''
  const params: unknown[] = [limit, offset]

  if (status) {
    whereClause = 'WHERE status = $3'
    params.push(status)
  }

  const agents = await query(
    `SELECT * FROM agents ${whereClause} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    params
  )

  const countResult = await queryOne(
    `SELECT COUNT(*) as count FROM agents ${status ? 'WHERE status = $1' : ''}`,
    status ? [status] : []
  )

  return {
    agents: agents.rows.map(mapAgent),
    total: parseInt(countResult?.count || '0', 10),
  }
}

/**
 * Get agent wallet
 */
export async function getAgentWallet(agentDid: string): Promise<AgentWallet | null> {
  const agent = await getAgentByDid(agentDid)
  if (!agent) return null

  // Get wallet
  const wallet = await queryOne(
    `SELECT * FROM agent_wallets WHERE agent_id = $1`,
    [agent.id]
  )

  // Get credentials
  const credentials = await query(
    `SELECT * FROM agent_credentials WHERE agent_id = $1 ORDER BY issued_at DESC`,
    [agent.id]
  )

  // Get trusted agents
  const trustedAgents = await query(
    `SELECT tr.*, a.name, a.type
     FROM agent_trust_relationships tr
     LEFT JOIN agents a ON tr.trusted_did = a.did
     WHERE tr.agent_did = $1`,
    [agentDid]
  )

  // Get activity log
  const activityLog = await query(
    `SELECT * FROM agent_activity_logs WHERE agent_id = $1 ORDER BY timestamp DESC LIMIT 50`,
    [agent.id]
  )

  const credentialRows = credentials.rows
  const basicCred = credentialRows.find((c: any) => c.type === 'BasicAgentCredential')
  const richCreds = credentialRows.filter((c: any) => c.type === 'RichAgentCredential')
  const delegations = credentialRows.filter((c: any) => c.type === 'DelegationGrant')
  const others = credentialRows.filter(
    (c: any) => !['BasicAgentCredential', 'RichAgentCredential', 'DelegationGrant'].includes(c.type)
  )

  return {
    identity: agent,
    keys: wallet ? (typeof wallet.keys === 'string' ? JSON.parse(wallet.keys) : wallet.keys) : [],
    credentials: {
      basic: basicCred ? parseCredential(basicCred.credential) : null,
      rich: richCreds.map((c: any) => parseCredential(c.credential)),
      delegations: delegations.map((c: any) => parseCredential(c.credential)),
      others: others.map((c: any) => parseCredential(c.credential)),
    },
    trustedAgents: trustedAgents.rows.map((t: any) => ({
      did: t.trusted_did,
      name: t.name || 'Unknown Agent',
      type: t.type || 'assistant',
      trustLevel: t.trust_level,
      establishedAt: t.established_at,
    })),
    activityLog: activityLog.rows.map((a: any) => ({
      id: a.id,
      action: a.action,
      resource: a.resource,
      result: a.result,
      timestamp: a.timestamp,
    })),
  }
}

/**
 * Request Basic Agent Credential
 */
export async function requestBasicCredential(
  agentDid: string,
  securityDomain?: string
): Promise<Record<string, unknown>> {
  const agent = await getAgentByDid(agentDid)
  if (!agent) throw new Error('Agent not found')

  const now = new Date()
  const expirationDate = new Date()
  expirationDate.setFullYear(expirationDate.getFullYear() + 1)

  const credential = {
    id: `urn:uuid:${uuidv4()}`,
    type: ['VerifiableCredential', 'BasicAgentCredential'],
    issuer: 'did:key:z6MkSystemIssuer',
    issuanceDate: now.toISOString(),
    expirationDate: expirationDate.toISOString(),
    credentialSubject: {
      id: agentDid,
      isAgent: true,
      securityDomain: securityDomain || 'default-domain',
      registrationTimestamp: now.toISOString(),
    },
  }

  // Store credential
  await query(
    `INSERT INTO agent_credentials (id, agent_id, type, credential, issued_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [uuidv4(), agent.id, 'BasicAgentCredential', JSON.stringify(credential), now, expirationDate]
  )

  await logAgentActivity(agent.id, 'basic_credential_issued', 'success')
  logger.info('Basic credential issued', { agentDid })

  return credential
}

/**
 * Request Rich Agent Credential
 */
export async function requestRichCredential(
  agentDid: string,
  roles: string[],
  capabilities: string[]
): Promise<Record<string, unknown>> {
  const agent = await getAgentByDid(agentDid)
  if (!agent) throw new Error('Agent not found')

  const now = new Date()
  const expirationDate = new Date()
  expirationDate.setFullYear(expirationDate.getFullYear() + 1)

  const credential = {
    id: `urn:uuid:${uuidv4()}`,
    type: ['VerifiableCredential', 'RichAgentCredential'],
    issuer: 'did:key:z6MkSystemIssuer',
    issuanceDate: now.toISOString(),
    expirationDate: expirationDate.toISOString(),
    credentialSubject: {
      id: agentDid,
      name: agent.name,
      type: agent.type,
      roles,
      capabilities: capabilities.map((cap, i) => ({
        id: `cap-${i}`,
        name: cap,
        description: `Capability: ${cap}`,
        category: 'data',
        scope: ['*'],
      })),
      authorizations: roles.map((role, i) => ({
        id: `auth-${i}`,
        action: '*',
        resource: `/${role}/*`,
        effect: 'allow',
      })),
    },
  }

  // Store credential
  await query(
    `INSERT INTO agent_credentials (id, agent_id, type, credential, issued_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [uuidv4(), agent.id, 'RichAgentCredential', JSON.stringify(credential), now, expirationDate]
  )

  await logAgentActivity(agent.id, 'rich_credential_issued', 'success', undefined, { roles })
  logger.info('Rich credential issued', { agentDid, roles })

  return credential
}

/**
 * Log agent activity
 */
export async function logAgentActivity(
  agentId: string,
  action: string,
  result: 'success' | 'failure' | 'pending',
  resource?: string,
  details?: Record<string, unknown>
): Promise<void> {
  await query(
    `INSERT INTO agent_activity_logs (id, agent_id, action, resource, result, details, timestamp)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [uuidv4(), agentId, action, resource || null, result, details ? JSON.stringify(details) : null, new Date()]
  )
}

// Helper functions
function mapAgent(row: any): Agent {
  return {
    id: row.id,
    did: row.did,
    name: row.name,
    type: row.type,
    status: row.status,
    trustLevel: row.trust_level,
    ownerDid: row.owner_did,
    ownerName: row.owner_name,
    ownerType: row.owner_type,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function parseCredential(cred: any): Record<string, unknown> {
  return typeof cred === 'string' ? JSON.parse(cred) : cred
}
