import { useState, useEffect, useCallback } from 'react'
import QRScanner from '../components/QRScanner'
import { presentCredential, getHolderCredentialsRaw } from '../api'
import {
  parseVerificationUri,
  fetchAuthorizationRequest,
  matchCredentials,
  createVpToken,
  buildPresentationSubmission,
  submitPresentation,
} from '../services/vp.service'
import type { AuthorizationRequest, WalletCredential } from '../services/vp.service'
import {
  getSelectableDisclosures,
  buildSDJWTPresentation,
} from '../services/sdjwt-presentation.service'
import type { SelectableDisclosure } from '../services/sdjwt-presentation.service'

type FlowState =
  | 'idle'
  | 'confirm'
  | 'loading-request'
  | 'select-credential'
  | 'select-disclosures'
  | 'submitting'
  | 'success'
  | 'error'

type FlowMode = 'backend' | 'client'

export default function PresentCredential() {
  const [state, setState] = useState<FlowState>('idle')
  const [flowMode, setFlowMode] = useState<FlowMode>('client')
  const [scannedUri, setScannedUri] = useState('')
  const [manualUri, setManualUri] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)

  // Client-side flow state
  const [authRequest, setAuthRequest] = useState<AuthorizationRequest | null>(null)
  const [walletCredentials, setWalletCredentials] = useState<WalletCredential[]>([])
  const [matchedCredentials, setMatchedCredentials] = useState<{ descriptorId: string; credential: WalletCredential }[]>([])
  const [selectedCredentialIndex, setSelectedCredentialIndex] = useState(0)
  const [disclosures, setDisclosures] = useState<SelectableDisclosure[]>([])

  const loadCredentials = useCallback(async (): Promise<WalletCredential[]> => {
    try {
      const creds = await getHolderCredentialsRaw()
      const mapped = creds.map(c => ({
        id: c.id,
        jwt: c.jwt,
        type: c.type,
        combined: c.combined,
        isSDJWT: c.isSDJWT,
        credentialSubject: c.credentialSubject,
      }))
      setWalletCredentials(mapped)
      return mapped
    } catch {
      setWalletCredentials([])
      return []
    }
  }, [])

  // Pre-load credentials when client mode is active
  useEffect(() => {
    if (flowMode === 'client') {
      loadCredentials()
    }
  }, [flowMode, loadCredentials])

  const handleScan = (data: string) => {
    const parsed = parseVerificationUri(data)
    if (parsed.valid) {
      setScannedUri(data)
      setError(null)
      if (flowMode === 'backend') {
        setState('confirm')
      } else {
        handleClientFlowStart(data)
      }
    } else {
      setError('Invalid QR code. Expected an openid4vp:// URI.')
    }
  }

  const handleManualSubmit = () => {
    const uri = manualUri.trim()
    if (!uri) return

    const parsed = parseVerificationUri(uri)
    if (parsed.valid) {
      setScannedUri(uri)
      setError(null)
      if (flowMode === 'backend') {
        setState('confirm')
      } else {
        handleClientFlowStart(uri)
      }
    } else {
      setError('Invalid URI. Expected format: openid4vp://?client_id=...&request_uri=...')
    }
  }

  const handleClientFlowStart = async (uri: string) => {
    setState('loading-request')
    setError(null)

    try {
      const parsed = parseVerificationUri(uri)
      if (!parsed.valid) throw new Error('Invalid URI')

      let request: AuthorizationRequest

      if (parsed.inlineParams) {
        request = {
          ...parsed.inlineParams,
          clientId: parsed.clientId!,
        }
      } else {
        request = await fetchAuthorizationRequest(parsed.requestUri!, parsed.clientId!)
      }

      setAuthRequest(request)

      // Fresh-load credentials to avoid stale data
      const freshCredentials = await loadCredentials()
      const matches = matchCredentials(request.presentationDefinition, freshCredentials)

      if (matches.length === 0) {
        setError('No matching credentials found in your wallet for this verification request.')
        setState('error')
        return
      }

      setMatchedCredentials(matches)
      setSelectedCredentialIndex(0)
      setState('select-credential')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process verification request')
      setState('error')
    }
  }

  const handleCredentialSelected = () => {
    const match = matchedCredentials[selectedCredentialIndex]
    if (!match) return

    // If SD-JWT, show disclosure selection
    if (match.credential.isSDJWT && match.credential.combined) {
      const selectableDisclosures = getSelectableDisclosures(match.credential.combined)
      setDisclosures(selectableDisclosures)
      setState('select-disclosures')
    } else {
      handleClientSubmit()
    }
  }

  const toggleDisclosure = (index: number) => {
    setDisclosures(prev => prev.map((d, i) =>
      i === index ? { ...d, selected: !d.selected } : d
    ))
  }

  const handleClientSubmit = async () => {
    if (!authRequest) return
    setState('submitting')
    setError(null)

    try {
      // Build credential JWTs for VP
      const credentialJwts = matchedCredentials.map(match => {
        if (match.credential.isSDJWT && match.credential.combined) {
          const selectedClaims = disclosures
            .filter(d => d.selected)
            .map(d => d.claimName)
          return buildSDJWTPresentation(match.credential.combined, selectedClaims)
        }
        return match.credential.jwt
      })

      const vpToken = await createVpToken(
        credentialJwts,
        authRequest.nonce,
        authRequest.clientId
      )

      const submission = buildPresentationSubmission(
        authRequest.presentationDefinition.id,
        matchedCredentials
      )

      const result = await submitPresentation(
        authRequest.responseUri,
        vpToken,
        submission,
        authRequest.state
      )

      if (result.success) {
        setState('success')
      } else {
        setError(result.error || 'Submission failed')
        setState('error')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Presentation failed')
      setState('error')
    }
  }

  // Backend-driven flow (original)
  const handleBackendPresent = async () => {
    setState('submitting')
    setError(null)

    try {
      const result = await presentCredential(scannedUri)
      if (result.presentationSubmitted) {
        setState('success')
      } else {
        setError('No matching credentials found.')
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
    setAuthRequest(null)
    setMatchedCredentials([])
    setDisclosures([])
  }

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem' }}>Present Credential</h2>

      {state === 'idle' && (
        <>
          {/* Flow mode toggle */}
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, marginRight: '0.5rem' }}>Mode:</span>
              <button
                className={`btn ${flowMode === 'client' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFlowMode('client')}
                style={{ fontSize: '0.8rem', padding: '0.3rem 0.8rem' }}
              >
                Client-Side
              </button>
              <button
                className={`btn ${flowMode === 'backend' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFlowMode('backend')}
                style={{ fontSize: '0.8rem', padding: '0.3rem 0.8rem' }}
              >
                Backend
              </button>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                {flowMode === 'client'
                  ? 'VP created locally in wallet'
                  : 'VP created by backend holder agent'}
              </span>
            </div>
          </div>

          <div className="grid">
            <div className="card">
              <h3 style={{ marginBottom: '1rem' }}>Scan QR Code</h3>
              <p style={{ marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                Scan the verification QR code from the verifier.
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
                Paste the verification URI manually.
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
        </>
      )}

      {/* Backend flow: confirm */}
      {state === 'confirm' && flowMode === 'backend' && (
        <BackendConfirm
          scannedUri={scannedUri}
          onPresent={handleBackendPresent}
          onCancel={handleReset}
        />
      )}

      {/* Client flow: loading */}
      {state === 'loading-request' && (
        <div className="card" style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
          <div className="loading"><div className="spinner"></div></div>
          <p style={{ marginTop: '1rem' }}>Fetching verification request...</p>
        </div>
      )}

      {/* Client flow: credential selection */}
      {state === 'select-credential' && authRequest && (
        <div className="card" style={{ maxWidth: '700px', margin: '0 auto' }}>
          <h3 style={{ marginBottom: '1rem' }}>Select Credentials</h3>

          <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
            <strong>{authRequest.presentationDefinition.name || 'Verification Request'}</strong>
            {authRequest.presentationDefinition.purpose && (
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>
                {authRequest.presentationDefinition.purpose}
              </p>
            )}
          </div>

          <div className="form-group">
            <label style={{ color: 'var(--text-muted)' }}>Verifier</label>
            <p style={{ fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}>
              {authRequest.clientId}
            </p>
          </div>

          <div className="form-group">
            <label>Matching Credentials ({matchedCredentials.length})</label>
            {matchedCredentials.map((match, idx) => (
              <div
                key={match.credential.id}
                onClick={() => setSelectedCredentialIndex(idx)}
                style={{
                  padding: '0.75rem',
                  border: `2px solid ${idx === selectedCredentialIndex ? 'var(--primary)' : 'var(--border)'}`,
                  borderRadius: '8px',
                  marginBottom: '0.5rem',
                  cursor: 'pointer',
                  background: idx === selectedCredentialIndex ? 'var(--bg-secondary)' : 'transparent',
                }}
              >
                <div style={{ fontWeight: 600 }}>{match.credential.type}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {match.credential.isSDJWT ? 'SD-JWT VC' : 'JWT VC'}
                  {' — '}
                  Matches: {match.descriptorId}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  {Object.entries(match.credential.credentialSubject)
                    .slice(0, 3)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(', ')}
                  {Object.keys(match.credential.credentialSubject).length > 3 && '...'}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button className="btn btn-primary" onClick={handleCredentialSelected} style={{ flex: 1 }}>
              {matchedCredentials[selectedCredentialIndex]?.credential.isSDJWT
                ? 'Select Disclosures'
                : 'Present'}
            </button>
            <button className="btn btn-secondary" onClick={handleReset} style={{ flex: 1 }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Client flow: SD-JWT disclosure selection */}
      {state === 'select-disclosures' && (
        <div className="card" style={{ maxWidth: '700px', margin: '0 auto' }}>
          <h3 style={{ marginBottom: '1rem' }}>Selective Disclosure</h3>

          <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
            Choose which claims to reveal to the verifier. Unselected claims will remain hidden.
          </div>

          {disclosures.map((d, idx) => (
            <div
              key={d.claimName}
              onClick={() => toggleDisclosure(idx)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0.6rem 0.75rem',
                border: `1px solid var(--border)`,
                borderRadius: '6px',
                marginBottom: '0.4rem',
                cursor: 'pointer',
                background: d.selected ? 'var(--bg-secondary)' : 'transparent',
              }}
            >
              <input
                type="checkbox"
                checked={d.selected}
                onChange={() => toggleDisclosure(idx)}
                style={{ marginRight: '0.75rem' }}
              />
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 600 }}>{d.claimName}</span>
                <span style={{ marginLeft: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  {typeof d.claimValue === 'string'
                    ? d.claimValue.length > 50 ? d.claimValue.slice(0, 50) + '...' : d.claimValue
                    : JSON.stringify(d.claimValue)}
                </span>
              </div>
              <span style={{
                fontSize: '0.7rem',
                padding: '0.15rem 0.4rem',
                borderRadius: '4px',
                background: d.selected ? 'var(--success-bg, #d4edda)' : 'var(--muted-bg, #e9ecef)',
                color: d.selected ? 'var(--success, #155724)' : 'var(--text-muted)',
              }}>
                {d.selected ? 'Visible' : 'Hidden'}
              </span>
            </div>
          ))}

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
            <button
              className="btn btn-primary"
              onClick={handleClientSubmit}
              disabled={disclosures.filter(d => d.selected).length === 0}
              style={{ flex: 1 }}
            >
              Present ({disclosures.filter(d => d.selected).length} claims)
            </button>
            <button className="btn btn-secondary" onClick={() => setState('select-credential')} style={{ flex: 1 }}>
              Back
            </button>
          </div>
        </div>
      )}

      {/* Submitting */}
      {state === 'submitting' && (
        <div className="card" style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
          <div className="loading"><div className="spinner"></div></div>
          <p style={{ marginTop: '1rem' }}>Submitting presentation...</p>
        </div>
      )}

      {/* Success */}
      {state === 'success' && (
        <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
            Credential presentation submitted successfully!
          </div>
          <p style={{ marginBottom: '1.5rem', color: 'var(--text-muted)' }}>
            Your credentials have been presented to the verifier.
            {flowMode === 'client' && ' VP was signed locally in your wallet.'}
          </p>
          <button className="btn btn-secondary" onClick={handleReset} style={{ width: '100%' }}>
            Present Another
          </button>
        </div>
      )}

      {/* Error */}
      {state === 'error' && (
        <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
            {error || 'An error occurred'}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-primary" onClick={handleReset} style={{ flex: 1 }}>
              Start Over
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function BackendConfirm({
  scannedUri,
  onPresent,
  onCancel,
}: {
  scannedUri: string
  onPresent: () => void
  onCancel: () => void
}) {
  const parsed = parseVerificationUri(scannedUri)
  if (!parsed.valid) return null

  return (
    <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
      <h3 style={{ marginBottom: '1rem' }}>Confirm Presentation</h3>

      <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
        A verifier is requesting your credentials. The backend will handle VP creation.
      </div>

      <div className="form-group">
        <label style={{ color: 'var(--text-muted)' }}>Verifier DID</label>
        <p style={{ fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}>
          {parsed.clientId}
        </p>
      </div>

      {parsed.requestUri && (
        <div className="form-group">
          <label style={{ color: 'var(--text-muted)' }}>Request URI</label>
          <p style={{ fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}>
            {parsed.requestUri}
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
        <button className="btn btn-primary" onClick={onPresent} style={{ flex: 1 }}>
          Present Credentials
        </button>
        <button className="btn btn-secondary" onClick={onCancel} style={{ flex: 1 }}>
          Cancel
        </button>
      </div>
    </div>
  )
}
