import { useState } from 'react';
import { Layout } from '../components/Layout';
import { VerificationForm } from '../components/VerificationForm';
import { QRCode } from '../components/QRCode';
import { verifierApi } from '../services/api';
import { toast } from '../hooks/useToast';

type VerificationType = 'agent-identity' | 'delegation' | 'combined';

interface VerificationResult {
  sessionId: string;
  requestUri: string;
  qrData: string;
}

export function VerifyRequest() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState('');

  const handleSubmit = async (type: VerificationType, data: Record<string, unknown>) => {
    setIsLoading(true);
    setError('');
    setResult(null);

    try {
      let response;

      switch (type) {
        case 'agent-identity':
          response = await verifierApi.verifyAgentIdentity(data as Parameters<typeof verifierApi.verifyAgentIdentity>[0]);
          break;
        case 'delegation':
          response = await verifierApi.verifyDelegation(data as Parameters<typeof verifierApi.verifyDelegation>[0]);
          break;
        case 'combined':
          response = await verifierApi.verifyCombined(data as Parameters<typeof verifierApi.verifyCombined>[0]);
          break;
      }

      if (!response.success || !response.data) {
        setError(response.error || 'Failed to create verification request');
        return;
      }

      toast.success('Verification request created!');
      setResult({
        sessionId: response.data.sessionId,
        requestUri: response.data.requestUri,
        qrData: response.data.qrData,
      });
    } catch (err) {
      setError('Connection error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setResult(null);
    setError('');
  };

  const copySessionId = () => {
    if (result?.sessionId) {
      navigator.clipboard.writeText(result.sessionId);
      toast.success('Session ID copied!');
    }
  };

  return (
    <Layout role="verifier">
      <div className="page-header">
        <h1 className="page-title">Verification Request</h1>
        <p className="page-subtitle">Create credential verification request</p>
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      <div className="card-grid">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Request Details</h3>
          </div>
          <VerificationForm onSubmit={handleSubmit} isLoading={isLoading} />
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Verification QR Code</h3>
          </div>

          {!result && !isLoading && (
            <div className="empty-state">
              <div className="empty-state-icon">🔍</div>
              <p>Create a verification request</p>
              <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                QR code will appear here
              </p>
            </div>
          )}

          {isLoading && (
            <div className="loading">
              <div className="spinner"></div>
            </div>
          )}

          {result && (
            <>
              <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
                ✅ Verification request created!
              </div>

              <QRCode
                data={result.qrData}
                label="Scan with Web Wallet"
              />

              <div style={{ marginTop: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Session ID</label>
                  <div className="did-display">
                    <span className="did-text">{result.sessionId}</span>
                    <button className="copy-btn" onClick={copySessionId}>
                      📋 Copy
                    </button>
                  </div>
                  <div className="form-helper">
                    Use this ID to check results on /verifier/results page
                  </div>
                </div>
              </div>

              <button
                className="btn btn-secondary"
                onClick={resetForm}
                style={{ width: '100%', marginTop: '1rem' }}
              >
                Create New Request
              </button>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
