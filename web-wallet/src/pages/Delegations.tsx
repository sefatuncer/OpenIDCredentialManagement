import { useState, useEffect } from 'react';
import type { DelegationGrant, DelegationRequest } from '../types/agent.types';
import * as agentService from '../services/agent.service';

function Delegations() {
  const [delegations, setDelegations] = useState<{
    given: DelegationGrant[];
    received: DelegationGrant[];
  }>({ given: [], received: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [activeTab, setActiveTab] = useState<'received' | 'given'>('received');

  // Create delegation form state
  const [createForm, setCreateForm] = useState({
    delegateeToDid: '',
    actions: '',
    resources: '',
    duration: 'P30D', // 30 days
    maxAmount: '',
    revocable: true,
    requireApproval: false,
  });

  useEffect(() => {
    loadDelegations();
  }, []);

  async function loadDelegations() {
    try {
      setLoading(true);
      setError(null);
      const data = await agentService.getDelegations();
      setDelegations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load delegations');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateDelegation(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      const actions = createForm.actions.split(',').map((a) => a.trim()).filter(Boolean);
      const resources = createForm.resources.split(',').map((r) => r.trim()).filter(Boolean);

      if (actions.length === 0) {
        setError('At least one action is required');
        return;
      }

      const request: DelegationRequest = {
        delegateeToDid: createForm.delegateeToDid,
        scope: {
          actions,
          resources,
          constraints: createForm.maxAmount
            ? { maxAmount: parseFloat(createForm.maxAmount) }
            : undefined,
        },
        duration: createForm.duration,
        revocable: createForm.revocable,
        requireApproval: createForm.requireApproval,
      };

      await agentService.createDelegation(request);
      setSuccess('Delegation created successfully!');
      setShowCreateForm(false);
      setCreateForm({
        delegateeToDid: '',
        actions: '',
        resources: '',
        duration: 'P30D',
        maxAmount: '',
        revocable: true,
        requireApproval: false,
      });
      await loadDelegations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create delegation');
    }
  }

  async function handleRevoke(delegationId: string) {
    if (!confirm('Are you sure you want to revoke this delegation?')) {
      return;
    }

    try {
      setError(null);
      await agentService.revokeDelegation(delegationId, 'Revoked by owner');
      setSuccess('Delegation revoked successfully!');
      await loadDelegations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke delegation');
    }
  }

  function formatDuration(duration: string): string {
    // Parse ISO 8601 duration
    const match = duration.match(/P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/);
    if (!match) return duration;

    const parts = [];
    if (match[1]) parts.push(`${match[1]} days`);
    if (match[2]) parts.push(`${match[2]} hours`);
    if (match[3]) parts.push(`${match[3]} minutes`);
    return parts.join(', ') || duration;
  }

  function isExpired(expirationDate: string): boolean {
    return new Date(expirationDate) < new Date();
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p>Loading delegations...</p>
      </div>
    );
  }

  return (
    <div className="delegations-page">
      <div className="page-header">
        <h2>Delegation Grants</h2>
        <p className="description">
          Manage permissions you've given to other agents and permissions you've received.
          Delegation Grants enable bounded permission transfer with scope reduction.
        </p>
        <button className="btn btn-primary" onClick={() => setShowCreateForm(true)}>
          + Create Delegation
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {/* Create Delegation Modal */}
      {showCreateForm && (
        <div className="modal-overlay" onClick={() => setShowCreateForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create Delegation Grant</h3>
              <button className="close-btn" onClick={() => setShowCreateForm(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateDelegation} className="delegation-form">
              <div className="form-group">
                <label htmlFor="delegateeToDid">Delegatee Agent DID *</label>
                <input
                  id="delegateeToDid"
                  type="text"
                  value={createForm.delegateeToDid}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, delegateeToDid: e.target.value })
                  }
                  placeholder="did:key:..."
                  required
                />
                <span className="help-text">
                  The DID of the agent you want to delegate permissions to
                </span>
              </div>

              <div className="form-group">
                <label htmlFor="actions">Allowed Actions * (comma-separated)</label>
                <input
                  id="actions"
                  type="text"
                  value={createForm.actions}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, actions: e.target.value })
                  }
                  placeholder="e.g., read, write, execute"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="resources">Resource Scope (comma-separated)</label>
                <input
                  id="resources"
                  type="text"
                  value={createForm.resources}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, resources: e.target.value })
                  }
                  placeholder="e.g., /api/data/*, /files/documents"
                />
                <span className="help-text">
                  Leave empty to allow all resources (not recommended)
                </span>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="duration">Duration</label>
                  <select
                    id="duration"
                    value={createForm.duration}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, duration: e.target.value })
                    }
                  >
                    <option value="PT1H">1 Hour</option>
                    <option value="P1D">1 Day</option>
                    <option value="P7D">7 Days</option>
                    <option value="P30D">30 Days</option>
                    <option value="P90D">90 Days</option>
                    <option value="P365D">1 Year</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="maxAmount">Max Amount (optional)</label>
                  <input
                    id="maxAmount"
                    type="number"
                    value={createForm.maxAmount}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, maxAmount: e.target.value })
                    }
                    placeholder="e.g., 1000"
                  />
                </div>
              </div>

              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={createForm.revocable}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, revocable: e.target.checked })
                    }
                  />
                  Revocable (can be cancelled anytime)
                </label>
              </div>

              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={createForm.requireApproval}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, requireApproval: e.target.checked })
                    }
                  />
                  Require approval for each action
                </label>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateForm(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Delegation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'received' ? 'active' : ''}`}
          onClick={() => setActiveTab('received')}
        >
          Received ({delegations.received.length})
        </button>
        <button
          className={`tab ${activeTab === 'given' ? 'active' : ''}`}
          onClick={() => setActiveTab('given')}
        >
          Given ({delegations.given.length})
        </button>
      </div>

      {/* Delegation List */}
      <div className="delegation-list">
        {activeTab === 'received' &&
          (delegations.received.length > 0 ? (
            delegations.received.map((dg) => (
              <DelegationCard
                key={dg.id}
                delegation={dg}
                type="received"
                onRevoke={handleRevoke}
              />
            ))
          ) : (
            <div className="empty-state">
              <span className="empty-icon">📭</span>
              <p>No delegations received yet.</p>
              <p className="hint">
                Other agents can delegate permissions to you using your DID.
              </p>
            </div>
          ))}

        {activeTab === 'given' &&
          (delegations.given.length > 0 ? (
            delegations.given.map((dg) => (
              <DelegationCard
                key={dg.id}
                delegation={dg}
                type="given"
                onRevoke={handleRevoke}
              />
            ))
          ) : (
            <div className="empty-state">
              <span className="empty-icon">📤</span>
              <p>No delegations given yet.</p>
              <p className="hint">
                Click "Create Delegation" to grant permissions to another agent.
              </p>
            </div>
          ))}
      </div>
    </div>
  );
}

// Delegation Card Component
function DelegationCard({
  delegation,
  type,
  onRevoke,
}: {
  delegation: DelegationGrant;
  type: 'received' | 'given';
  onRevoke: (id: string) => void;
}) {
  const isRevoked = !!delegation.delegation.revocation.revokedAt;
  const isExpired = new Date(delegation.expirationDate) < new Date();
  const status = isRevoked ? 'revoked' : isExpired ? 'expired' : 'active';

  return (
    <div className={`delegation-card ${status}`}>
      <div className="delegation-card-header">
        <div className="delegation-parties">
          <span className="party">
            {type === 'received' ? (
              <>
                <strong>From:</strong> {delegation.delegation.delegator.name}
              </>
            ) : (
              <>
                <strong>To:</strong> {delegation.delegation.delegatee.name}
              </>
            )}
          </span>
          <span className={`delegation-status ${status}`}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        </div>

        {delegation.delegation.chain && delegation.delegation.chain.depth > 0 && (
          <div className="chain-info">
            <span className="chain-badge">
              Chain Depth: {delegation.delegation.chain.depth}/{delegation.delegation.chain.maxDepth}
            </span>
          </div>
        )}
      </div>

      <div className="delegation-card-body">
        <div className="scope-section">
          <h4>Scope</h4>
          <div className="scope-details">
            <div className="scope-item">
              <span className="scope-label">Actions:</span>
              <div className="scope-tags">
                {delegation.delegation.scope.actions.map((action, i) => (
                  <span key={i} className="tag action-tag">
                    {action}
                  </span>
                ))}
              </div>
            </div>
            <div className="scope-item">
              <span className="scope-label">Resources:</span>
              <div className="scope-tags">
                {delegation.delegation.scope.resources.length > 0 ? (
                  delegation.delegation.scope.resources.map((resource, i) => (
                    <span key={i} className="tag resource-tag">
                      {resource}
                    </span>
                  ))
                ) : (
                  <span className="tag all-tag">All Resources</span>
                )}
              </div>
            </div>
            {delegation.delegation.scope.constraints?.maxAmount && (
              <div className="scope-item">
                <span className="scope-label">Max Amount:</span>
                <span>{delegation.delegation.scope.constraints.maxAmount}</span>
              </div>
            )}
          </div>
        </div>

        <div className="delegation-meta">
          <div className="meta-item">
            <span className="meta-label">Issued:</span>
            <span>{new Date(delegation.issuanceDate).toLocaleDateString()}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Expires:</span>
            <span>{new Date(delegation.expirationDate).toLocaleDateString()}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Revocable:</span>
            <span>{delegation.delegation.revocation.revocable ? 'Yes' : 'No'}</span>
          </div>
        </div>
      </div>

      {type === 'given' && status === 'active' && delegation.delegation.revocation.revocable && (
        <div className="delegation-card-actions">
          <button className="btn btn-danger btn-sm" onClick={() => onRevoke(delegation.id)}>
            Revoke
          </button>
        </div>
      )}

      {isRevoked && delegation.delegation.revocation.reason && (
        <div className="revocation-info">
          <span className="revocation-label">Revocation Reason:</span>
          <span>{delegation.delegation.revocation.reason}</span>
        </div>
      )}
    </div>
  );
}

export default Delegations;
