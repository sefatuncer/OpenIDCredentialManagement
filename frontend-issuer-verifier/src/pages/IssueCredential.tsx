import { useState } from 'react';
import { Layout } from '../components/Layout';
import { CredentialForm } from '../components/CredentialForm';
import { QRCode } from '../components/QRCode';
import { issuerApi } from '../services/api';
import { toast } from '../hooks/useToast';

type CredentialType = 'agent-identity' | 'delegation' | 'capability';

interface CredentialResult {
  credentialOfferId: string;
  credentialOfferUri: string;
}

export function IssueCredential() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<CredentialResult | null>(null);
  const [error, setError] = useState('');

  const handleSubmit = async (type: CredentialType, data: Record<string, unknown>) => {
    if (!data.holderDid) {
      toast.error('Holder DID is required');
      return;
    }

    setIsLoading(true);
    setError('');
    setResult(null);

    try {
      let response;

      switch (type) {
        case 'agent-identity':
          response = await issuerApi.issueAgentIdentity(data as Parameters<typeof issuerApi.issueAgentIdentity>[0]);
          break;
        case 'delegation':
          response = await issuerApi.issueDelegation(data as Parameters<typeof issuerApi.issueDelegation>[0]);
          break;
        case 'capability':
          response = await issuerApi.issueCapability(data as Parameters<typeof issuerApi.issueCapability>[0]);
          break;
      }

      if (!response.success || !response.data) {
        setError(response.error || 'Failed to create credential');
        return;
      }

      toast.success('Credential created successfully!');
      setResult({
        credentialOfferId: response.data.credentialOfferId,
        credentialOfferUri: response.data.credentialOfferUri,
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

  return (
    <Layout role="issuer">
      <div className="page-header">
        <h1 className="page-title">Issue Credential</h1>
        <p className="page-subtitle">Create new credential and deliver to holder</p>
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      <div className="card-grid">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Credential Details</h3>
          </div>
          <CredentialForm onSubmit={handleSubmit} isLoading={isLoading} />
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Credential Offer</h3>
          </div>

          {!result && !isLoading && (
            <div className="empty-state">
              <div className="empty-state-icon">🎫</div>
              <p>Create a credential</p>
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
                ✅ Credential offer created successfully!
              </div>

              <QRCode
                data={result.credentialOfferUri}
                label="Scan with Web Wallet"
              />

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
                      📋
                    </button>
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: '0.5rem' }}>
                  <label className="form-label">Offer URI</label>
                  <div className="did-display">
                    <span className="did-text" style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>
                      {result.credentialOfferUri.slice(0, 50)}...
                    </span>
                    <button
                      className="copy-btn"
                      onClick={() => {
                        navigator.clipboard.writeText(result.credentialOfferUri);
                        toast.success('Offer URI copied!');
                      }}
                    >
                      📋
                    </button>
                  </div>
                </div>
              </div>

              <button
                className="btn btn-secondary"
                onClick={resetForm}
                style={{ width: '100%', marginTop: '1rem' }}
              >
                Create New Credential
              </button>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
