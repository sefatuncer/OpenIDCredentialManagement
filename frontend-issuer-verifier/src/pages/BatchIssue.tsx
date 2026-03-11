import { useState, useRef, useCallback, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { issuerApi } from '../services/api';
import { toast } from '../hooks/useToast';

type Step = 'input' | 'progress' | 'results';

interface Recipient {
  holderDid: string;
  claims: Record<string, unknown>;
}

interface BatchResult {
  id: string;
  success: boolean;
  credentialId?: string;
  credential?: string;
  error?: string;
}

interface JobStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalRequests: number;
  processedCount: number;
  successCount: number;
  failureCount: number;
}

const CREDENTIAL_TYPES = [
  'AIAgentIdentityCredential',
  'DelegationCredential',
  'CapabilityCredential',
] as const;

export function BatchIssue() {
  const [step, setStep] = useState<Step>('input');
  const [credentialType, setCredentialType] = useState<string>(CREDENTIAL_TYPES[0]);
  const [format, setFormat] = useState<string>('jwt_vc_json');
  const [inputMode, setInputMode] = useState<'json' | 'csv'>('json');
  const [textInput, setTextInput] = useState('');
  const [parseError, setParseError] = useState('');
  const [recipients, setRecipients] = useState<Recipient[]>([]);

  // Progress state
  const [jobId, setJobId] = useState('');
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Results state
  const [results, setResults] = useState<BatchResult[]>([]);

  const parseJSON = useCallback((text: string): Recipient[] => {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error('JSON must be an array');
    for (const item of parsed) {
      if (!item.holderDid || typeof item.holderDid !== 'string') {
        throw new Error('Each item must have a "holderDid" string field');
      }
      if (!item.claims || typeof item.claims !== 'object') {
        throw new Error('Each item must have a "claims" object field');
      }
    }
    return parsed;
  }, []);

  const parseCSV = useCallback((text: string): Recipient[] => {
    const lines = text.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row');

    const headers = lines[0].split(',').map(h => h.trim());
    const didIdx = headers.indexOf('holderDid');
    if (didIdx === -1) throw new Error('CSV must have a "holderDid" column');

    const claimHeaders = headers.filter(h => h !== 'holderDid');

    return lines.slice(1).map((line, i) => {
      const values = line.split(',').map(v => v.trim());
      if (values.length !== headers.length) {
        throw new Error(`Row ${i + 2}: expected ${headers.length} columns, got ${values.length}`);
      }
      const claims: Record<string, unknown> = {};
      for (const h of claimHeaders) {
        claims[h] = values[headers.indexOf(h)];
      }
      return { holderDid: values[didIdx], claims };
    });
  }, []);

  const handlePreview = () => {
    setParseError('');
    try {
      const parsed = inputMode === 'json' ? parseJSON(textInput) : parseCSV(textInput);
      if (parsed.length === 0) {
        setParseError('No recipients found');
        return;
      }
      if (parsed.length > 100) {
        setParseError('Maximum 100 recipients per batch');
        return;
      }
      setRecipients(parsed);
    } catch (e) {
      setParseError((e as Error).message);
    }
  };

  const handleSubmit = async () => {
    if (recipients.length === 0) {
      toast.error('No recipients to process');
      return;
    }

    const response = await issuerApi.issueBatch({
      credentialType,
      format,
      recipients,
    });

    if (!response.success || !response.data) {
      toast.error(response.error || 'Failed to create batch job');
      return;
    }

    setJobId(response.data.jobId);
    setJobStatus({
      status: 'pending',
      totalRequests: response.data.totalRequests,
      processedCount: 0,
      successCount: 0,
      failureCount: 0,
    });
    setStep('progress');
    toast.success(`Batch job created: ${response.data.jobId}`);
  };

  // Polling for job status
  useEffect(() => {
    if (step !== 'progress' || !jobId) return;

    const poll = async () => {
      const res = await issuerApi.getBatchStatus(jobId);
      if (!res.success || !res.data) return;

      setJobStatus(res.data);

      if (res.data.status === 'completed' || res.data.status === 'failed') {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        // Fetch results
        const resultsRes = await issuerApi.getBatchResults(jobId);
        if (resultsRes.success && resultsRes.data) {
          setResults(resultsRes.data.results);
        }
        setStep('results');
      }
    };

    poll();
    pollingRef.current = setInterval(poll, 2000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [step, jobId]);

  const handleReset = () => {
    setStep('input');
    setRecipients([]);
    setTextInput('');
    setJobId('');
    setJobStatus(null);
    setResults([]);
    setParseError('');
  };

  const progressPercent = jobStatus
    ? Math.round((jobStatus.processedCount / jobStatus.totalRequests) * 100)
    : 0;

  return (
    <Layout role="issuer">
      <div className="page-header">
        <h1 className="page-title">Batch Issue Credentials</h1>
        <p className="page-subtitle">Issue multiple credentials at once via CSV or JSON</p>
      </div>

      {/* Step 1: Input */}
      {step === 'input' && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Batch Configuration</h3>
          </div>

          <div className="form-group">
            <label className="form-label">Credential Type</label>
            <select
              className="form-input"
              value={credentialType}
              onChange={(e) => setCredentialType(e.target.value)}
            >
              {CREDENTIAL_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Format</label>
            <select
              className="form-input"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            >
              <option value="jwt_vc_json">JWT VC (jwt_vc_json)</option>
              <option value="vc+sd-jwt">SD-JWT VC (vc+sd-jwt)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Input Mode</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className={`btn ${inputMode === 'json' ? 'btn-issuer' : 'btn-secondary'}`}
                onClick={() => { setInputMode('json'); setTextInput(''); setRecipients([]); setParseError(''); }}
              >
                JSON
              </button>
              <button
                className={`btn ${inputMode === 'csv' ? 'btn-issuer' : 'btn-secondary'}`}
                onClick={() => { setInputMode('csv'); setTextInput(''); setRecipients([]); setParseError(''); }}
              >
                CSV
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">
              Recipients ({inputMode === 'json' ? 'JSON Array' : 'CSV'})
            </label>
            <textarea
              className="form-input"
              rows={10}
              value={textInput}
              onChange={(e) => { setTextInput(e.target.value); setRecipients([]); setParseError(''); }}
              placeholder={inputMode === 'json'
                ? '[\n  { "holderDid": "did:key:z6Mk...", "claims": { "agent_name": "Agent-1", "agent_type": "autonomous" } }\n]'
                : 'holderDid,agent_name,agent_type\ndid:key:z6Mk...,Agent-1,autonomous'
              }
              style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
            />
          </div>

          {parseError && (
            <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
              {parseError}
            </div>
          )}

          {recipients.length > 0 && (
            <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
              {recipients.length} recipient(s) parsed successfully
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-secondary" onClick={handlePreview}>
              Preview
            </button>
            <button
              className="btn btn-issuer"
              onClick={handleSubmit}
              disabled={recipients.length === 0}
            >
              Submit Batch ({recipients.length})
            </button>
          </div>

          {recipients.length > 0 && (
            <div style={{ marginTop: '1rem', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid var(--color-border)' }}>#</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid var(--color-border)' }}>Holder DID</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid var(--color-border)' }}>Claims</th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.slice(0, 10).map((r, i) => (
                    <tr key={i}>
                      <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--color-border)' }}>{i + 1}</td>
                      <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--color-border)', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        {r.holderDid.length > 30 ? r.holderDid.slice(0, 30) + '...' : r.holderDid}
                      </td>
                      <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--color-border)', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        {JSON.stringify(r.claims).slice(0, 50)}
                      </td>
                    </tr>
                  ))}
                  {recipients.length > 10 && (
                    <tr>
                      <td colSpan={3} style={{ padding: '0.5rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                        ... and {recipients.length - 10} more
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Progress */}
      {step === 'progress' && jobStatus && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Processing Batch</h3>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span>Job: <code>{jobId}</code></span>
              <span>{jobStatus.processedCount} / {jobStatus.totalRequests}</span>
            </div>
            <div style={{
              width: '100%',
              height: '24px',
              backgroundColor: 'var(--color-bg-secondary)',
              borderRadius: '12px',
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${progressPercent}%`,
                height: '100%',
                backgroundColor: 'var(--color-issuer)',
                transition: 'width 0.3s ease',
                borderRadius: '12px',
              }} />
            </div>
            <div style={{ textAlign: 'center', marginTop: '0.5rem', color: 'var(--color-text-secondary)' }}>
              {progressPercent}% — {jobStatus.status}
            </div>
          </div>

          <div className="loading">
            <div className="spinner"></div>
          </div>
        </div>
      )}

      {/* Step 3: Results */}
      {step === 'results' && jobStatus && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Batch Results</h3>
          </div>

          <div className="card-grid" style={{ marginBottom: '1rem' }}>
            <div className="stat-card">
              <div className="stat-value">{jobStatus.totalRequests}</div>
              <div className="stat-label">Total</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: 'var(--color-success)' }}>{jobStatus.successCount}</div>
              <div className="stat-label">Success</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: 'var(--color-error)' }}>{jobStatus.failureCount}</div>
              <div className="stat-label">Failed</div>
            </div>
          </div>

          {results.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid var(--color-border)' }}>#</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid var(--color-border)' }}>Status</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid var(--color-border)' }}>Credential ID</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid var(--color-border)' }}>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i}>
                      <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--color-border)' }}>{Number(r.id) + 1}</td>
                      <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--color-border)' }}>
                        <span style={{ color: r.success ? 'var(--color-success)' : 'var(--color-error)' }}>
                          {r.success ? 'Success' : 'Failed'}
                        </span>
                      </td>
                      <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--color-border)', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        {r.credentialId ? (r.credentialId.length > 20 ? r.credentialId.slice(0, 20) + '...' : r.credentialId) : '-'}
                      </td>
                      <td style={{ padding: '0.5rem', borderBottom: '1px solid var(--color-border)', color: 'var(--color-error)' }}>
                        {r.error || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button
            className="btn btn-issuer"
            onClick={handleReset}
            style={{ marginTop: '1rem' }}
          >
            New Batch
          </button>
        </div>
      )}
    </Layout>
  );
}
