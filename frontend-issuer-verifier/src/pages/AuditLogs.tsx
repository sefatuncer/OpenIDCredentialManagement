import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { AuditTable } from '../components/AuditTable';
import { auditApi } from '../services/api';
import { UserRole } from '../services/storage';

interface AuditLog {
  id: string;
  action: string;
  actor: string;
  target?: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

interface AuditLogsProps {
  role: UserRole;
}

export function AuditLogs({ role }: AuditLogsProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState('');
  const limit = 20;

  useEffect(() => {
    loadLogs();
  }, [page, actionFilter]);

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const response = await auditApi.getLogs({
        page,
        limit,
        action: actionFilter || undefined,
      });

      if (response.success && response.data) {
        setLogs(response.data.logs || []);
        setTotal(response.data.total || 0);
      } else {
        setLogs([]);
        setTotal(0);
      }
    } catch (error) {
      console.error('Failed to load audit logs:', error);
      setLogs([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  const actionOptions = role === 'issuer'
    ? ['issue', 'revoke', 'unrevoke']
    : ['verify', 'trust_add', 'trust_remove'];

  return (
    <Layout role={role}>
      <div className="page-header">
        <h1 className="page-title">Audit Logs</h1>
        <p className="page-subtitle">
          {role === 'issuer' ? 'Credential issuance and revocation operations' : 'Verification operations'}
        </p>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Filters</h3>
        </div>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Action Type</label>
            <select
              className="form-select"
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All</option>
              {actionOptions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </div>

          <div style={{ alignSelf: 'flex-end' }}>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setActionFilter('');
                setPage(1);
              }}
            >
              🔄 Reset
            </button>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="card-header">
          <h3 className="card-title">Log Records</h3>
          <span className="badge badge-info">{total} records</span>
        </div>

        <AuditTable logs={logs} isLoading={isLoading} />

        {totalPages > 1 && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '1rem',
            marginTop: '1rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--color-border)'
          }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              ← Previous
            </button>
            <span style={{ color: 'var(--color-text-secondary)' }}>
              Page {page} / {totalPages}
            </span>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
