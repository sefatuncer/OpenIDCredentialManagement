import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { revocationApi, auditApi } from '../services/api';
import { auth } from '../services/auth';

interface Stats {
  totalCredentials: number;
  activeCredentials: number;
  revokedCredentials: number;
  recentActions: number;
}

export function IssuerDashboard() {
  const [stats, setStats] = useState<Stats>({
    totalCredentials: 0,
    activeCredentials: 0,
    revokedCredentials: 0,
    recentActions: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const did = auth.getDID();

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setIsLoading(true);

    try {
      const [revocationStats, auditStats] = await Promise.all([
        revocationApi.getStats(),
        auditApi.getStats('week'),
      ]);

      const newStats: Stats = {
        totalCredentials: 0,
        activeCredentials: 0,
        revokedCredentials: 0,
        recentActions: 0,
      };

      if (revocationStats.success && revocationStats.data) {
        newStats.totalCredentials = revocationStats.data.total || 0;
        newStats.activeCredentials = revocationStats.data.active || 0;
        newStats.revokedCredentials = revocationStats.data.revoked || 0;
      }

      if (auditStats.success && auditStats.data) {
        newStats.recentActions = auditStats.data.totalActions || 0;
      }

      setStats(newStats);
    } catch (error) {
      console.error('Failed to load stats:', error);
      // Keep zeros on error - no fake data
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout role="issuer">
      <div className="page-header">
        <h1 className="page-title">Issuer Dashboard</h1>
        <p className="page-subtitle">Credential issuance and management panel</p>
      </div>

      {did && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header">
            <h3 className="card-title">Issuer DID</h3>
          </div>
          <div className="did-display">
            <span className="did-text">{did}</span>
            <button
              className="copy-btn"
              onClick={() => navigator.clipboard.writeText(did)}
            >
              📋 Copy
            </button>
          </div>
        </div>
      )}

      <div className="card-grid">
        <div className="stat-card">
          <div className="stat-value">
            {isLoading ? '-' : stats.totalCredentials}
          </div>
          <div className="stat-label">Total Credentials</div>
        </div>

        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--color-success)' }}>
            {isLoading ? '-' : stats.activeCredentials}
          </div>
          <div className="stat-label">Active Credentials</div>
        </div>

        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--color-error)' }}>
            {isLoading ? '-' : stats.revokedCredentials}
          </div>
          <div className="stat-label">Revoked</div>
        </div>

        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--color-info)' }}>
            {isLoading ? '-' : stats.recentActions}
          </div>
          <div className="stat-label">Weekly Actions</div>
        </div>
      </div>

      <div className="card-grid" style={{ marginTop: '1.5rem' }}>
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">🎫 Issue Credential</h3>
          </div>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
            Create new agent identity, delegation or capability credentials.
          </p>
          <Link to="/issuer/issue" className="btn btn-issuer">
            Create Credential
          </Link>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">🚫 Revocation Management</h3>
          </div>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
            View issued credentials and revoke if necessary.
          </p>
          <Link to="/issuer/revocation" className="btn btn-secondary">
            Manage Revocations
          </Link>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">📋 Audit Logs</h3>
          </div>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
            Review all credential issuance and revocation operations.
          </p>
          <Link to="/issuer/audit" className="btn btn-secondary">
            View Logs
          </Link>
        </div>
      </div>
    </Layout>
  );
}
