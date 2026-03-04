import { useState, useEffect } from 'react';
import type { TrustLevel, TrustEstablishmentRequest } from '../types/agent.types';
import * as agentService from '../services/agent.service';

interface TrustedAgent {
  did: string;
  name: string;
  type: string;
  trustLevel: TrustLevel;
  establishedAt: string;
  lastInteractionAt?: string;
}

function TrustManagement() {
  const [trustedAgents, setTrustedAgents] = useState<TrustedAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showEstablishForm, setShowEstablishForm] = useState(false);

  // Establish trust form
  const [establishForm, setEstablishForm] = useState({
    targetAgentDid: '',
    trustLevel: 'medium' as TrustLevel,
    mutualTrust: false,
    validityPeriod: 'P365D',
  });

  // Verification state
  const [verifyDid, setVerifyDid] = useState('');
  const [verificationResult, setVerificationResult] = useState<{
    valid: boolean;
    agent?: any;
    checks: Record<string, boolean>;
    errors?: string[];
  } | null>(null);

  useEffect(() => {
    loadTrustedAgents();
  }, []);

  async function loadTrustedAgents() {
    try {
      setLoading(true);
      setError(null);
      const agents = await agentService.getTrustedAgents();
      setTrustedAgents(agents);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trusted agents');
    } finally {
      setLoading(false);
    }
  }

  async function handleEstablishTrust(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      const request: TrustEstablishmentRequest = {
        targetAgentDid: establishForm.targetAgentDid,
        trustLevel: establishForm.trustLevel,
        mutualTrust: establishForm.mutualTrust,
        validityPeriod: establishForm.validityPeriod,
      };

      await agentService.establishTrust(request);
      setSuccess('Trust established successfully!');
      setShowEstablishForm(false);
      setEstablishForm({
        targetAgentDid: '',
        trustLevel: 'medium',
        mutualTrust: false,
        validityPeriod: 'P365D',
      });
      await loadTrustedAgents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to establish trust');
    }
  }

  async function handleRevokeTrust(agentDid: string) {
    if (!confirm('Are you sure you want to revoke trust for this agent?')) {
      return;
    }

    try {
      setError(null);
      await agentService.revokeTrust(agentDid);
      setSuccess('Trust revoked successfully!');
      await loadTrustedAgents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke trust');
    }
  }

  async function handleVerifyAgent(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setVerificationResult(null);

    try {
      const result = await agentService.verifyAgent(verifyDid);
      setVerificationResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
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

  function getTrustLevelDescription(level: TrustLevel): string {
    switch (level) {
      case 'verified':
        return 'Fully verified identity with cryptographic attestation';
      case 'high':
        return 'Trusted for sensitive operations';
      case 'medium':
        return 'Trusted for standard operations';
      case 'low':
        return 'Limited trust, requires additional verification';
      default:
        return 'Unknown trust level';
    }
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p>Loading trust relationships...</p>
      </div>
    );
  }

  return (
    <div className="trust-page">
      <div className="page-header">
        <h2>Trust Management</h2>
        <p className="description">
          Manage trust relationships with other AI agents. Trust enables secure
          agent-to-agent communication and credential exchange.
        </p>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {/* Action Cards */}
      <div className="action-cards">
        <div className="action-card" onClick={() => setShowEstablishForm(true)}>
          <span className="action-icon">🤝</span>
          <h3>Establish Trust</h3>
          <p>Create a trust relationship with another agent</p>
        </div>
        <div className="action-card">
          <span className="action-icon">🔍</span>
          <h3>Verify Agent</h3>
          <p>Verify an agent's identity and credentials</p>
        </div>
      </div>

      {/* Verify Agent Section */}
      <section className="verify-section">
        <h3>Verify Agent</h3>
        <form onSubmit={handleVerifyAgent} className="verify-form">
          <div className="form-row">
            <input
              type="text"
              value={verifyDid}
              onChange={(e) => setVerifyDid(e.target.value)}
              placeholder="Enter agent DID to verify..."
              required
            />
            <button type="submit" className="btn btn-primary">
              Verify
            </button>
          </div>
        </form>

        {verificationResult && (
          <div className={`verification-result ${verificationResult.valid ? 'valid' : 'invalid'}`}>
            <div className="result-header">
              <span className={`result-icon ${verificationResult.valid ? 'valid' : 'invalid'}`}>
                {verificationResult.valid ? '✓' : '✗'}
              </span>
              <h4>{verificationResult.valid ? 'Verification Successful' : 'Verification Failed'}</h4>
            </div>

            {verificationResult.agent && (
              <div className="verified-agent-info">
                <p>
                  <strong>Name:</strong> {verificationResult.agent.name}
                </p>
                <p>
                  <strong>Type:</strong> {verificationResult.agent.type}
                </p>
                <p>
                  <strong>Trust Level:</strong>{' '}
                  <span
                    className="trust-badge"
                    style={{
                      backgroundColor: getTrustLevelColor(verificationResult.agent.trustLevel),
                    }}
                  >
                    {verificationResult.agent.trustLevel}
                  </span>
                </p>
              </div>
            )}

            <div className="checks-list">
              <h5>Verification Checks</h5>
              {Object.entries(verificationResult.checks).map(([check, passed]) => (
                <div key={check} className={`check-item ${passed ? 'passed' : 'failed'}`}>
                  <span className="check-icon">{passed ? '✓' : '✗'}</span>
                  <span className="check-name">{check}</span>
                </div>
              ))}
            </div>

            {verificationResult.errors && verificationResult.errors.length > 0 && (
              <div className="errors-list">
                <h5>Errors</h5>
                <ul>
                  {verificationResult.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Establish Trust Modal */}
      {showEstablishForm && (
        <div className="modal-overlay" onClick={() => setShowEstablishForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Establish Trust Relationship</h3>
              <button className="close-btn" onClick={() => setShowEstablishForm(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleEstablishTrust} className="trust-form">
              <div className="form-group">
                <label htmlFor="targetAgentDid">Target Agent DID *</label>
                <input
                  id="targetAgentDid"
                  type="text"
                  value={establishForm.targetAgentDid}
                  onChange={(e) =>
                    setEstablishForm({ ...establishForm, targetAgentDid: e.target.value })
                  }
                  placeholder="did:key:..."
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="trustLevel">Trust Level *</label>
                <select
                  id="trustLevel"
                  value={establishForm.trustLevel}
                  onChange={(e) =>
                    setEstablishForm({
                      ...establishForm,
                      trustLevel: e.target.value as TrustLevel,
                    })
                  }
                >
                  <option value="low">Low - Limited trust</option>
                  <option value="medium">Medium - Standard operations</option>
                  <option value="high">High - Sensitive operations</option>
                  <option value="verified">Verified - Full trust</option>
                </select>
                <span className="help-text">
                  {getTrustLevelDescription(establishForm.trustLevel)}
                </span>
              </div>

              <div className="form-group">
                <label htmlFor="validityPeriod">Validity Period</label>
                <select
                  id="validityPeriod"
                  value={establishForm.validityPeriod}
                  onChange={(e) =>
                    setEstablishForm({ ...establishForm, validityPeriod: e.target.value })
                  }
                >
                  <option value="P30D">30 Days</option>
                  <option value="P90D">90 Days</option>
                  <option value="P180D">180 Days</option>
                  <option value="P365D">1 Year</option>
                </select>
              </div>

              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={establishForm.mutualTrust}
                    onChange={(e) =>
                      setEstablishForm({ ...establishForm, mutualTrust: e.target.checked })
                    }
                  />
                  Mutual Trust (both agents trust each other)
                </label>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowEstablishForm(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Establish Trust
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Trusted Agents List */}
      <section className="trusted-agents-section">
        <h3>Trusted Agents ({trustedAgents.length})</h3>

        {trustedAgents.length > 0 ? (
          <div className="trusted-agents-grid">
            {trustedAgents.map((agent) => (
              <div key={agent.did} className="trusted-agent-card">
                <div className="agent-card-header">
                  <div className="agent-avatar">
                    {agent.type === 'orchestrator'
                      ? '🎭'
                      : agent.type === 'autonomous'
                      ? '🤖'
                      : agent.type === 'service'
                      ? '⚙️'
                      : '🧑‍💼'}
                  </div>
                  <div className="agent-card-info">
                    <h4>{agent.name}</h4>
                    <span className="agent-type">{agent.type}</span>
                  </div>
                  <span
                    className="trust-level-badge"
                    style={{ backgroundColor: getTrustLevelColor(agent.trustLevel) }}
                  >
                    {agent.trustLevel}
                  </span>
                </div>

                <div className="agent-card-body">
                  <div className="agent-did">
                    <span className="did-label">DID:</span>
                    <code>{agent.did.substring(0, 40)}...</code>
                  </div>
                  <div className="agent-dates">
                    <span>
                      <strong>Established:</strong>{' '}
                      {new Date(agent.establishedAt).toLocaleDateString()}
                    </span>
                    {agent.lastInteractionAt && (
                      <span>
                        <strong>Last Interaction:</strong>{' '}
                        {new Date(agent.lastInteractionAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                <div className="agent-card-actions">
                  <button className="btn btn-secondary btn-sm">View Details</button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleRevokeTrust(agent.did)}
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <span className="empty-icon">🤝</span>
            <p>No trusted agents yet.</p>
            <p className="hint">
              Establish trust relationships to enable secure agent-to-agent communication.
            </p>
            <button className="btn btn-primary" onClick={() => setShowEstablishForm(true)}>
              Establish First Trust
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

export default TrustManagement;
