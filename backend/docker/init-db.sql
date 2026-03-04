-- AI Agent Identity System - Database Initialization

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Status Lists table for credential revocation
CREATE TABLE IF NOT EXISTS status_lists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    status_list_id VARCHAR(255) UNIQUE NOT NULL,
    issuer_did VARCHAR(500) NOT NULL,
    encoded_list TEXT NOT NULL,
    list_size INTEGER NOT NULL DEFAULT 131072,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Credential status tracking
CREATE TABLE IF NOT EXISTS credential_statuses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    credential_id VARCHAR(255) UNIQUE NOT NULL,
    status_list_id VARCHAR(255) NOT NULL REFERENCES status_lists(status_list_id),
    status_list_index INTEGER NOT NULL,
    revoked BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revocation_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trusted entities (issuers, verifiers)
CREATE TABLE IF NOT EXISTS trusted_entities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    did VARCHAR(500) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('issuer', 'verifier', 'holder')),
    trust_level VARCHAR(50) NOT NULL CHECK (trust_level IN ('untrusted', 'basic', 'standard', 'elevated', 'high')),
    credential_types TEXT[] DEFAULT ARRAY['*'],
    metadata JSONB DEFAULT '{}',
    active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trust anchors
CREATE TABLE IF NOT EXISTS trust_anchors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    anchor_id VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    did VARCHAR(500) NOT NULL,
    public_key TEXT NOT NULL,
    trust_level VARCHAR(50) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trust policies
CREATE TABLE IF NOT EXISTS trust_policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    policy_id VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    rules JSONB NOT NULL DEFAULT '[]',
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit log for security tracking
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    event_type VARCHAR(100) NOT NULL,
    actor_did VARCHAR(500),
    resource_type VARCHAR(100),
    resource_id VARCHAR(500),
    action VARCHAR(100) NOT NULL,
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    request_id UUID,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_status_lists_issuer ON status_lists(issuer_did);
CREATE INDEX IF NOT EXISTS idx_credential_statuses_credential ON credential_statuses(credential_id);
CREATE INDEX IF NOT EXISTS idx_credential_statuses_revoked ON credential_statuses(revoked) WHERE revoked = TRUE;
CREATE INDEX IF NOT EXISTS idx_trusted_entities_did ON trusted_entities(did);
CREATE INDEX IF NOT EXISTS idx_trusted_entities_type ON trusted_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_trusted_entities_active ON trusted_entities(active) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_did);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_status_lists_updated_at
    BEFORE UPDATE ON status_lists
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_credential_statuses_updated_at
    BEFORE UPDATE ON credential_statuses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trusted_entities_updated_at
    BEFORE UPDATE ON trusted_entities
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trust_policies_updated_at
    BEFORE UPDATE ON trust_policies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions (adjust as needed for your setup)
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO aiagent;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO aiagent;
