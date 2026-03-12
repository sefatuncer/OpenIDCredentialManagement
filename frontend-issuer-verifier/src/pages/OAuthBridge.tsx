import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { oauthBridgeApi } from '../services/api';
import { toast } from '../hooks/useToast';

interface ScopeMappings {
  mappings: Record<string, { field: string; example: string[] }>;
  trust_levels: Record<string, string[]>;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  issued_token_type: string;
}

interface IntrospectResponse {
  active: boolean;
  sub?: string;
  scope?: string;
  exp?: number;
  iat?: number;
  source_credential_type?: string;
  issuer_did?: string;
}

type Tab = 'exchange' | 'introspect' | 'mappings';

export function OAuthBridge() {
  const [activeTab, setActiveTab] = useState<Tab>('exchange');

  // Exchange state
  const [vcJwt, setVcJwt] = useState('');
  const [requestedScope, setRequestedScope] = useState('');
  const [exchangeResult, setExchangeResult] = useState<TokenResponse | null>(null);
  const [exchangeError, setExchangeError] = useState('');
  const [isExchanging, setIsExchanging] = useState(false);

  // Introspect state
  const [introspectToken, setIntrospectToken] = useState('');
  const [introspectResult, setIntrospectResult] = useState<IntrospectResponse | null>(null);
  const [isIntrospecting, setIsIntrospecting] = useState(false);

  // Scope mappings state
  const [scopeMappings, setScopeMappings] = useState<ScopeMappings | null>(null);
  const [isLoadingMappings, setIsLoadingMappings] = useState(false);

  useEffect(() => {
    if (activeTab === 'mappings' && !scopeMappings) {
      loadScopeMappings();
    }
  }, [activeTab]);

  const loadScopeMappings = async () => {
    setIsLoadingMappings(true);
    const res = await oauthBridgeApi.getScopeMappings();
    if (res.success && res.data) {
      setScopeMappings(res.data);
    }
    setIsLoadingMappings(false);
  };

  const handleExchange = async () => {
    if (!vcJwt.trim()) {
      toast.error('Please enter a VC JWT');
      return;
    }

    setIsExchanging(true);
    setExchangeResult(null);
    setExchangeError('');

    const res = await oauthBridgeApi.exchangeToken(
      vcJwt.trim(),
      requestedScope.trim() || undefined
    );

    if (res.success && res.data) {
      setExchangeResult(res.data);
      toast.success('Token exchange successful');
    } else {
      setExchangeError(res.error || 'Exchange failed');
    }
    setIsExchanging(false);
  };

  const handleIntrospect = async () => {
    if (!introspectToken.trim()) {
      toast.error('Please enter a token to introspect');
      return;
    }

    setIsIntrospecting(true);
    setIntrospectResult(null);

    const res = await oauthBridgeApi.introspect(introspectToken.trim());
    if (res.success && res.data) {
      setIntrospectResult(res.data);
    }
    setIsIntrospecting(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  return (
    <Layout role="issuer">
      <div className="page-header">
        <h1>OAuth 2.0 Bridge</h1>
        <p className="page-subtitle">RFC 8693 Token Exchange — VC to OAuth Token</p>
      </div>

      <div className="tab-nav" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {(['exchange', 'introspect', 'mappings'] as Tab[]).map((tab) => (
          <button
            key={tab}
            className={`btn ${activeTab === tab ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'exchange' ? 'Token Exchange' : tab === 'introspect' ? 'Introspect' : 'Scope Mappings'}
          </button>
        ))}
      </div>

      {activeTab === 'exchange' && (
        <div className="card">
          <h2>Exchange VC for OAuth Token</h2>
          <p style={{ color: '#666', marginBottom: '1rem' }}>
            Paste a Verifiable Credential JWT to exchange it for a short-lived OAuth access token.
          </p>

          <div className="form-group">
            <label>VC JWT (Subject Token)</label>
            <textarea
              value={vcJwt}
              onChange={(e) => setVcJwt(e.target.value)}
              placeholder="eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9..."
              rows={6}
              style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.85rem' }}
            />
          </div>

          <div className="form-group">
            <label>Requested Scopes (optional, space-separated)</label>
            <input
              type="text"
              value={requestedScope}
              onChange={(e) => setRequestedScope(e.target.value)}
              placeholder="read write trust:verified"
              style={{ width: '100%' }}
            />
          </div>

          <button
            className="btn btn-primary"
            onClick={handleExchange}
            disabled={isExchanging || !vcJwt.trim()}
          >
            {isExchanging ? 'Exchanging...' : 'Exchange Token'}
          </button>

          {exchangeError && (
            <div className="alert alert-error" style={{ marginTop: '1rem' }}>
              {exchangeError}
            </div>
          )}

          {exchangeResult && (
            <div style={{ marginTop: '1.5rem' }}>
              <h3>Exchange Result</h3>
              <table className="data-table">
                <tbody>
                  <tr>
                    <td><strong>Token Type</strong></td>
                    <td>{exchangeResult.token_type}</td>
                  </tr>
                  <tr>
                    <td><strong>Expires In</strong></td>
                    <td>{exchangeResult.expires_in}s ({Math.round(exchangeResult.expires_in / 60)} min)</td>
                  </tr>
                  <tr>
                    <td><strong>Scope</strong></td>
                    <td><code>{exchangeResult.scope}</code></td>
                  </tr>
                  <tr>
                    <td><strong>Issued Token Type</strong></td>
                    <td><code>{exchangeResult.issued_token_type}</code></td>
                  </tr>
                  <tr>
                    <td><strong>Access Token</strong></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <code style={{ wordBreak: 'break-all', fontSize: '0.8rem' }}>
                          {exchangeResult.access_token.substring(0, 60)}...
                        </code>
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                          onClick={() => copyToClipboard(exchangeResult.access_token)}
                        >
                          Copy
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'introspect' && (
        <div className="card">
          <h2>Introspect Bridge Token</h2>
          <p style={{ color: '#666', marginBottom: '1rem' }}>
            Verify a bridge token and view its claims.
          </p>

          <div className="form-group">
            <label>Bridge Token</label>
            <textarea
              value={introspectToken}
              onChange={(e) => setIntrospectToken(e.target.value)}
              placeholder="Paste a bridge token here..."
              rows={4}
              style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.85rem' }}
            />
          </div>

          <button
            className="btn btn-primary"
            onClick={handleIntrospect}
            disabled={isIntrospecting || !introspectToken.trim()}
          >
            {isIntrospecting ? 'Introspecting...' : 'Introspect Token'}
          </button>

          {introspectResult && (
            <div style={{ marginTop: '1.5rem' }}>
              <h3>Introspection Result</h3>
              <div
                className={`alert ${introspectResult.active ? 'alert-success' : 'alert-error'}`}
                style={{ marginBottom: '1rem' }}
              >
                Token is <strong>{introspectResult.active ? 'ACTIVE' : 'INACTIVE'}</strong>
              </div>

              {introspectResult.active && (
                <table className="data-table">
                  <tbody>
                    <tr><td><strong>Subject</strong></td><td><code>{introspectResult.sub}</code></td></tr>
                    <tr><td><strong>Scope</strong></td><td><code>{introspectResult.scope}</code></td></tr>
                    <tr><td><strong>Issued At</strong></td><td>{introspectResult.iat ? new Date(introspectResult.iat * 1000).toLocaleString() : '-'}</td></tr>
                    <tr><td><strong>Expires</strong></td><td>{introspectResult.exp ? new Date(introspectResult.exp * 1000).toLocaleString() : '-'}</td></tr>
                    <tr><td><strong>Source Type</strong></td><td>{introspectResult.source_credential_type || '-'}</td></tr>
                    <tr><td><strong>Issuer DID</strong></td><td><code>{introspectResult.issuer_did || '-'}</code></td></tr>
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'mappings' && (
        <div className="card">
          <h2>Scope Mappings</h2>
          <p style={{ color: '#666', marginBottom: '1rem' }}>
            How credential fields map to OAuth scopes.
          </p>

          {isLoadingMappings ? (
            <p>Loading...</p>
          ) : scopeMappings ? (
            <>
              <h3>Credential Type Mappings</h3>
              <table className="data-table" style={{ marginBottom: '1.5rem' }}>
                <thead>
                  <tr>
                    <th>Credential Type</th>
                    <th>Scope Field</th>
                    <th>Example Scopes</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(scopeMappings.mappings).map(([type, mapping]) => (
                    <tr key={type}>
                      <td><code>{type}</code></td>
                      <td><code>{mapping.field}</code></td>
                      <td>{mapping.example.map((s) => <code key={s} style={{ marginRight: '0.25rem' }}>{s}</code>)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h3>Trust Level Scopes</h3>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Trust Level</th>
                    <th>Granted Scopes</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(scopeMappings.trust_levels).map(([level, scopes]) => (
                    <tr key={level}>
                      <td><code>{level}</code></td>
                      <td>{scopes.map((s) => <code key={s} style={{ marginRight: '0.25rem' }}>{s}</code>)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p style={{ color: '#999' }}>Failed to load scope mappings.</p>
          )}
        </div>
      )}
    </Layout>
  );
}
