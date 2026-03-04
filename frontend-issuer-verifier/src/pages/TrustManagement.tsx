import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { useConfirm } from '../components/ConfirmModal';
import { trustApi } from '../services/api';
import { toast } from '../hooks/useToast';

interface TrustedIssuer {
  did: string;
  name?: string;
  addedAt: string;
}

interface Policy {
  id: string;
  name: string;
  rules: unknown[];
}

export function TrustManagement() {
  const [issuers, setIssuers] = useState<TrustedIssuer[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newIssuerDid, setNewIssuerDid] = useState('');
  const [newIssuerName, setNewIssuerName] = useState('');
  const { confirm, ConfirmDialog } = useConfirm();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [issuersRes, policiesRes] = await Promise.all([
        trustApi.getTrustedIssuers(),
        trustApi.getPolicies(),
      ]);

      if (issuersRes.success && issuersRes.data) {
        setIssuers(issuersRes.data.issuers);
      }

      if (policiesRes.success && policiesRes.data) {
        setPolicies(policiesRes.data.policies);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddIssuer = async () => {
    if (!newIssuerDid.trim()) {
      toast.error('DID is required');
      return;
    }

    if (!newIssuerDid.startsWith('did:')) {
      toast.error('Invalid DID format');
      return;
    }

    try {
      const response = await trustApi.addTrustedIssuer({
        did: newIssuerDid,
        name: newIssuerName || undefined,
      });

      if (response.success) {
        toast.success('Issuer added successfully');
        setNewIssuerDid('');
        setNewIssuerName('');
        loadData();
      }
    } catch {
      toast.error('Failed to add issuer');
    }
  };

  const handleRemoveIssuer = async (did: string, name?: string) => {
    const confirmed = await confirm({
      title: 'Remove Issuer',
      message: `"${name || did.slice(0, 30) + '...'}" will be removed from trusted issuers list. Credentials from this issuer will no longer be trusted. Do you want to continue?`,
      confirmText: 'Remove',
      confirmVariant: 'danger',
    });

    if (!confirmed) return;

    try {
      const response = await trustApi.removeTrustedIssuer(did);

      if (response.success) {
        toast.success('Issuer removed successfully');
        loadData();
      }
    } catch {
      toast.error('Failed to remove issuer');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const truncateDID = (did: string) => {
    if (did.length <= 40) return did;
    return `${did.slice(0, 20)}...${did.slice(-15)}`;
  };

  return (
    <Layout role="verifier">
      {ConfirmDialog}

      <div className="page-header">
        <h1 className="page-title">Trust Management</h1>
        <p className="page-subtitle">Trusted issuers and trust policies</p>
      </div>

      <div className="card-grid">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Add New Issuer</h3>
          </div>

          <div className="form-group">
            <label className="form-label">Issuer DID *</label>
            <input
              type="text"
              className="form-input"
              placeholder="did:key:z..."
              value={newIssuerDid}
              onChange={(e) => setNewIssuerDid(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Name (Optional)</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Company A"
              value={newIssuerName}
              onChange={(e) => setNewIssuerName(e.target.value)}
            />
          </div>

          <button
            className="btn btn-verifier"
            onClick={handleAddIssuer}
          >
            ➕ Add Issuer
          </button>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Trust Policies</h3>
          </div>

          {isLoading ? (
            <div className="loading">
              <div className="spinner"></div>
            </div>
          ) : policies.length > 0 ? (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Rules</th>
                  </tr>
                </thead>
                <tbody>
                  {policies.map((policy) => (
                    <tr key={policy.id}>
                      <td>{policy.name}</td>
                      <td>
                        <span className="badge badge-info">
                          {policy.rules.length} rules
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <p>No policies defined</p>
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="card-header">
          <h3 className="card-title">Trusted Issuers</h3>
          <span className="badge badge-info">{issuers.length} issuers</span>
        </div>

        {isLoading ? (
          <div className="loading">
            <div className="spinner"></div>
          </div>
        ) : issuers.length > 0 ? (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>DID</th>
                  <th>Name</th>
                  <th>Added</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {issuers.map((issuer) => (
                  <tr key={issuer.did}>
                    <td title={issuer.did} style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      {truncateDID(issuer.did)}
                    </td>
                    <td>{issuer.name || '-'}</td>
                    <td>{formatDate(issuer.addedAt)}</td>
                    <td>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleRemoveIssuer(issuer.did, issuer.name)}
                      >
                        🗑️ Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">🤝</div>
            <p>No trusted issuers added yet</p>
            <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
              Use the form above to add new issuers
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}
