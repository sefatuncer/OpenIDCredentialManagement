import { useState, useEffect } from 'react';
import { holderApi, issuerApi } from '../services/api';

type CredentialType = 'agent-identity' | 'delegation' | 'capability';

interface CredentialFormProps {
  onSubmit: (type: CredentialType, data: Record<string, unknown>) => Promise<void>;
  isLoading?: boolean;
}

type CredentialFormat = 'jwt_vc_json' | 'vc+sd-jwt';

export function CredentialForm({ onSubmit, isLoading }: CredentialFormProps) {
  const [credentialType, setCredentialType] = useState<CredentialType>('agent-identity');
  const [credentialFormat, setCredentialFormat] = useState<CredentialFormat>('vc+sd-jwt');
  const [holderDid, setHolderDid] = useState('');
  const [availableHolders, setAvailableHolders] = useState<string[]>([]);
  const [issuerDid, setIssuerDid] = useState('');

  // Agent Identity fields
  const [agentId, setAgentId] = useState('');
  const [agentType, setAgentType] = useState('autonomous');
  const [agentName, setAgentName] = useState('');
  const [capabilities, setCapabilities] = useState('');
  const [ownerDid, setOwnerDid] = useState('');

  // Delegation fields
  const [delegatorDid, setDelegatorDid] = useState('');
  const [delegateDid, setDelegateDid] = useState('');
  const [scope, setScope] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  // Capability fields
  const [capabilityType, setCapabilityType] = useState('');
  const [resource, setResource] = useState('');
  const [actions, setActions] = useState('');

  useEffect(() => {
    loadData();
    // Generate a unique agent ID
    setAgentId(`agent-${Date.now()}`);
  }, []);

  const loadData = async () => {
    // Load holder DID
    const holderRes = await holderApi.getDID();
    if (holderRes.success && holderRes.data?.did) {
      setAvailableHolders([holderRes.data.did]);
      setHolderDid(holderRes.data.did);
    }
    // Load issuer DID for owner field
    const issuerRes = await issuerApi.getDID();
    if (issuerRes.success && issuerRes.data?.did) {
      setIssuerDid(issuerRes.data.did);
      setOwnerDid(issuerRes.data.did);
      setDelegatorDid(issuerRes.data.did);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let data: Record<string, unknown> = {};

    switch (credentialType) {
      case 'agent-identity':
        data = {
          holderDid,
          agentId: agentId || `agent-${Date.now()}`,
          agentType,
          agentName: agentName || `Agent-${agentId}`,
          ownerDid: ownerDid || issuerDid,
          capabilities: capabilities ? capabilities.split(',').map(s => s.trim()) : [],
          format: credentialFormat,
        };
        break;
      case 'delegation':
        data = {
          holderDid,
          delegatorDid: delegatorDid || issuerDid,
          delegateDid: delegateDid || holderDid,
          scope: scope ? scope.split(',').map(s => s.trim()) : ['read'],
          validUntil: expiresAt ? new Date(expiresAt).toISOString() : undefined,
          format: credentialFormat,
        };
        break;
      case 'capability':
        data = {
          holderDid,
          capabilityType: capabilityType || 'general',
          resource: resource || '*',
          actions: actions ? actions.split(',').map(s => s.trim()) : ['read'],
          format: credentialFormat,
        };
        break;
    }

    await onSubmit(credentialType, data);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label className="form-label">Credential Type</label>
        <select
          className="form-select"
          value={credentialType}
          onChange={(e) => setCredentialType(e.target.value as CredentialType)}
        >
          <option value="agent-identity">Agent Identity</option>
          <option value="delegation">Delegation</option>
          <option value="capability">Capability</option>
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">Credential Format</label>
        <select
          className="form-select"
          value={credentialFormat}
          onChange={(e) => setCredentialFormat(e.target.value as CredentialFormat)}
        >
          <option value="vc+sd-jwt">SD-JWT VC (Selective Disclosure)</option>
          <option value="jwt_vc_json">JWT-VC (Plain JSON)</option>
        </select>
        <div className="form-helper">
          {credentialFormat === 'vc+sd-jwt'
            ? 'eIDAS 2.0 compliant — holder can selectively disclose claims'
            : 'Legacy format — all claims visible to verifier'}
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Holder DID *</label>
        {availableHolders.length > 0 ? (
          <select
            className="form-select"
            value={holderDid}
            onChange={(e) => setHolderDid(e.target.value)}
            required
          >
            <option value="">-- Select Holder --</option>
            {availableHolders.map((did) => (
              <option key={did} value={did}>
                {did.length > 50 ? `${did.slice(0, 25)}...${did.slice(-20)}` : did}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            className="form-input"
            placeholder="did:key:z..."
            value={holderDid}
            onChange={(e) => setHolderDid(e.target.value)}
            required
          />
        )}
        <div className="form-helper">DID of the credential recipient</div>
      </div>

      {credentialType === 'agent-identity' && (
        <>
          <div className="form-group">
            <label className="form-label">Agent ID *</label>
            <input
              type="text"
              className="form-input"
              placeholder="agent-001"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              required
            />
            <div className="form-helper">Unique identifier for the agent</div>
          </div>

          <div className="form-group">
            <label className="form-label">Agent Type *</label>
            <select
              className="form-select"
              value={agentType}
              onChange={(e) => setAgentType(e.target.value)}
            >
              <option value="autonomous">Autonomous</option>
              <option value="semi-autonomous">Semi-Autonomous</option>
              <option value="supervised">Supervised</option>
              <option value="tool">Tool</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Agent Name</label>
            <input
              type="text"
              className="form-input"
              placeholder="My AI Agent"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Owner DID *</label>
            <input
              type="text"
              className="form-input"
              placeholder="did:key:z..."
              value={ownerDid}
              onChange={(e) => setOwnerDid(e.target.value)}
              required
            />
            <div className="form-helper">DID of the agent owner (auto-filled with issuer DID)</div>
          </div>

          <div className="form-group">
            <label className="form-label">Capabilities</label>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.75rem',
              padding: '0.75rem',
              background: 'var(--color-bg-tertiary)',
              borderRadius: '0.5rem',
              marginBottom: '0.5rem'
            }}>
              {['read', 'write', 'execute', 'delete', 'manage', 'admin'].map((cap) => (
                <label key={cap} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '0.25rem',
                  background: capabilities.split(',').map(s => s.trim()).includes(cap) ? 'var(--color-issuer)' : 'transparent',
                  color: capabilities.split(',').map(s => s.trim()).includes(cap) ? 'white' : 'inherit'
                }}>
                  <input
                    type="checkbox"
                    checked={capabilities.split(',').map(s => s.trim()).includes(cap)}
                    onChange={(e) => {
                      const current = capabilities ? capabilities.split(',').map(s => s.trim()).filter(Boolean) : [];
                      if (e.target.checked) {
                        setCapabilities([...current, cap].join(', '));
                      } else {
                        setCapabilities(current.filter(s => s !== cap).join(', '));
                      }
                    }}
                    style={{ accentColor: 'var(--color-issuer)' }}
                  />
                  <span style={{ textTransform: 'capitalize' }}>{cap}</span>
                </label>
              ))}
            </div>
            <input
              type="text"
              className="form-input"
              placeholder="Or enter custom capabilities"
              value={capabilities}
              onChange={(e) => setCapabilities(e.target.value)}
            />
            <div className="form-helper">Select or enter agent capabilities</div>
          </div>
        </>
      )}

      {credentialType === 'delegation' && (
        <>
          <div className="form-group">
            <label className="form-label">Delegator DID *</label>
            <input
              type="text"
              className="form-input"
              placeholder="did:key:z..."
              value={delegatorDid}
              onChange={(e) => setDelegatorDid(e.target.value)}
              required
            />
            <div className="form-helper">DID of the authority granting delegation (auto-filled with issuer DID)</div>
          </div>

          <div className="form-group">
            <label className="form-label">Delegate DID</label>
            <input
              type="text"
              className="form-input"
              placeholder="did:key:z..."
              value={delegateDid}
              onChange={(e) => setDelegateDid(e.target.value)}
            />
            <div className="form-helper">DID of the agent receiving delegation (defaults to holder)</div>
          </div>

          <div className="form-group">
            <label className="form-label">Scope *</label>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.75rem',
              padding: '0.75rem',
              background: 'var(--color-bg-tertiary)',
              borderRadius: '0.5rem',
              marginBottom: '0.5rem'
            }}>
              {['read', 'write', 'delete', 'execute', 'admin', 'manage'].map((perm) => (
                <label key={perm} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '0.25rem',
                  background: scope.split(',').map(s => s.trim()).includes(perm) ? 'var(--color-issuer)' : 'transparent',
                  color: scope.split(',').map(s => s.trim()).includes(perm) ? 'white' : 'inherit'
                }}>
                  <input
                    type="checkbox"
                    checked={scope.split(',').map(s => s.trim()).includes(perm)}
                    onChange={(e) => {
                      const current = scope ? scope.split(',').map(s => s.trim()).filter(Boolean) : [];
                      if (e.target.checked) {
                        setScope([...current, perm].join(', '));
                      } else {
                        setScope(current.filter(s => s !== perm).join(', '));
                      }
                    }}
                    style={{ accentColor: 'var(--color-issuer)' }}
                  />
                  <span style={{ textTransform: 'capitalize' }}>{perm}</span>
                </label>
              ))}
            </div>
            <input
              type="text"
              className="form-input"
              placeholder="Or enter custom scopes"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            />
            <div className="form-helper">Select permissions or enter custom scopes</div>
          </div>

          <div className="form-group">
            <label className="form-label">Expiry Date</label>
            <input
              type="datetime-local"
              className="form-input"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
        </>
      )}

      {credentialType === 'capability' && (
        <>
          <div className="form-group">
            <label className="form-label">Capability Type *</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. file-access, api-access"
              value={capabilityType}
              onChange={(e) => setCapabilityType(e.target.value)}
              required
            />
            <div className="form-helper">Type of capability being granted</div>
          </div>

          <div className="form-group">
            <label className="form-label">Resource *</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. /documents/*, /api/v1/users"
              value={resource}
              onChange={(e) => setResource(e.target.value)}
              required
            />
            <div className="form-helper">Resource path or identifier</div>
          </div>

          <div className="form-group">
            <label className="form-label">Actions *</label>
            <input
              type="text"
              className="form-input"
              placeholder="read, write, delete (comma separated)"
              value={actions}
              onChange={(e) => setActions(e.target.value)}
              required
            />
            <div className="form-helper">Allowed actions on the resource</div>
          </div>
        </>
      )}

      <button
        type="submit"
        className="btn btn-issuer btn-lg"
        disabled={isLoading}
        style={{ width: '100%', marginTop: '1rem' }}
      >
        {isLoading ? 'Creating...' : '🎫 Create Credential'}
      </button>
    </form>
  );
}
