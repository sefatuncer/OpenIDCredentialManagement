import { query } from './connection'
import { logger } from '../utils/logger'

/**
 * Database migrations for AI Agent Identity System
 */

const migrations: Array<{
  version: number
  name: string
  up: string
  down: string
}> = [
  {
    version: 1,
    name: 'create_migrations_table',
    up: `
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        version INTEGER NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `,
    down: `DROP TABLE IF EXISTS migrations;`,
  },
  {
    version: 2,
    name: 'create_credential_offers_table',
    up: `
      CREATE TABLE IF NOT EXISTS credential_offers (
        id UUID PRIMARY KEY,
        credential_types JSONB NOT NULL,
        pre_authorized_code VARCHAR(255) NOT NULL UNIQUE,
        offer_data JSONB NOT NULL,
        claimed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        claimed_at TIMESTAMP,
        metadata JSONB
      );
      CREATE INDEX IF NOT EXISTS idx_credential_offers_code ON credential_offers(pre_authorized_code);
      CREATE INDEX IF NOT EXISTS idx_credential_offers_expires ON credential_offers(expires_at);
    `,
    down: `DROP TABLE IF EXISTS credential_offers;`,
  },
  {
    version: 3,
    name: 'create_access_tokens_table',
    up: `
      CREATE TABLE IF NOT EXISTS access_tokens (
        token VARCHAR(255) PRIMARY KEY,
        offer_id UUID REFERENCES credential_offers(id),
        scope TEXT,
        issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_access_tokens_expires ON access_tokens(expires_at);
    `,
    down: `DROP TABLE IF EXISTS access_tokens;`,
  },
  {
    version: 4,
    name: 'create_verification_sessions_table',
    up: `
      CREATE TABLE IF NOT EXISTS verification_sessions (
        id UUID PRIMARY KEY,
        presentation_definition JSONB NOT NULL,
        nonce VARCHAR(255) NOT NULL,
        state VARCHAR(255) NOT NULL UNIQUE,
        response_uri TEXT NOT NULL,
        client_id TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        presentation JSONB,
        verification_result JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        completed_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_verification_sessions_state ON verification_sessions(state);
      CREATE INDEX IF NOT EXISTS idx_verification_sessions_status ON verification_sessions(status);
    `,
    down: `DROP TABLE IF EXISTS verification_sessions;`,
  },
  {
    version: 5,
    name: 'create_revocation_lists_table',
    up: `
      CREATE TABLE IF NOT EXISTS revocation_lists (
        id VARCHAR(255) PRIMARY KEY,
        issuer_did TEXT NOT NULL,
        bitstring TEXT NOT NULL,
        current_index INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_revocation_lists_issuer ON revocation_lists(issuer_did);
    `,
    down: `DROP TABLE IF EXISTS revocation_lists;`,
  },
  {
    version: 6,
    name: 'create_revoked_credentials_table',
    up: `
      CREATE TABLE IF NOT EXISTS revoked_credentials (
        credential_id VARCHAR(255) PRIMARY KEY,
        status_list_id VARCHAR(255) REFERENCES revocation_lists(id),
        status_index INTEGER NOT NULL,
        reason TEXT,
        revoked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        revoked_by TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_revoked_credentials_list ON revoked_credentials(status_list_id);
    `,
    down: `DROP TABLE IF EXISTS revoked_credentials;`,
  },
  {
    version: 7,
    name: 'create_trusted_entities_table',
    up: `
      CREATE TABLE IF NOT EXISTS trusted_entities (
        did TEXT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        trust_level VARCHAR(50) DEFAULT 'basic',
        metadata JSONB,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_trusted_entities_type ON trusted_entities(entity_type);
      CREATE INDEX IF NOT EXISTS idx_trusted_entities_active ON trusted_entities(active);
    `,
    down: `DROP TABLE IF EXISTS trusted_entities;`,
  },
  {
    version: 8,
    name: 'create_trust_policies_table',
    up: `
      CREATE TABLE IF NOT EXISTS trust_policies (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        rules JSONB NOT NULL,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `,
    down: `DROP TABLE IF EXISTS trust_policies;`,
  },
  {
    version: 9,
    name: 'create_audit_logs_table',
    up: `
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY,
        event_type VARCHAR(100) NOT NULL,
        action TEXT NOT NULL,
        actor_type VARCHAR(50),
        actor_id TEXT,
        actor_name TEXT,
        resource_type VARCHAR(100),
        resource_id TEXT,
        outcome VARCHAR(50),
        details JSONB,
        metadata JSONB,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_audit_logs_event ON audit_logs(event_type);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
    `,
    down: `DROP TABLE IF EXISTS audit_logs;`,
  },
  {
    version: 10,
    name: 'create_credentials_table',
    up: `
      CREATE TABLE IF NOT EXISTS credentials (
        id VARCHAR(255) PRIMARY KEY,
        holder_did TEXT NOT NULL,
        issuer_did TEXT NOT NULL,
        credential_type VARCHAR(255) NOT NULL,
        credential_data JSONB NOT NULL,
        jwt TEXT,
        status VARCHAR(50) DEFAULT 'active',
        issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        revoked_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_credentials_holder ON credentials(holder_did);
      CREATE INDEX IF NOT EXISTS idx_credentials_issuer ON credentials(issuer_did);
      CREATE INDEX IF NOT EXISTS idx_credentials_type ON credentials(credential_type);
      CREATE INDEX IF NOT EXISTS idx_credentials_status ON credentials(status);
    `,
    down: `DROP TABLE IF EXISTS credentials;`,
  },
  {
    version: 11,
    name: 'create_agents_table',
    up: `
      CREATE TABLE IF NOT EXISTS agents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        did VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        trust_level VARCHAR(20) DEFAULT 'low',
        owner_did VARCHAR(255),
        owner_name VARCHAR(255),
        owner_type VARCHAR(50),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_agents_did ON agents(did);
      CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
      CREATE INDEX IF NOT EXISTS idx_agents_type ON agents(type);
    `,
    down: `DROP TABLE IF EXISTS agents;`,
  },
  {
    version: 12,
    name: 'create_agent_wallets_table',
    up: `
      CREATE TABLE IF NOT EXISTS agent_wallets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
        keys JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_agent_wallets_agent ON agent_wallets(agent_id);
    `,
    down: `DROP TABLE IF EXISTS agent_wallets;`,
  },
  {
    version: 13,
    name: 'create_agent_credentials_table',
    up: `
      CREATE TABLE IF NOT EXISTS agent_credentials (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
        type VARCHAR(100) NOT NULL,
        credential JSONB NOT NULL,
        issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        revoked_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_agent_credentials_agent ON agent_credentials(agent_id);
      CREATE INDEX IF NOT EXISTS idx_agent_credentials_type ON agent_credentials(type);
    `,
    down: `DROP TABLE IF EXISTS agent_credentials;`,
  },
  {
    version: 14,
    name: 'create_delegations_table',
    up: `
      CREATE TABLE IF NOT EXISTS delegations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        delegator_did VARCHAR(255) NOT NULL,
        delegatee_did VARCHAR(255) NOT NULL,
        scope JSONB NOT NULL,
        chain_depth INTEGER DEFAULT 0,
        max_depth INTEGER DEFAULT 3,
        parent_delegation_id UUID REFERENCES delegations(id),
        revocable BOOLEAN DEFAULT true,
        issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        revoked_at TIMESTAMP,
        revoked_by VARCHAR(255),
        revoke_reason TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_delegations_delegator ON delegations(delegator_did);
      CREATE INDEX IF NOT EXISTS idx_delegations_delegatee ON delegations(delegatee_did);
      CREATE INDEX IF NOT EXISTS idx_delegations_expires ON delegations(expires_at);
    `,
    down: `DROP TABLE IF EXISTS delegations;`,
  },
  {
    version: 15,
    name: 'create_agent_trust_relationships_table',
    up: `
      CREATE TABLE IF NOT EXISTS agent_trust_relationships (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_did VARCHAR(255) NOT NULL,
        trusted_did VARCHAR(255) NOT NULL,
        trust_level VARCHAR(20) NOT NULL,
        mutual BOOLEAN DEFAULT false,
        established_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        last_interaction_at TIMESTAMP,
        UNIQUE(agent_did, trusted_did)
      );
      CREATE INDEX IF NOT EXISTS idx_agent_trust_agent ON agent_trust_relationships(agent_did);
      CREATE INDEX IF NOT EXISTS idx_agent_trust_trusted ON agent_trust_relationships(trusted_did);
    `,
    down: `DROP TABLE IF EXISTS agent_trust_relationships;`,
  },
  {
    version: 16,
    name: 'create_agent_activity_logs_table',
    up: `
      CREATE TABLE IF NOT EXISTS agent_activity_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
        action VARCHAR(100) NOT NULL,
        resource VARCHAR(255),
        result VARCHAR(20) NOT NULL,
        details JSONB,
        delegation_used UUID REFERENCES delegations(id),
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_agent_activity_agent ON agent_activity_logs(agent_id);
      CREATE INDEX IF NOT EXISTS idx_agent_activity_timestamp ON agent_activity_logs(timestamp);
    `,
    down: `DROP TABLE IF EXISTS agent_activity_logs;`,
  },
  {
    version: 17,
    name: 'create_client_credentials_table',
    up: `
      CREATE TABLE IF NOT EXISTS client_credentials (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id VARCHAR(255) UNIQUE NOT NULL,
        client_secret_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        permissions JSONB DEFAULT '["*"]',
        active BOOLEAN DEFAULT TRUE,
        rate_limit INTEGER DEFAULT 1000,
        agent_id UUID REFERENCES agents(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_used_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_client_credentials_client_id ON client_credentials(client_id);
      CREATE INDEX IF NOT EXISTS idx_client_credentials_active ON client_credentials(active);
    `,
    down: `DROP TABLE IF EXISTS client_credentials;`,
  },
]

/**
 * Get current migration version
 */
async function getCurrentVersion(): Promise<number> {
  try {
    const result = await query(
      'SELECT MAX(version) as version FROM migrations'
    )
    return result.rows[0]?.version || 0
  } catch {
    return 0
  }
}

/**
 * Run all pending migrations
 */
export async function runMigrations(): Promise<void> {
  logger.info('Running database migrations...')

  // Ensure migrations table exists
  await query(migrations[0].up)

  const currentVersion = await getCurrentVersion()
  logger.info(`Current database version: ${currentVersion}`)

  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      logger.info(`Applying migration ${migration.version}: ${migration.name}`)

      try {
        await query(migration.up)
        await query(
          'INSERT INTO migrations (version, name) VALUES ($1, $2)',
          [migration.version, migration.name]
        )
        logger.info(`Migration ${migration.version} applied successfully`)
      } catch (error) {
        logger.error(`Failed to apply migration ${migration.version}`, { error })
        throw error
      }
    }
  }

  logger.info('All migrations completed')
}

/**
 * Rollback last migration
 */
export async function rollbackMigration(): Promise<void> {
  const currentVersion = await getCurrentVersion()

  if (currentVersion === 0) {
    logger.info('No migrations to rollback')
    return
  }

  const migration = migrations.find((m) => m.version === currentVersion)

  if (!migration) {
    throw new Error(`Migration ${currentVersion} not found`)
  }

  logger.info(`Rolling back migration ${migration.version}: ${migration.name}`)

  await query(migration.down)
  await query('DELETE FROM migrations WHERE version = $1', [currentVersion])

  logger.info(`Migration ${migration.version} rolled back`)
}

/**
 * Get migration status
 */
export async function getMigrationStatus(): Promise<{
  currentVersion: number
  pendingMigrations: number
  appliedMigrations: Array<{ version: number; name: string; appliedAt: Date }>
}> {
  const currentVersion = await getCurrentVersion()
  const pendingMigrations = migrations.filter(
    (m) => m.version > currentVersion
  ).length

  let appliedMigrations: Array<{
    version: number
    name: string
    appliedAt: Date
  }> = []

  try {
    const result = await query(
      'SELECT version, name, applied_at FROM migrations ORDER BY version'
    )
    appliedMigrations = result.rows.map((row) => ({
      version: row.version,
      name: row.name,
      appliedAt: row.applied_at,
    }))
  } catch {
    // Migrations table doesn't exist yet
  }

  return {
    currentVersion,
    pendingMigrations,
    appliedMigrations,
  }
}
