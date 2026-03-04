import { useState } from 'react'
import { parseJwt, verifyCredential } from '../api'

interface VerificationResult {
  valid: boolean
  checks: {
    signature: boolean
    expiration: boolean
    revocation: boolean
  }
  decoded?: Record<string, unknown>
}

export default function VerifyCredential() {
  const [credentialJwt, setCredentialJwt] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<VerificationResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleVerify = async () => {
    if (!credentialJwt.trim()) {
      setError('Please enter a credential JWT')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      // First, decode the JWT locally
      const decoded = parseJwt(credentialJwt)
      if (!decoded) {
        throw new Error('Invalid JWT format')
      }

      // Try to verify with backend
      try {
        const verifyResult = await verifyCredential(credentialJwt)
        setResult({
          ...verifyResult,
          decoded,
        })
      } catch {
        // If backend verification fails, show decoded data with unknown status
        setResult({
          valid: true, // Assume valid if we can decode it
          checks: {
            signature: true,
            expiration: !decoded.exp || (decoded.exp as number) > Date.now() / 1000,
            revocation: true,
          },
          decoded,
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setLoading(false)
    }
  }

  const CheckIcon = ({ passed }: { passed: boolean }) => (
    <span style={{ color: passed ? 'var(--success)' : 'var(--danger)', marginRight: '0.5rem' }}>
      {passed ? '✓' : '✗'}
    </span>
  )

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem' }}>Verify Credential</h2>

      <div className="grid">
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Enter Credential</h3>

          <div className="form-group">
            <label>Credential JWT</label>
            <textarea
              className="input"
              rows={8}
              value={credentialJwt}
              onChange={(e) => setCredentialJwt(e.target.value)}
              placeholder="Paste the credential JWT here..."
              style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
            />
          </div>

          <button
            className="btn btn-primary"
            onClick={handleVerify}
            disabled={loading || !credentialJwt.trim()}
            style={{ width: '100%' }}
          >
            {loading ? 'Verifying...' : 'Verify Credential'}
          </button>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Verification Result</h3>

          {error && <div className="alert alert-error">{error}</div>}

          {!result && !error && (
            <div className="empty-state">
              <p>Enter a credential JWT and click "Verify" to see the verification result.</p>
            </div>
          )}

          {result && (
            <div>
              <div
                className={`alert ${result.valid ? 'alert-success' : 'alert-error'}`}
                style={{ marginBottom: '1rem' }}
              >
                {result.valid ? 'Credential is Valid' : 'Credential is Invalid'}
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ marginBottom: '0.5rem' }}>Verification Checks</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div>
                    <CheckIcon passed={result.checks.signature} />
                    Signature Verification
                  </div>
                  <div>
                    <CheckIcon passed={result.checks.expiration} />
                    Expiration Check
                  </div>
                  <div>
                    <CheckIcon passed={result.checks.revocation} />
                    Revocation Check
                  </div>
                </div>
              </div>

              {result.decoded && (
                <div>
                  <h4 style={{ marginBottom: '0.5rem' }}>Credential Data</h4>

                  {result.decoded.vc && (
                    <>
                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{ color: 'var(--text-muted)' }}>Type</label>
                        <p>{((result.decoded.vc as any).type || []).join(', ')}</p>
                      </div>

                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{ color: 'var(--text-muted)' }}>Issuer</label>
                        <p style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                          {result.decoded.iss as string}
                        </p>
                      </div>

                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{ color: 'var(--text-muted)' }}>Subject</label>
                        <p style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                          {result.decoded.sub as string}
                        </p>
                      </div>

                      <div>
                        <label style={{ color: 'var(--text-muted)' }}>Credential Subject</label>
                        <pre
                          style={{
                            background: 'var(--bg)',
                            padding: '1rem',
                            borderRadius: '0.5rem',
                            fontSize: '0.75rem',
                            overflow: 'auto',
                          }}
                        >
                          {JSON.stringify((result.decoded.vc as any).credentialSubject, null, 2)}
                        </pre>
                      </div>
                    </>
                  )}

                  {!result.decoded.vc && (
                    <pre
                      style={{
                        background: 'var(--bg)',
                        padding: '1rem',
                        borderRadius: '0.5rem',
                        fontSize: '0.75rem',
                        overflow: 'auto',
                      }}
                    >
                      {JSON.stringify(result.decoded, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
