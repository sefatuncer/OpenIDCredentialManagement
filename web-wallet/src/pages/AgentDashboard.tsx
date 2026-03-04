import { useState, useEffect } from 'react';
import type { AgentWallet, AgentIdentity, TrustLevel } from '../types/agent.types';
import * as agentService from '../services/agent.service';

// Store current agent DID in session
const AGENT_DID_KEY = 'current_agent_did';

function getStoredAgentDid(): string | null {
  return sessionStorage.getItem(AGENT_DID_KEY);
}

function setStoredAgentDid(did: string): void {
  sessionStorage.setItem(AGENT_DID_KEY, did);
}

function AgentDashboard() {
  const [wallet, setWallet] = useState<AgentWallet | null>(null);
  const [agentDid, setAgentDid] = useState<string | null>(getStoredAgentDid());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRegisterForm, setShowRegisterForm] = useState(false);

  // Registration form state
  const [registerForm, setRegisterForm] = useState({
    name: '',
    type: 'assistant' as const,
    capabilities: '',
    ownerDid: '',
    ownerName: '',
    model: '',
    framework: '',
  });

  useEffect(() => {
    loadWallet();
  }, [agentDid]);

  async function loadWallet() {
    if (!agentDid) {
      setShowRegisterForm(true);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const walletData = await agentService.getWallet(agentDid);
      setWallet(walletData);
      if (!walletData) {
        setShowRegisterForm(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load wallet');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    try {
      const capabilities = registerForm.capabilities
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);

      const identity = await agentService.registerAgent({
        name: registerForm.name,
        type: registerForm.type,
        owner: {
          did: registerForm.ownerDid || 'did:key:demo-owner',
          name: registerForm.ownerName || 'Demo Owner',
          type: 'human',
        },
        capabilities,
        metadata: {
          model: registerForm.model || undefined,
          framework: registerForm.framework || undefined,
          version: '1.0.0',
        },
      });

      // Store the new agent DID and reload wallet
      setStoredAgentDid(identity.did);
      setAgentDid(identity.did);
      setShowRegisterForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    }
  }

  async function handleRequestBasicCredential() {
    if (!agentDid) {
      setError('No agent registered');
      return;
    }
    try {
      setError(null);
      await agentService.requestBasicCredential(agentDid);
      // Reload wallet to show the new credential
      await loadWallet();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request basic credential');
    }
  }

  async function handleRequestRichCredential() {
    if (!agentDid) {
      setError('No agent registered');
      return;
    }
    try {
      setError(null);
      const roles = ['data-analyst', 'api-consumer'];
      const capabilities = ['data-read', 'data-write', 'api-access'];
      await agentService.requestRichCredential(agentDid, roles, capabilities);
      await loadWallet();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request rich credential');
    }
  }

  function getTrustLevelColor(level: TrustLevel): string {
    switch (level) {
      case 'verified':
        return '#22c55e';
      case 'high':
        return '#3b82f6';
      case 'medium':
        return '#f59e0b';
      case 'low':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p>Loading Agent Wallet...</p>
      </div>
    );
  }

  if (showRegisterForm || !wallet) {
    return (
      <div className="agent-register">
        <h2>Register New AI Agent</h2>
        <p className="description">
          Create a new AI agent identity with a DID and verifiable credentials.
        </p>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleRegister} className="register-form">
          <div className="form-group">
            <label htmlFor="name">Agent Name *</label>
            <input
              id="name"
              type="text"
              value={registerForm.name}
              onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
              placeholder="e.g., Data Analysis Agent"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="type">Agent Type *</label>
            <select
              id="type"
              value={registerForm.type}
              onChange={(e) =>
                setRegisterForm({ ...registerForm, type: e.target.value as any })
              }
            >
              <option value="assistant">Assistant (Human-controlled)</option>
              <option value="semi-autonomous">Semi-Autonomous</option>
              <option value="autonomous">Autonomous</option>
              <option value="service">Service Agent</option>
              <option value="orchestrator">Orchestrator</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="capabilities">Capabilities (comma-separated)</label>
            <input
              id="capabilities"
              type="text"
              value={registerForm.capabilities}
              onChange={(e) =>
                setRegisterForm({ ...registerForm, capabilities: e.target.value })
              }
              placeholder="e.g., data-analysis, report-generation, api-access"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="model">AI Model</label>
              <input
                id="model"
                type="text"
                value={registerForm.model}
                onChange={(e) => setRegisterForm({ ...registerForm, model: e.target.value })}
                placeholder="e.g., gpt-4, claude-3"
              />
            </div>

            <div className="form-group">
              <label htmlFor="framework">Framework</label>
              <input
                id="framework"
                type="text"
                value={registerForm.framework}
                onChange={(e) =>
                  setRegisterForm({ ...registerForm, framework: e.target.value })
                }
                placeholder="e.g., langchain, autogen"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="ownerName">Owner Name</label>
            <input
              id="ownerName"
              type="text"
              value={registerForm.ownerName}
              onChange={(e) =>
                setRegisterForm({ ...registerForm, ownerName: e.target.value })
              }
              placeholder="Your name or organization"
            />
          </div>

          <button type="submit" className="btn btn-primary">
            Register Agent
          </button>
        </form>
      </div>
    );
  }

  const { identity, credentials, trustedAgents, activityLog } = wallet;

  return (
    <div className="agent-dashboard">
      {error && <div className="error-message">{error}</div>}

      {/* Agent Identity Card */}
      <section className="identity-card">
        <div className="identity-header">
          <div className="agent-icon">
            {identity.type === 'orchestrator'
              ? '🎭'
              : identity.type === 'autonomous'
              ? '🤖'
              : identity.type === 'service'
              ? '⚙️'
              : '🧑‍💼'}
          </div>
          <div className="agent-info">
            <h2>{identity.name}</h2>
            <span className={`status status-${identity.status}`}>{identity.status}</span>
            <span
              className="trust-badge"
              style={{ backgroundColor: getTrustLevelColor(identity.trustLevel) }}
            >
              {identity.trustLevel} trust
            </span>
          </div>
        </div>

        <div className="identity-details">
          <div className="detail-row">
            <span className="label">DID:</span>
            <code className="did">{identity.did}</code>
          </div>
          <div className="detail-row">
            <span className="label">Type:</span>
            <span>{identity.type}</span>
          </div>
          <div className="detail-row">
            <span className="label">Owner:</span>
            <span>{identity.owner.name}</span>
          </div>
          {identity.metadata.model && (
            <div className="detail-row">
              <span className="label">Model:</span>
              <span>{identity.metadata.model}</span>
            </div>
          )}
          {identity.metadata.capabilities.length > 0 && (
            <div className="detail-row">
              <span className="label">Capabilities:</span>
              <div className="capability-tags">
                {identity.metadata.capabilities.map((cap, i) => (
                  <span key={i} className="tag">
                    {cap}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Stats Grid */}
      <section className="stats-grid">
        <div className="stat-card">
          <span className="stat-icon">📜</span>
          <div className="stat-info">
            <span className="stat-value">
              {(credentials.rich?.length || 0) + (credentials.basic ? 1 : 0)}
            </span>
            <span className="stat-label">Credentials</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">🔑</span>
          <div className="stat-info">
            <span className="stat-value">{credentials.delegations?.length || 0}</span>
            <span className="stat-label">Delegations</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">🤝</span>
          <div className="stat-info">
            <span className="stat-value">{trustedAgents?.length || 0}</span>
            <span className="stat-label">Trusted Agents</span>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">📊</span>
          <div className="stat-info">
            <span className="stat-value">{activityLog?.length || 0}</span>
            <span className="stat-label">Activities</span>
          </div>
        </div>
      </section>

      {/* Credentials Section */}
      <section className="credentials-section">
        <h3>Agent Credentials</h3>

        {credentials.basic && (
          <div className="credential-card basic">
            <div className="credential-header">
              <span className="credential-type">Basic Agent Credential (bVC)</span>
              <span className="credential-status valid">Valid</span>
            </div>
            <div className="credential-body">
              <p>
                <strong>Security Domain:</strong>{' '}
                {credentials.basic.credentialSubject.securityDomain}
              </p>
              <p>
                <strong>Issued:</strong> {new Date(credentials.basic.issuanceDate).toLocaleDateString()}
              </p>
            </div>
          </div>
        )}

        {credentials.rich?.map((cred, i) => (
          <div key={i} className="credential-card rich">
            <div className="credential-header">
              <span className="credential-type">Rich Agent Credential (rVC)</span>
              <span className="credential-status valid">Valid</span>
            </div>
            <div className="credential-body">
              <p>
                <strong>Roles:</strong>{' '}
                {cred.credentialSubject.roles?.join(', ') || 'None'}
              </p>
              <p>
                <strong>Capabilities:</strong>{' '}
                {cred.credentialSubject.capabilities?.length || 0}
              </p>
              <p>
                <strong>Issued:</strong>{' '}
                {new Date(cred.issuanceDate).toLocaleDateString()}
              </p>
            </div>
          </div>
        ))}

        {!credentials.basic && (
          <div className="no-credentials">
            <p>No basic credential yet. Request your first credential to get started.</p>
            <button className="btn btn-primary" onClick={handleRequestBasicCredential}>
              Request Basic Credential (bVC)
            </button>
            {credentials.basic && (
              <button className="btn btn-secondary" onClick={handleRequestRichCredential} style={{ marginLeft: '1rem' }}>
                Request Rich Credential (rVC)
              </button>
            )}
          </div>
        )}

        {credentials.basic && !credentials.rich?.length && (
          <div style={{ marginTop: '1rem' }}>
            <button className="btn btn-secondary" onClick={handleRequestRichCredential}>
              Request Rich Credential (rVC)
            </button>
          </div>
        )}
      </section>

      {/* Delegations Section */}
      <section className="delegations-section">
        <h3>Delegation Grants</h3>

        {credentials.delegations?.length > 0 ? (
          <div className="delegation-list">
            {credentials.delegations.map((dg, i) => (
              <div key={i} className="delegation-card">
                <div className="delegation-header">
                  <span className="delegation-from">
                    From: {dg.delegation.delegator.name}
                  </span>
                  <span
                    className={`delegation-status ${
                      dg.delegation.revocation.revokedAt ? 'revoked' : 'active'
                    }`}
                  >
                    {dg.delegation.revocation.revokedAt ? 'Revoked' : 'Active'}
                  </span>
                </div>
                <div className="delegation-body">
                  <p>
                    <strong>Scope:</strong>{' '}
                    {dg.delegation.scope.actions.join(', ')}
                  </p>
                  <p>
                    <strong>Resources:</strong>{' '}
                    {dg.delegation.scope.resources.join(', ')}
                  </p>
                  <p>
                    <strong>Expires:</strong>{' '}
                    {new Date(dg.expirationDate).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="no-delegations">
            <p>No delegations received. Ask another agent to delegate permissions to you.</p>
          </div>
        )}
      </section>

      {/* Trusted Agents */}
      <section className="trust-section">
        <h3>Trusted Agents</h3>

        {trustedAgents?.length > 0 ? (
          <div className="trust-list">
            {trustedAgents.map((agent, i) => (
              <div key={i} className="trust-card">
                <span className="trust-icon">🤖</span>
                <div className="trust-info">
                  <span className="trust-name">{agent.name}</span>
                  <span className="trust-did">{agent.did.substring(0, 30)}...</span>
                </div>
                <span
                  className="trust-level"
                  style={{ backgroundColor: getTrustLevelColor(agent.trustLevel) }}
                >
                  {agent.trustLevel}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="no-trust">
            <p>No trusted agents yet. Establish trust relationships to collaborate with other agents.</p>
            <button className="btn btn-secondary">Establish Trust</button>
          </div>
        )}
      </section>

      {/* Recent Activity */}
      <section className="activity-section">
        <h3>Recent Activity</h3>

        {activityLog?.length > 0 ? (
          <div className="activity-list">
            {activityLog.slice(0, 10).map((activity, i) => (
              <div key={i} className={`activity-item ${activity.result}`}>
                <span className="activity-time">
                  {new Date(activity.timestamp).toLocaleTimeString()}
                </span>
                <span className="activity-action">{activity.action}</span>
                {activity.resource && (
                  <span className="activity-resource">{activity.resource}</span>
                )}
                <span className={`activity-result ${activity.result}`}>
                  {activity.result}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="no-activity">
            <p>No activity recorded yet.</p>
          </div>
        )}
      </section>
    </div>
  );
}

export default AgentDashboard;
