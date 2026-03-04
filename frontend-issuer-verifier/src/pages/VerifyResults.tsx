import { useState } from 'react';
import { Layout } from '../components/Layout';
import { verifierApi } from '../services/api';
import { toast } from '../hooks/useToast';

interface VerificationResult {
  status: 'pending' | 'completed' | 'failed' | 'expired';
  result?: {
    verified: boolean;
    credentials: unknown[];
    holder?: string;
  };
  error?: string;
}

export function VerifyResults() {
  const [sessionId, setSessionId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState('');

  const checkResult = async () => {
    if (!sessionId.trim()) {
      toast.error('Session ID is required');
      return;
    }

    setIsLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await verifierApi.getResult(sessionId);

      if (!response.success) {
        setError(response.error || 'Failed to get result');
        return;
      }

      setResult(response.data || null);
    } catch (err) {
      setError('Connection error');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return 'badge-success';
      case 'pending':
        return 'badge-warning';
      case 'failed':
        return 'badge-error';
      case 'expired':
        return 'badge-info';
      default:
        return '';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'pending':
        return 'Pending';
      case 'failed':
        return 'Failed';
      case 'expired':
        return 'Expired';
      default:
        return status;
    }
  };

  return (
    <Layout role="verifier">
      <div className="page-header">
        <h1 className="page-title">Verification Results</h1>
        <p className="page-subtitle">View verification request results</p>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <h3 className="card-title">Check Result</h3>
        </div>

        <div className="form-group">
          <label className="form-label">Session ID</label>
          <input
            type="text"
            className="form-input"
            placeholder="Session ID from verification request"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
          />
        </div>

        <button
          className="btn btn-verifier"
          onClick={checkResult}
          disabled={isLoading}
        >
          {isLoading ? 'Checking...' : '🔍 Check Result'}
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      {result && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Verification Result</h3>
            <span className={`badge ${getStatusBadge(result.status)}`}>
              {getStatusText(result.status)}
            </span>
          </div>

          {result.status === 'pending' && (
            <div className="alert alert-warning">
              ⏳ Holder has not submitted credentials yet. Please wait or check again later.
            </div>
          )}

          {result.status === 'expired' && (
            <div className="alert alert-info">
              ⏰ This verification request has expired. Create a new request.
            </div>
          )}

          {result.status === 'failed' && (
            <div className="alert alert-error">
              ❌ Verification failed: {result.error || 'Unknown error'}
            </div>
          )}

          {result.status === 'completed' && result.result && (
            <>
              <div className={`alert ${result.result.verified ? 'alert-success' : 'alert-error'}`}>
                {result.result.verified
                  ? '✅ Credential verified!'
                  : '❌ Credential could not be verified'}
              </div>

              {result.result.holder && (
                <div className="form-group" style={{ marginTop: '1rem' }}>
                  <label className="form-label">Holder DID</label>
                  <div className="did-display">
                    <span className="did-text">{result.result.holder}</span>
                    <button
                      className="copy-btn"
                      onClick={() => {
                        navigator.clipboard.writeText(result.result!.holder!);
                        toast.success('DID copied!');
                      }}
                    >
                      📋
                    </button>
                  </div>
                </div>
              )}

              {result.result.credentials && result.result.credentials.length > 0 && (
                <div style={{ marginTop: '1rem' }}>
                  <label className="form-label">Presented Credentials ({result.result.credentials.length})</label>
                  {result.result.credentials.map((cred, index) => (
                    <details key={index} style={{ marginTop: '0.5rem' }}>
                      <summary style={{ cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
                        Credential #{index + 1}
                      </summary>
                      <pre style={{
                        background: 'var(--color-bg-tertiary)',
                        padding: '1rem',
                        borderRadius: '0.5rem',
                        overflow: 'auto',
                        fontSize: '0.75rem',
                        marginTop: '0.5rem'
                      }}>
                        {JSON.stringify(cred, null, 2)}
                      </pre>
                    </details>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {!result && !error && !isLoading && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">✅</div>
            <p>Enter Session ID to check verification result</p>
          </div>
        </div>
      )}
    </Layout>
  );
}
