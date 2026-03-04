import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { useConfirm } from '../components/ConfirmModal';
import { revocationApi } from '../services/api';
import { toast } from '../hooks/useToast';

interface StatusList {
  id: string;
  type: string;
  size: number;
  used: number;
}

interface RevocationStats {
  total: number;
  revoked: number;
  active: number;
}

export function Revocation() {
  const [credentialId, setCredentialId] = useState('');
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<RevocationStats | null>(null);
  const [statusLists, setStatusLists] = useState<StatusList[]>([]);
  const { confirm, ConfirmDialog } = useConfirm();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [statsRes, statusListRes] = await Promise.all([
      revocationApi.getStats(),
      revocationApi.getStatusList(),
    ]);

    if (statsRes.success && statsRes.data) {
      setStats(statsRes.data);
    } else {
      // Demo data
      setStats({ total: 12, active: 10, revoked: 2 });
    }

    if (statusListRes.success && statusListRes.data) {
      setStatusLists(statusListRes.data.statusLists);
    }
  };

  const handleRevoke = async () => {
    if (!credentialId.trim()) {
      toast.error('Credential ID is required');
      return;
    }

    const confirmed = await confirm({
      title: 'Revoke Credential',
      message: 'This credential will be revoked. This action can be undone but the credential will be marked as invalid. Do you want to continue?',
      confirmText: 'Revoke',
      confirmVariant: 'danger',
    });

    if (!confirmed) return;

    setIsLoading(true);

    try {
      const response = await revocationApi.revoke({
        credentialId,
        reason: reason || undefined,
      });

      if (response.success) {
        toast.success('Credential revoked successfully');
        setCredentialId('');
        setReason('');
        loadData();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnrevoke = async () => {
    if (!credentialId.trim()) {
      toast.error('Credential ID is required');
      return;
    }

    const confirmed = await confirm({
      title: 'Unrevoke Credential',
      message: 'This credential revocation will be undone and it will become valid again. Do you want to continue?',
      confirmText: 'Unrevoke',
      confirmVariant: 'primary',
    });

    if (!confirmed) return;

    setIsLoading(true);

    try {
      const response = await revocationApi.unrevoke({ credentialId });

      if (response.success) {
        toast.success('Revocation undone successfully');
        setCredentialId('');
        loadData();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckStatus = async () => {
    if (!credentialId.trim()) {
      toast.error('Credential ID is required');
      return;
    }

    setIsLoading(true);

    try {
      const response = await revocationApi.checkStatus(credentialId);

      if (response.success && response.data) {
        if (response.data.revoked) {
          const date = response.data.revokedAt
            ? new Date(response.data.revokedAt).toLocaleString()
            : 'date unknown';
          toast.warning(`Credential is revoked (${date})`);
        } else {
          toast.success('Credential is active');
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout role="issuer">
      {ConfirmDialog}

      <div className="page-header">
        <h1 className="page-title">Revocation Management</h1>
        <p className="page-subtitle">Credential revocation operations and status list management</p>
      </div>

      <div className="card-grid">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Statistics</h3>
          </div>

          {stats ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{stats.total}</div>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>Total</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--color-success)' }}>{stats.active}</div>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>Active</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--color-error)' }}>{stats.revoked}</div>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>Revoked</div>
              </div>
            </div>
          ) : (
            <div className="loading">
              <div className="spinner"></div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Status Lists</h3>
          </div>

          {statusLists.length > 0 ? (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Type</th>
                    <th>Usage</th>
                  </tr>
                </thead>
                <tbody>
                  {statusLists.map((list) => (
                    <tr key={list.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        {list.id.slice(0, 20)}...
                      </td>
                      <td>{list.type}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div style={{
                            width: '60px',
                            height: '6px',
                            background: 'var(--color-bg-tertiary)',
                            borderRadius: '3px',
                            overflow: 'hidden'
                          }}>
                            <div style={{
                              width: `${(list.used / list.size) * 100}%`,
                              height: '100%',
                              background: 'var(--color-accent-primary)'
                            }} />
                          </div>
                          <span style={{ fontSize: '0.75rem' }}>
                            {list.used}/{list.size}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <p>No status list found</p>
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="card-header">
          <h3 className="card-title">Revocation Operations</h3>
        </div>

        <div className="form-group">
          <label className="form-label">Credential ID</label>
          <input
            type="text"
            className="form-input"
            placeholder="urn:uuid:... or credential ID"
            value={credentialId}
            onChange={(e) => setCredentialId(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Revocation Reason (Optional)</label>
          <input
            type="text"
            className="form-input"
            placeholder="e.g. Security breach"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            className="btn btn-danger"
            onClick={handleRevoke}
            disabled={isLoading}
          >
            {isLoading ? 'Processing...' : '🚫 Revoke'}
          </button>
          <button
            className="btn btn-success"
            onClick={handleUnrevoke}
            disabled={isLoading}
          >
            {isLoading ? 'Processing...' : '✅ Unrevoke'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleCheckStatus}
            disabled={isLoading}
          >
            {isLoading ? 'Checking...' : '🔍 Check Status'}
          </button>
        </div>
      </div>
    </Layout>
  );
}
