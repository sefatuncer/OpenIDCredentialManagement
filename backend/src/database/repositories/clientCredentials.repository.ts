import { query, queryOne } from '../connection'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'

export interface ClientCredential {
  id: string
  clientId: string
  clientSecretHash: string
  name: string
  description?: string
  permissions: string[]
  active: boolean
  rateLimit: number
  agentId?: string
  createdAt: Date
  updatedAt: Date
  lastUsedAt?: Date
}

interface ClientCredentialRow {
  id: string
  client_id: string
  client_secret_hash: string
  name: string
  description: string | null
  permissions: string[]
  active: boolean
  rate_limit: number
  agent_id: string | null
  created_at: Date
  updated_at: Date
  last_used_at: Date | null
}

const SALT_ROUNDS = 12

function rowToCredential(row: ClientCredentialRow): ClientCredential {
  return {
    id: row.id,
    clientId: row.client_id,
    clientSecretHash: row.client_secret_hash,
    name: row.name,
    description: row.description || undefined,
    permissions: row.permissions,
    active: row.active,
    rateLimit: row.rate_limit,
    agentId: row.agent_id || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at || undefined,
  }
}

/**
 * Create a new client credential
 */
export async function createClientCredential(
  clientId: string,
  clientSecret: string,
  name: string,
  options?: {
    description?: string
    permissions?: string[]
    rateLimit?: number
    agentId?: string
  }
): Promise<{ credential: ClientCredential; plainSecret: string }> {
  const id = uuidv4()
  const secretHash = await bcrypt.hash(clientSecret, SALT_ROUNDS)

  const result = await queryOne<ClientCredentialRow>(
    `INSERT INTO client_credentials
     (id, client_id, client_secret_hash, name, description, permissions, rate_limit, agent_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      id,
      clientId,
      secretHash,
      name,
      options?.description || null,
      JSON.stringify(options?.permissions || ['*']),
      options?.rateLimit || 1000,
      options?.agentId || null,
    ]
  )

  if (!result) {
    throw new Error('Failed to create client credential')
  }

  return {
    credential: rowToCredential(result),
    plainSecret: clientSecret,
  }
}

/**
 * Verify client credentials
 */
export async function verifyClientCredentials(
  clientId: string,
  clientSecret: string
): Promise<ClientCredential | null> {
  const row = await queryOne<ClientCredentialRow>(
    'SELECT * FROM client_credentials WHERE client_id = $1 AND active = true',
    [clientId]
  )

  if (!row) {
    return null
  }

  const isValid = await bcrypt.compare(clientSecret, row.client_secret_hash)
  if (!isValid) {
    return null
  }

  // Update last used timestamp
  await query(
    'UPDATE client_credentials SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1',
    [row.id]
  )

  return rowToCredential(row)
}

/**
 * Get client by ID
 */
export async function getClientById(clientId: string): Promise<ClientCredential | null> {
  const row = await queryOne<ClientCredentialRow>(
    'SELECT * FROM client_credentials WHERE client_id = $1',
    [clientId]
  )

  return row ? rowToCredential(row) : null
}

/**
 * List all active clients
 */
export async function listClients(): Promise<ClientCredential[]> {
  const result = await query<ClientCredentialRow>(
    'SELECT * FROM client_credentials WHERE active = true ORDER BY created_at DESC'
  )

  return result.rows.map(rowToCredential)
}

/**
 * Update client secret
 */
export async function updateClientSecret(
  clientId: string,
  newSecret: string
): Promise<ClientCredential | null> {
  const secretHash = await bcrypt.hash(newSecret, SALT_ROUNDS)

  const row = await queryOne<ClientCredentialRow>(
    `UPDATE client_credentials
     SET client_secret_hash = $2, updated_at = CURRENT_TIMESTAMP
     WHERE client_id = $1
     RETURNING *`,
    [clientId, secretHash]
  )

  return row ? rowToCredential(row) : null
}

/**
 * Deactivate a client
 */
export async function deactivateClient(clientId: string): Promise<boolean> {
  const result = await query(
    'UPDATE client_credentials SET active = false, updated_at = CURRENT_TIMESTAMP WHERE client_id = $1',
    [clientId]
  )

  return (result.rowCount || 0) > 0
}

/**
 * Reactivate a client
 */
export async function reactivateClient(clientId: string): Promise<boolean> {
  const result = await query(
    'UPDATE client_credentials SET active = true, updated_at = CURRENT_TIMESTAMP WHERE client_id = $1',
    [clientId]
  )

  return (result.rowCount || 0) > 0
}

/**
 * Delete a client permanently
 */
export async function deleteClient(clientId: string): Promise<boolean> {
  const result = await query(
    'DELETE FROM client_credentials WHERE client_id = $1',
    [clientId]
  )

  return (result.rowCount || 0) > 0
}

/**
 * Check if any clients exist (for initial setup)
 */
export async function hasAnyClients(): Promise<boolean> {
  const result = await queryOne<{ count: string }>(
    'SELECT COUNT(*) as count FROM client_credentials'
  )

  return result ? parseInt(result.count) > 0 : false
}
