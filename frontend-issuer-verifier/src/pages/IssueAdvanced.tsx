import { useState, useEffect, useMemo } from 'react';
import { Layout } from '../components/Layout';
import { issuerApi, schemaApi } from '../services/api';
import { QRCode } from '../components/QRCode';
import { toast } from '../hooks/useToast';

type Step = 'claims' | 'disclosure' | 'preview';

interface SchemaInfo {
  id: string;
  name: string;
  type: string;
  description: string;
  required: string[];
  credentialSubject: {
    type: string;
    properties: Record<string, { type: string; description?: string; enum?: unknown[] }>;
  };
  issuanceConfig?: {
    validityPeriod?: number;
    revocable?: boolean;
    selectiveDisclosure?: string[];
  };
}

interface CredentialResult {
  credentialOfferId: string;
  credentialOfferUri: string;
}

export function IssueAdvanced() {
  const [step, setStep] = useState<Step>('claims');
  const [schemas, setSchemas] = useState<SchemaInfo[]>([]);
  const [selectedSchemaId, setSelectedSchemaId] = useState('');
  const [loading, setLoading] = useState(false);
  const [schemasLoading, setSchemasLoading] = useState(true);

  // Step 1: Claims
  const [holderDid, setHolderDid] = useState('');
  const [format, setFormat] = useState<'vc+sd-jwt' | 'jwt_vc_json'>('vc+sd-jwt');
  const [claims, setClaims] = useState<Record<string, string>>({});

  // Step 2: SD options
  const [sdClaims, setSdClaims] = useState<Record<string, boolean>>({});
  const [validityDays, setValidityDays] = useState(365);
  const [revocable, setRevocable] = useState(true);

  // Result
  const [result, setResult] = useState<CredentialResult | null>(null);

  const selectedSchema = useMemo(
    () => schemas.find((s) => s.id === selectedSchemaId) || null,
    [schemas, selectedSchemaId]
  );

  // Load schemas on mount
  useEffect(() => {
    (async () => {
      const res = await schemaApi.list();
      if (res.success && res.data) {
        const active = res.data.schemas.filter((s) => s.active) as SchemaInfo[];
        setSchemas(active);
        if (active.length > 0) setSelectedSchemaId(active[0].id);
      }
      setSchemasLoading(false);
    })();
  }, []);

  // Reset claims when schema changes
  useEffect(() => {
    if (!selectedSchema) return;
    const initial: Record<string, string> = {};
    for (const key of Object.keys(selectedSchema.credentialSubject.properties)) {
      initial[key] = '';
    }
    setClaims(initial);

    // Initialize SD claims from schema config
    const sdEligible = selectedSchema.issuanceConfig?.selectiveDisclosure || [];
    const sdInit: Record<string, boolean> = {};
    for (const c of sdEligible) {
      sdInit[c] = true;
    }
    setSdClaims(sdInit);

    // Set defaults from schema
    setValidityDays(selectedSchema.issuanceConfig?.validityPeriod || 365);
    setRevocable(selectedSchema.issuanceConfig?.revocable !== false);
  }, [selectedSchema]);

  const propertyEntries = useMemo(() => {
    if (!selectedSchema) return [];
    return Object.entries(selectedSchema.credentialSubject.properties);
  }, [selectedSchema]);

  const sdEligibleClaims = useMemo(() => {
    return selectedSchema?.issuanceConfig?.selectiveDisclosure || [];
  }, [selectedSchema]);

  const requiredFields = useMemo(() => {
    return selectedSchema?.required || [];
  }, [selectedSchema]);

  const canProceedStep1 = holderDid.startsWith('did:') && selectedSchemaId !== '';

  const handleClaimChange = (key: string, value: string) => {
    setClaims((prev) => ({ ...prev, [key]: value }));
  };

  const handleIssue = async () => {
    setLoading(true);
    try {
      const processedClaims: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(claims)) {
        if (value === '') continue;
        const prop = selectedSchema?.credentialSubject.properties[key];
        if (prop?.type === 'number') {
          processedClaims[key] = Number(value);
        } else if (prop?.type === 'boolean') {
          processedClaims[key] = value === 'true';
        } else if (prop?.type === 'array') {
          processedClaims[key] = value.split(',').map((v) => v.trim()).filter(Boolean);
        } else {
          processedClaims[key] = value;
        }
      }

      const sdClaimsList = format === 'vc+sd-jwt'
        ? Object.entries(sdClaims).filter(([, v]) => v).map(([k]) => k)
        : undefined;

      const res = await issuerApi.issueBySchema({
        holderDid,
        schemaId: selectedSchemaId,
        claims: processedClaims,
        format,
        selectiveDisclosureClaims: sdClaimsList,
        validityDays,
        revocable,
      });

      if (!res.success || !res.data) {
        toast.error(res.error || 'Failed to issue credential');
        return;
      }

      toast.success('Credential issued successfully!');
      setResult({
        credentialOfferId: res.data.credentialOfferId,
        credentialOfferUri: res.data.credentialOfferUri,
      });
    } catch {
      toast.error('Connection error');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep('claims');
    setResult(null);
    setHolderDid('');
    setClaims({});
  };

  if (schemasLoading) {
    return (
      <Layout role="issuer">
        <div className="loading"><div className="spinner"></div></div>
      </Layout>
    );
  }

  if (schemas.length === 0) {
    return (
      <Layout role="issuer">
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <p>No active schemas found</p>
          <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
            Create schemas in Schema Management first
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout role="issuer">
      <div className="page-header">
        <h1 className="page-title">Advanced Issue</h1>
        <p className="page-subtitle">Schema-driven credential issuance with selective disclosure</p>
      </div>

      {/* Step indicator */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {(['claims', 'disclosure', 'preview'] as Step[]).map((s, i) => (
          <div
            key={s}
            style={{
              flex: 1,
              padding: '0.5rem',
              textAlign: 'center',
              borderRadius: '6px',
              fontSize: '0.85rem',
              fontWeight: step === s ? 600 : 400,
              backgroundColor: step === s ? 'var(--color-issuer)' : 'var(--color-bg-secondary)',
              color: step === s ? '#fff' : 'var(--color-text-secondary)',
              cursor: 'pointer',
            }}
            onClick={() => {
              const steps: Step[] = ['claims', 'disclosure', 'preview'];
              if (steps.indexOf(s) < steps.indexOf(step)) setStep(s);
            }}
          >
            {i + 1}. {s === 'claims' ? 'Schema & Claims' : s === 'disclosure' ? 'SD Options' : 'Preview & Issue'}
          </div>
        ))}
      </div>

      {/* Step 1: Schema & Claims */}
      {step === 'claims' && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Schema & Claims</h3>
          </div>

          <div className="form-group">
            <label className="form-label">Schema</label>
            <select
              className="form-input"
              value={selectedSchemaId}
              onChange={(e) => setSelectedSchemaId(e.target.value)}
            >
              {schemas.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.id})</option>
              ))}
            </select>
            {selectedSchema && (
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
                {selectedSchema.description}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Holder DID *</label>
            <input
              className="form-input"
              value={holderDid}
              onChange={(e) => setHolderDid(e.target.value)}
              placeholder="did:key:z6Mk..."
            />
          </div>

          <div className="form-group">
            <label className="form-label">Credential Format</label>
            <select
              className="form-input"
              value={format}
              onChange={(e) => setFormat(e.target.value as 'vc+sd-jwt' | 'jwt_vc_json')}
            >
              <option value="vc+sd-jwt">SD-JWT VC (vc+sd-jwt)</option>
              <option value="jwt_vc_json">JWT VC (jwt_vc_json)</option>
            </select>
          </div>

          {/* Dynamic claim fields */}
          {propertyEntries.length > 0 && (
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '1rem', marginTop: '1rem' }}>
              <h4 style={{ marginBottom: '0.75rem', fontSize: '0.9rem' }}>Credential Claims</h4>
              {propertyEntries.map(([key, prop]) => {
                const isRequired = requiredFields.includes(key);
                const propType = (prop as { type: string }).type;
                return (
                  <div className="form-group" key={key}>
                    <label className="form-label">
                      {key} {isRequired && <span style={{ color: 'var(--color-error)' }}>*</span>}
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginLeft: '0.5rem' }}>
                        ({propType})
                      </span>
                    </label>
                    {propType === 'boolean' ? (
                      <select
                        className="form-input"
                        value={claims[key] || ''}
                        onChange={(e) => handleClaimChange(key, e.target.value)}
                      >
                        <option value="">-- Select --</option>
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    ) : (
                      <input
                        className="form-input"
                        type={propType === 'number' ? 'number' : 'text'}
                        value={claims[key] || ''}
                        onChange={(e) => handleClaimChange(key, e.target.value)}
                        placeholder={propType === 'array' ? 'comma-separated values' : `Enter ${key}`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <button
            className="btn btn-issuer btn-lg"
            disabled={!canProceedStep1}
            onClick={() => setStep(format === 'vc+sd-jwt' ? 'disclosure' : 'preview')}
            style={{ marginTop: '1rem', width: '100%' }}
          >
            {format === 'vc+sd-jwt' ? 'Next: Selective Disclosure' : 'Next: Preview'}
          </button>
        </div>
      )}

      {/* Step 2: Selective Disclosure & Options */}
      {step === 'disclosure' && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Selective Disclosure Options</h3>
          </div>

          {sdEligibleClaims.length > 0 ? (
            <div className="form-group">
              <label className="form-label">SD-Eligible Claims</label>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
                Checked claims can be selectively disclosed by the holder. Unchecked claims are always visible.
              </p>
              {sdEligibleClaims.map((claim) => (
                <label
                  key={claim}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem',
                    marginBottom: '0.25rem',
                    borderRadius: '4px',
                    backgroundColor: 'var(--color-bg-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={sdClaims[claim] ?? true}
                    onChange={(e) => setSdClaims((prev) => ({ ...prev, [claim]: e.target.checked }))}
                  />
                  <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{claim}</span>
                  <span style={{
                    marginLeft: 'auto',
                    fontSize: '0.75rem',
                    padding: '0.1rem 0.4rem',
                    borderRadius: '4px',
                    backgroundColor: sdClaims[claim] ? 'rgba(59,130,246,0.2)' : 'rgba(34,197,94,0.2)',
                    color: sdClaims[claim] ? '#60a5fa' : '#4ade80',
                  }}>
                    {sdClaims[claim] ? 'Selective' : 'Always Visible'}
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <div className="alert" style={{ marginBottom: '1rem' }}>
              No selective disclosure claims defined for this schema.
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Validity Period (days)</label>
            <input
              className="form-input"
              type="number"
              min={1}
              max={3650}
              value={validityDays}
              onChange={(e) => setValidityDays(Number(e.target.value))}
            />
          </div>

          <div className="form-group">
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={revocable}
                onChange={(e) => setRevocable(e.target.checked)}
              />
              <span className="form-label" style={{ margin: 0 }}>Revocable</span>
            </label>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button className="btn btn-secondary" onClick={() => setStep('claims')}>
              Back
            </button>
            <button
              className="btn btn-issuer btn-lg"
              onClick={() => setStep('preview')}
              style={{ flex: 1 }}
            >
              Next: Preview
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Preview & Issue */}
      {step === 'preview' && !result && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Credential Preview</h3>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
              <strong>Schema:</strong> {selectedSchema?.name} ({selectedSchemaId})
            </div>
            <div style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
              <strong>Holder:</strong> <code style={{ fontSize: '0.8rem' }}>{holderDid}</code>
            </div>
            <div style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
              <strong>Format:</strong> {format}
            </div>
            {format === 'vc+sd-jwt' && (
              <div style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                <strong>Validity:</strong> {validityDays} days | <strong>Revocable:</strong> {revocable ? 'Yes' : 'No'}
              </div>
            )}
          </div>

          {/* Claims preview */}
          <div style={{
            backgroundColor: 'var(--color-bg-secondary)',
            borderRadius: '6px',
            padding: '1rem',
            marginBottom: '1rem',
          }}>
            <h4 style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>Claims</h4>
            {Object.entries(claims)
              .filter(([, v]) => v !== '')
              .map(([key, value]) => {
                const isSd = format === 'vc+sd-jwt' && sdClaims[key];
                const isMandatory = requiredFields.includes(key) && !isSd;
                return (
                  <div
                    key={key}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.4rem 0',
                      borderBottom: '1px solid var(--color-border)',
                      fontSize: '0.85rem',
                    }}
                  >
                    <div>
                      <span style={{ fontFamily: 'monospace' }}>{key}:</span>{' '}
                      <span style={{ color: 'var(--color-text-secondary)' }}>{value}</span>
                    </div>
                    {format === 'vc+sd-jwt' && (
                      <span style={{
                        fontSize: '0.7rem',
                        padding: '0.1rem 0.4rem',
                        borderRadius: '4px',
                        backgroundColor: isSd ? 'rgba(59,130,246,0.2)' : 'rgba(34,197,94,0.2)',
                        color: isSd ? '#60a5fa' : '#4ade80',
                        whiteSpace: 'nowrap',
                      }}>
                        {isSd ? 'Selective Disclosure' : isMandatory ? 'Always Visible' : 'Visible'}
                      </span>
                    )}
                  </div>
                );
              })}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setStep(format === 'vc+sd-jwt' ? 'disclosure' : 'claims')}
            >
              Back
            </button>
            <button
              className="btn btn-issuer btn-lg"
              onClick={handleIssue}
              disabled={loading}
              style={{ flex: 1 }}
            >
              {loading ? 'Issuing...' : 'Issue Credential'}
            </button>
          </div>
        </div>
      )}

      {/* Result: QR Code */}
      {result && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Credential Offer</h3>
          </div>

          <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
            Credential offer created successfully!
          </div>

          <QRCode data={result.credentialOfferUri} label="Scan with Web Wallet" />

          <div style={{ marginTop: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Offer ID</label>
              <div className="did-display">
                <span className="did-text" style={{ fontSize: '0.75rem' }}>
                  {result.credentialOfferId}
                </span>
                <button
                  className="copy-btn"
                  onClick={() => {
                    navigator.clipboard.writeText(result.credentialOfferId);
                    toast.success('Offer ID copied!');
                  }}
                >
                  Copy
                </button>
              </div>
            </div>

            <div className="form-group" style={{ marginTop: '0.5rem' }}>
              <label className="form-label">Offer URI</label>
              <div className="did-display">
                <span className="did-text" style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>
                  {result.credentialOfferUri.slice(0, 60)}...
                </span>
                <button
                  className="copy-btn"
                  onClick={() => {
                    navigator.clipboard.writeText(result.credentialOfferUri);
                    toast.success('Offer URI copied!');
                  }}
                >
                  Copy
                </button>
              </div>
            </div>
          </div>

          <button
            className="btn btn-issuer"
            onClick={handleReset}
            style={{ width: '100%', marginTop: '1rem' }}
          >
            Issue Another Credential
          </button>
        </div>
      )}
    </Layout>
  );
}
