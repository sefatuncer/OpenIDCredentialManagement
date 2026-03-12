import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { webhookApi } from '../services/api';

const EVENT_TYPES = [
  'credential.revoked',
  'credential.unrevoked',
  'credential.issued',
  'verification.completed',
];

interface Webhook {
  id: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  createdAt: string;
  metadata?: { name?: string; description?: string };
}

interface Delivery {
  id: string;
  event: string;
  status: 'pending' | 'success' | 'failed';
  attempts: number;
  responseStatus?: number;
  createdAt: string;
}

type View = 'list' | 'create' | 'detail';

export function WebhookManagement() {
  const [view, setView] = useState<View>('list');
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [selectedWebhook, setSelectedWebhook] = useState<Webhook | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Create form
  const [formUrl, setFormUrl] = useState('');
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formEvents, setFormEvents] = useState<string[]>([]);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  useEffect(() => {
    loadWebhooks();
  }, []);

  const loadWebhooks = async () => {
    setLoading(true);
    const res = await webhookApi.list();
    if (res.success && res.data) {
      setWebhooks(res.data.webhooks);
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!formUrl || formEvents.length === 0) return;
    setLoading(true);
    const res = await webhookApi.create({
      url: formUrl,
      events: formEvents,
      name: formName || undefined,
      description: formDesc || undefined,
    });
    if (res.success && res.data) {
      setCreatedSecret(res.data.webhook.secret);
      setFormUrl('');
      setFormName('');
      setFormDesc('');
      setFormEvents([]);
      await loadWebhooks();
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this webhook subscription?')) return;
    await webhookApi.delete(id);
    await loadWebhooks();
    if (selectedWebhook?.id === id) {
      setView('list');
      setSelectedWebhook(null);
    }
  };

  const handleToggle = async (wh: Webhook) => {
    await webhookApi.update(wh.id, { active: !wh.active });
    await loadWebhooks();
  };

  const handleTest = async (id: string) => {
    setTestResult(null);
    const res = await webhookApi.test(id);
    if (res.success && res.data) {
      const r = res.data;
      setTestResult(
        r.success
          ? `OK (${r.responseStatus}) in ${r.latencyMs}ms`
          : `Failed${r.responseStatus ? ` (${r.responseStatus})` : ''} in ${r.latencyMs}ms`,
      );
    } else {
      setTestResult('Test request failed');
    }
  };

  const openDetail = async (wh: Webhook) => {
    setSelectedWebhook(wh);
    setTestResult(null);
    setView('detail');
    const res = await webhookApi.deliveries(wh.id);
    if (res.success && res.data) {
      setDeliveries(res.data.deliveries);
    }
  };

  const toggleEvent = (event: string) => {
    setFormEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    );
  };

  return (
    <Layout role="issuer">
      <div className="page-header">
        <h1 className="page-title">Webhook Management</h1>
        <p className="page-subtitle">Configure HTTP webhook notifications for credential events</p>
      </div>

      {view === 'list' && (
        <>
          <div style={{ marginBottom: '1rem' }}>
            <button className="btn btn-issuer" onClick={() => { setView('create'); setCreatedSecret(null); }}>
              + New Webhook
            </button>
          </div>

          {loading && <p>Loading...</p>}

          {webhooks.length === 0 && !loading && (
            <div className="card">
              <p style={{ color: 'var(--color-text-secondary)', textAlign: 'center', padding: '2rem' }}>
                No webhook subscriptions yet. Create one to receive real-time notifications.
              </p>
            </div>
          )}

          {webhooks.map((wh) => (
            <div className="card" key={wh.id} style={{ marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => openDetail(wh)}>
                  <strong>{wh.metadata?.name || wh.url}</strong>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                    {wh.url}
                  </div>
                  <div style={{ marginTop: '0.25rem' }}>
                    {wh.events.map((e) => (
                      <span
                        key={e}
                        style={{
                          display: 'inline-block',
                          padding: '0.1rem 0.5rem',
                          marginRight: '0.25rem',
                          fontSize: '0.75rem',
                          borderRadius: '4px',
                          background: 'var(--color-bg-secondary)',
                        }}
                      >
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span
                    style={{
                      color: wh.active ? 'var(--color-success)' : 'var(--color-text-secondary)',
                      fontSize: '0.85rem',
                    }}
                  >
                    {wh.active ? 'Active' : 'Paused'}
                  </span>
                  <button className="btn btn-secondary" onClick={() => handleToggle(wh)} style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>
                    {wh.active ? 'Pause' : 'Resume'}
                  </button>
                  <button className="btn btn-secondary" onClick={() => handleDelete(wh.id)} style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: 'var(--color-error)' }}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {view === 'create' && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Create Webhook</h3>
          </div>

          {createdSecret && (
            <div style={{ padding: '1rem', marginBottom: '1rem', background: 'var(--color-bg-secondary)', borderRadius: '6px', border: '1px solid var(--color-success)' }}>
              <strong>Webhook created! Save this secret — it won't be shown again:</strong>
              <div style={{ fontFamily: 'monospace', marginTop: '0.5rem', wordBreak: 'break-all' }}>
                {createdSecret}
              </div>
              <button className="btn btn-secondary" style={{ marginTop: '0.5rem' }} onClick={() => { navigator.clipboard.writeText(createdSecret); }}>
                Copy Secret
              </button>
            </div>
          )}

          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label">Name (optional)</label>
            <input className="form-input" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="My webhook" />
          </div>

          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label">URL *</label>
            <input className="form-input" value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://example.com/webhook" />
          </div>

          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label">Events *</label>
            {EVENT_TYPES.map((evt) => (
              <label key={evt} style={{ display: 'block', marginBottom: '0.25rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formEvents.includes(evt)}
                  onChange={() => toggleEvent(evt)}
                  style={{ marginRight: '0.5rem' }}
                />
                {evt}
              </label>
            ))}
          </div>

          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <label className="form-label">Description (optional)</label>
            <textarea className="form-input" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} rows={2} placeholder="What this webhook is used for" />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-issuer" onClick={handleCreate} disabled={loading || !formUrl || formEvents.length === 0}>
              {loading ? 'Creating...' : 'Create Webhook'}
            </button>
            <button className="btn btn-secondary" onClick={() => setView('list')}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {view === 'detail' && selectedWebhook && (
        <>
          <button className="btn btn-secondary" onClick={() => setView('list')} style={{ marginBottom: '1rem' }}>
            Back to List
          </button>

          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="card-header">
              <h3 className="card-title">{selectedWebhook.metadata?.name || 'Webhook Detail'}</h3>
            </div>
            <table style={{ width: '100%', fontSize: '0.9rem' }}>
              <tbody>
                <tr><td style={{ fontWeight: 'bold', padding: '0.25rem 0.5rem' }}>ID</td><td>{selectedWebhook.id}</td></tr>
                <tr><td style={{ fontWeight: 'bold', padding: '0.25rem 0.5rem' }}>URL</td><td>{selectedWebhook.url}</td></tr>
                <tr><td style={{ fontWeight: 'bold', padding: '0.25rem 0.5rem' }}>Events</td><td>{selectedWebhook.events.join(', ')}</td></tr>
                <tr><td style={{ fontWeight: 'bold', padding: '0.25rem 0.5rem' }}>Status</td><td>{selectedWebhook.active ? 'Active' : 'Paused'}</td></tr>
                <tr><td style={{ fontWeight: 'bold', padding: '0.25rem 0.5rem' }}>Secret</td><td style={{ fontFamily: 'monospace' }}>{selectedWebhook.secret}</td></tr>
                <tr><td style={{ fontWeight: 'bold', padding: '0.25rem 0.5rem' }}>Created</td><td>{new Date(selectedWebhook.createdAt).toLocaleString()}</td></tr>
              </tbody>
            </table>
            <div style={{ marginTop: '1rem' }}>
              <button className="btn btn-issuer" onClick={() => handleTest(selectedWebhook.id)} style={{ marginRight: '0.5rem' }}>
                Send Test Event
              </button>
              {testResult && (
                <span style={{ color: testResult.startsWith('OK') ? 'var(--color-success)' : 'var(--color-error)' }}>
                  {testResult}
                </span>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Delivery History</h3>
            </div>
            {deliveries.length === 0 ? (
              <p style={{ color: 'var(--color-text-secondary)', padding: '1rem' }}>No deliveries yet.</p>
            ) : (
              <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Event</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Status</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>HTTP</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Attempts</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((d) => (
                    <tr key={d.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '0.5rem' }}>{d.event}</td>
                      <td style={{ padding: '0.5rem' }}>
                        <span style={{
                          color: d.status === 'success' ? 'var(--color-success)' : d.status === 'failed' ? 'var(--color-error)' : 'var(--color-warning)',
                        }}>
                          {d.status}
                        </span>
                      </td>
                      <td style={{ padding: '0.5rem' }}>{d.responseStatus || '-'}</td>
                      <td style={{ padding: '0.5rem' }}>{d.attempts}</td>
                      <td style={{ padding: '0.5rem' }}>{new Date(d.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </Layout>
  );
}
