/**
 * Create Presentation Modal Component
 * Allows users to select which claims to disclose and generate a presentation
 */

import { useState } from 'react'
import type { SDJWTCredentialData } from '../types/sdjwt.types'
import { createPresentation, generateNonce } from '../services/sdjwt.service'

interface CreatePresentationModalProps {
  credential: SDJWTCredentialData
  onClose: () => void
}

export default function CreatePresentationModal({
  credential,
  onClose,
}: CreatePresentationModalProps) {
  const [selectedClaims, setSelectedClaims] = useState<string[]>(
    credential.disclosures.map((d) => d.claimName)
  )
  const [audience, setAudience] = useState('')
  const [nonce, setNonce] = useState('')
  const [useKeyBinding, setUseKeyBinding] = useState(false)
  const [presentation, setPresentation] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handleToggleClaim = (claimName: string) => {
    setSelectedClaims((prev) =>
      prev.includes(claimName)
        ? prev.filter((c) => c !== claimName)
        : [...prev, claimName]
    )
  }

  const handleSelectAll = () => {
    setSelectedClaims(credential.disclosures.map((d) => d.claimName))
  }

  const handleSelectNone = () => {
    setSelectedClaims([])
  }

  const handleGenerateNonce = () => {
    setNonce(generateNonce())
  }

  const handleCreatePresentation = async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await createPresentation(credential.combined, selectedClaims, {
        audience: useKeyBinding && audience ? audience : undefined,
        nonce: useKeyBinding && nonce ? nonce : undefined,
      })

      setPresentation(result.combined)
    } catch (err) {
      setError((err as Error).message || 'Failed to create presentation')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    if (presentation) {
      await navigator.clipboard.writeText(presentation)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1001,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ maxWidth: '600px', width: '90%', maxHeight: '85vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-header">
          <h3>Create Presentation</h3>
          <button className="btn btn-secondary" onClick={onClose}>
            &times;
          </button>
        </div>

        {!presentation ? (
          <>
            {/* Credential Info */}
            <div
              style={{
                background: 'var(--bg)',
                padding: '1rem',
                borderRadius: '0.5rem',
                marginBottom: '1rem',
              }}
            >
              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Credential</div>
              <div style={{ fontWeight: 'bold' }}>{credential.type}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Issuer: {credential.issuer.substring(0, 30)}...
              </div>
            </div>

            {/* Claim Selection */}
            <div style={{ marginBottom: '1rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.5rem',
                }}
              >
                <label style={{ color: 'var(--text-muted)' }}>
                  Select Claims to Disclose
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                    onClick={handleSelectAll}
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                    onClick={handleSelectNone}
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                }}
              >
                {credential.disclosures.map((disclosure) => (
                  <label
                    key={disclosure.claimName}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.75rem',
                      padding: '0.75rem',
                      background: selectedClaims.includes(disclosure.claimName)
                        ? '#22c55e15'
                        : 'var(--bg)',
                      borderRadius: '0.5rem',
                      cursor: 'pointer',
                      border: selectedClaims.includes(disclosure.claimName)
                        ? '1px solid #22c55e40'
                        : '1px solid transparent',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedClaims.includes(disclosure.claimName)}
                      onChange={() => handleToggleClaim(disclosure.claimName)}
                      style={{ marginTop: '0.25rem' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                        {disclosure.claimName}
                      </div>
                      <div
                        style={{
                          fontSize: '0.875rem',
                          color: 'var(--text-muted)',
                          fontFamily: 'monospace',
                        }}
                      >
                        {typeof disclosure.claimValue === 'object'
                          ? JSON.stringify(disclosure.claimValue)
                          : String(disclosure.claimValue)}
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              {credential.disclosures.length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center' }}>
                  No selectable claims available
                </p>
              )}
            </div>

            {/* Key Binding Options */}
            <div style={{ marginBottom: '1rem' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                  marginBottom: '0.5rem',
                }}
              >
                <input
                  type="checkbox"
                  checked={useKeyBinding}
                  onChange={(e) => setUseKeyBinding(e.target.checked)}
                />
                <span>Include Key Binding JWT (for verifier authentication)</span>
              </label>

              {useKeyBinding && (
                <div
                  style={{
                    padding: '1rem',
                    background: 'var(--bg)',
                    borderRadius: '0.5rem',
                  }}
                >
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>
                      Audience (Verifier DID or URL)
                    </label>
                    <input
                      type="text"
                      className="input"
                      value={audience}
                      onChange={(e) => setAudience(e.target.value)}
                      placeholder="did:key:z... or https://verifier.example.com"
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>
                      Nonce
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        type="text"
                        className="input"
                        value={nonce}
                        onChange={(e) => setNonce(e.target.value)}
                        placeholder="Random nonce from verifier"
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={handleGenerateNonce}
                      >
                        Generate
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div
                style={{
                  background: '#ef444420',
                  color: '#ef4444',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  marginBottom: '1rem',
                }}
              >
                {error}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn btn-primary"
                onClick={handleCreatePresentation}
                disabled={loading || selectedClaims.length === 0}
                style={{ flex: 1 }}
              >
                {loading ? 'Creating...' : 'Create Presentation'}
              </button>
              <button className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Success State */}
            <div
              style={{
                background: '#22c55e15',
                border: '1px solid #22c55e40',
                padding: '1rem',
                borderRadius: '0.5rem',
                marginBottom: '1rem',
                textAlign: 'center',
              }}
            >
              <div style={{ color: '#22c55e', fontSize: '2rem', marginBottom: '0.5rem' }}>
                &#x2713;
              </div>
              <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                Presentation Created
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                {selectedClaims.length} claim{selectedClaims.length !== 1 ? 's' : ''} disclosed
              </div>
            </div>

            {/* Disclosed Claims Summary */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>
                Disclosed Claims
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {selectedClaims.map((claim) => (
                  <span
                    key={claim}
                    style={{
                      background: '#22c55e20',
                      color: '#22c55e',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '0.25rem',
                      fontSize: '0.75rem',
                    }}
                  >
                    {claim}
                  </span>
                ))}
              </div>
            </div>

            {/* Presentation Output */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: 'var(--text-muted)' }}>Presentation (SD-JWT)</label>
              <textarea
                className="input"
                value={presentation}
                readOnly
                rows={6}
                style={{ fontFamily: 'monospace', fontSize: '0.7rem' }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-primary" onClick={handleCopy} style={{ flex: 1 }}>
                {copied ? 'Copied!' : 'Copy Presentation'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setPresentation(null)}
              >
                Create Another
              </button>
              <button className="btn btn-secondary" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
