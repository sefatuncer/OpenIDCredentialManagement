import { useState, useEffect, useCallback } from 'react';
import { Layout } from '../components/Layout';
import { toast } from '../hooks/useToast';
import { tenantApi } from '../services/api';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'pending';
  config: {
    allowedCredentialTypes: string[];
    features: { sdjwt: boolean; revocation: boolean; batchIssuance: boolean; webhooks: boolean };
  };
  createdAt: string;
}

interface TenantStats {
  totalTenants: number;
  activeTenants: number;
  suspendedTenants: number;
  totalCredentialsIssued: number;
}

export function TenantManagement() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [stats, setStats] = useState<TenantStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<string>('');

  const loadData = useCallback(async () => {
    setLoading(true);
    const [tenantsRes, statsRes] = await Promise.all([
      tenantApi.list(filter || undefined),
      tenantApi.getStats(),
    ]);

    if (tenantsRes.success && tenantsRes.data) {
      setTenants((tenantsRes.data as any).tenants || []);
    }
    if (statsRes.success && statsRes.data) {
      setStats(statsRes.data as any);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newSlug.trim()) return;

    setCreating(true);
    const res = await tenantApi.create(newName, newSlug);
    if (res.success) {
      toast.success(`Tenant "${newName}" created`);
      setShowCreate(false);
      setNewName('');
      setNewSlug('');
      loadData();
    } else {
      toast.error(res.error || 'Failed to create tenant');
    }
    setCreating(false);
  };

  const handleSuspend = async (tenant: Tenant) => {
    const reason = prompt('Suspension reason (optional):');
    const res = await tenantApi.suspend(tenant.id, reason || undefined);
    if (res.success) {
      toast.success(`Tenant "${tenant.name}" suspended`);
      loadData();
    } else {
      toast.error(res.error || 'Failed to suspend tenant');
    }
  };

  const handleActivate = async (tenant: Tenant) => {
    const res = await tenantApi.activate(tenant.id);
    if (res.success) {
      toast.success(`Tenant "${tenant.name}" activated`);
      loadData();
    } else {
      toast.error(res.error || 'Failed to activate tenant');
    }
  };

  const handleDelete = async (tenant: Tenant) => {
    if (!confirm(`Delete tenant "${tenant.name}"? This cannot be undone.`)) return;
    const res = await tenantApi.delete(tenant.id);
    if (res.success) {
      toast.success(`Tenant "${tenant.name}" deleted`);
      loadData();
    } else {
      toast.error(res.error || 'Failed to delete tenant');
    }
  };

  const autoSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  return (
    <Layout role="issuer">
      <div className="page-header">
        <h2>Multi-Tenant Management</h2>
        <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? 'Cancel' : 'New Tenant'}
        </button>
      </div>

      {stats && (
        <div className="stats-row" style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
          <div className="stat-card">
            <div className="stat-value">{stats.totalTenants}</div>
            <div className="stat-label">Total Tenants</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.activeTenants}</div>
            <div className="stat-label">Active</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.suspendedTenants}</div>
            <div className="stat-label">Suspended</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.totalCredentialsIssued}</div>
            <div className="stat-label">Total Credentials</div>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
          <h3>Create New Tenant</h3>
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label className="form-label">Name</label>
              <input
                className="form-input"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  if (!newSlug || newSlug === autoSlug(newName)) {
                    setNewSlug(autoSlug(e.target.value));
                  }
                }}
                placeholder="Organization Name"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Slug</label>
              <input
                className="form-input"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                placeholder="organization-name"
                pattern="^[a-z0-9-]+$"
                required
              />
              <div className="form-helper">Lowercase letters, numbers, and hyphens only</div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? 'Creating...' : 'Create Tenant'}
            </button>
          </form>
        </div>
      )}

      <div style={{ marginBottom: '1rem' }}>
        <select
          className="form-input"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: 'auto' }}
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      {loading ? (
        <div className="loading">Loading tenants...</div>
      ) : tenants.length === 0 ? (
        <div className="empty-state">No tenants found. Create one to get started.</div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Status</th>
                <th>Credential Types</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td><strong>{t.name}</strong></td>
                  <td><code>{t.slug}</code></td>
                  <td>
                    <span className={`badge badge-${t.status === 'active' ? 'success' : t.status === 'suspended' ? 'danger' : 'warning'}`}>
                      {t.status}
                    </span>
                  </td>
                  <td>{t.config.allowedCredentialTypes.length} types</td>
                  <td>{new Date(t.createdAt).toLocaleDateString()}</td>
                  <td>
                    {t.status === 'active' ? (
                      <button className="btn btn-sm btn-warning" onClick={() => handleSuspend(t)}>Suspend</button>
                    ) : (
                      <button className="btn btn-sm btn-success" onClick={() => handleActivate(t)}>Activate</button>
                    )}
                    {' '}
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(t)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
