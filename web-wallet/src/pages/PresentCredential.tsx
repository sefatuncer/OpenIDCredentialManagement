import { useState } from 'react'
import QRScanner from '../components/QRScanner'
import { presentCredential } from '../api'

type FlowState = 'idle' | 'confirm' | 'submitting' | 'success' | 'error'

function parseVerificationUri(uri: string): { valid: boolean; clientId?: string; requestUri?: string } {
  try {
    if (!uri.startsWith('openid4vp://')) {
      return { valid: false }
    }
    const url = new URL(uri)
    const clientId = url.searchParams.get('client_id')
    const requestUri = url.searchParams.get('request_uri')
    if (!clientId || !requestUri) {
      return { valid: false }
    }
    return { valid: true, clientId, requestUri }
  } catch {
    return { valid: false }
  }
}

export default function PresentCredential() {
  const [state, setState] = useState<FlowState>('idle')
  const [scannedUri, setScannedUri] = useState('')
  const [manualUri, setManualUri] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)

  const handleScan = (data: string) => {
    const parsed = parseVerificationUri(data)
    if (parsed.valid) {
      setScannedUri(data)
      setError(null)
      setState('confirm')
    } else {
      setError('Invalid QR code. Expected an openid4vp:// URI with client_id and request_uri parameters.')
    }
  }

  const handleManualSubmit = () => {
    const uri = manualUri.trim()
    if (!uri) return

    const parsed = parseVerificationUri(uri)
    if (parsed.valid) {
      setScannedUri(uri)
      setError(null)
      setState('confirm')
    } else {
      setError('Invalid URI. Expected format: openid4vp://?client_id=...&request_uri=...')
    }
  }

  const handlePresent = async () => {
    setState('submitting')
    setError(null)

    try {
      const result = await presentCredential(scannedUri)
      if (result.presentationSubmitted) {
        setState('success')
      } else {
        setError('No matching credentials found in your wallet. Make sure you have the required credential.')
        setState('error')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Presentation failed')
      setState('error')
    }
  }

  const handleReset = () => {
    setState('idle')
    setScannedUri('')
    setManualUri('')
    setError(null)
    setScanError(null)
  }

  const parsed = scannedUri ? parseVerificationUri(scannedUri) : null

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem' }}>Present Credential</h2>

      {state === 'idle' && (
        <div className="grid">
          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>Scan QR Code</h3>
            <p style={{ marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Scan the verification QR code from the verifier to present your credentials.
            </p>

            {scanError && (
              <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
                Camera error: {scanError}
              </div>
            )}

            <QRScanner
              onScan={handleScan}
              onError={(msg) => setScanError(msg)}
            />
          </div>

          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>Or Paste URI</h3>
            <p style={{ marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              If you can't scan the QR code, paste the verification URI manually.
            </p>

            <div className="form-group">
              <label>Verification Request URI</label>
              <textarea
                className="input"
                rows={4}
                value={manualUri}
                onChange={(e) => setManualUri(e.target.value)}
                placeholder="openid4vp://?client_id=...&request_uri=..."
                style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
              />
            </div>

            {error && (
              <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
                {error}
              </div>
            )}

            <button
              className="btn btn-primary"
              onClick={handleManualSubmit}
              disabled={!manualUri.trim()}
              style={{ width: '100%' }}
            >
              Use This URI
            </button>
          </div>
        </div>
      )}

      {state === 'confirm' && parsed && (
        <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h3 style={{ marginBottom: '1rem' }}>Confirm Presentation</h3>

          <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
            A verifier is requesting your credentials. Review the details below and confirm to present.
          </div>

          <div className="form-group">
            <label style={{ color: 'var(--text-muted)' }}>Verifier DID</label>
            <p style={{ fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}>
              {parsed.clientId}
            </p>
          </div>

          <div className="form-group">
            <label style={{ color: 'var(--text-muted)' }}>Request URI</label>
            <p style={{ fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}>
              {parsed.requestUri}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
            <button
              className="btn btn-primary"
              onClick={handlePresent}
              style={{ flex: 1 }}
            >
              Present Credentials
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleReset}
              style={{ flex: 1 }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {state === 'submitting' && (
        <div className="card" style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
          <div className="loading">
            <div className="spinner"></div>
          </div>
          <p style={{ marginTop: '1rem' }}>Submitting presentation...</p>
        </div>
      )}

      {state === 'success' && (
        <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
            Credential presentation submitted successfully!
          </div>
          <p style={{ marginBottom: '1.5rem', color: 'var(--text-muted)' }}>
            Your credentials have been presented to the verifier. The verification result will be available on the verifier's dashboard.
          </p>
          <button
            className="btn btn-secondary"
            onClick={handleReset}
            style={{ width: '100%' }}
          >
            Present Another
          </button>
        </div>
      )}

      {state === 'error' && (
        <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
            {error || 'An error occurred'}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn-primary"
              onClick={handlePresent}
              style={{ flex: 1 }}
            >
              Retry
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleReset}
              style={{ flex: 1 }}
            >
              Start Over
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
