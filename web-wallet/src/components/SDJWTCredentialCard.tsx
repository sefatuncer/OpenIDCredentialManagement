/**
 * SD-JWT Credential Card Component
 * Displays SD-JWT credentials with selective disclosure visualization
 */

import { useState } from 'react'
import type { SDJWTCredentialData } from '../types/sdjwt.types'
import { getSelectableDisclosures } from '../services/sdjwt.service'

interface SDJWTCredentialCardProps {
  credential: SDJWTCredentialData
  onClick?: () => void
  onCreatePresentation?: (credential: SDJWTCredentialData) => void
}

export default function SDJWTCredentialCard({
  credential,
  onClick,
  onCreatePresentation,
}: SDJWTCredentialCardProps) {
  const [showDetails, setShowDetails] = useState(false)

  const selectableDisclosures = getSelectableDisclosures(credential)
  const disclosedClaimNames = credential.disclosures.map((d) => d.claimName)

  // Count hidden claims (those in _sd but not disclosed)
  const hiddenClaimsCount = selectableDisclosures.length - disclosedClaimNames.length

  const handleClick = () => {
    if (onClick) {
      onClick()
    } else {
      setShowDetails(!showDetails)
    }
  }

  return (
    <div
      className="credential-card sdjwt-card"
      onClick={handleClick}
      style={{
        cursor: 'pointer',
        border: '2px solid var(--primary)',
        position: 'relative',
      }}
    >
      {/* SD-JWT Badge */}
      <div
        style={{
          position: 'absolute',
          top: '0.5rem',
          right: '0.5rem',
          background: 'var(--primary)',
          color: 'white',
          padding: '0.25rem 0.5rem',
          borderRadius: '0.25rem',
          fontSize: '0.7rem',
          fontWeight: 'bold',
        }}
      >
        SD-JWT
      </div>

      <div className="credential-type">{credential.type}</div>

      <div className="credential-subject">
        {(credential.subject as Record<string, unknown>).agentName as string ||
          (credential.subject as Record<string, unknown>).name as string ||
          'Credential'}
      </div>

      <div className="credential-details">
        <div className="credential-detail">
          <label>Issuer</label>
          <span>{credential.issuer.substring(0, 20)}...</span>
        </div>
        <div className="credential-detail">
          <label>Issued</label>
          <span>{new Date(credential.issuanceDate).toLocaleDateString()}</span>
        </div>
        {credential.expirationDate && (
          <div className="credential-detail">
            <label>Expires</label>
            <span>{new Date(credential.expirationDate).toLocaleDateString()}</span>
          </div>
        )}
      </div>

      {/* Disclosure Summary */}
      <div
        style={{
          marginTop: '1rem',
          padding: '0.75rem',
          background: 'var(--bg)',
          borderRadius: '0.5rem',
        }}
      >
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
          Selective Disclosure Claims
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {/* Disclosed claims - green badges */}
          {credential.disclosures.map((disclosure) => (
            <span
              key={disclosure.claimName}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                background: '#22c55e20',
                color: '#22c55e',
                padding: '0.25rem 0.5rem',
                borderRadius: '0.25rem',
                fontSize: '0.75rem',
              }}
            >
              <span style={{ fontSize: '0.6rem' }}>&#x2713;</span>
              {disclosure.claimName}
            </span>
          ))}

          {/* Hidden claims - gray/locked badges */}
          {hiddenClaimsCount > 0 && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                background: '#6b728020',
                color: '#6b7280',
                padding: '0.25rem 0.5rem',
                borderRadius: '0.25rem',
                fontSize: '0.75rem',
              }}
            >
              <span style={{ fontSize: '0.6rem' }}>&#x1F512;</span>
              {hiddenClaimsCount} hidden
            </span>
          )}
        </div>
      </div>

      {/* Create Presentation Button */}
      {onCreatePresentation && selectableDisclosures.length > 0 && (
        <button
          className="btn btn-primary"
          style={{ marginTop: '1rem', width: '100%' }}
          onClick={(e) => {
            e.stopPropagation()
            onCreatePresentation(credential)
          }}
        >
          Create Presentation
        </button>
      )}
    </div>
  )
}

/**
 * SD-JWT Credential Detail Modal Content
 */
interface SDJWTCredentialDetailProps {
  credential: SDJWTCredentialData
  onClose: () => void
  onDelete?: (id: string) => void
  onCreatePresentation?: (credential: SDJWTCredentialData) => void
}

export function SDJWTCredentialDetail({
  credential,
  onClose,
  onDelete,
  onCreatePresentation,
}: SDJWTCredentialDetailProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ maxWidth: '700px', width: '90%', maxHeight: '85vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h3>{credential.type}</h3>
            <span
              style={{
                background: 'var(--primary)',
                color: 'white',
                padding: '0.2rem 0.5rem',
                borderRadius: '0.25rem',
                fontSize: '0.7rem',
              }}
            >
              SD-JWT
            </span>
          </div>
          {onDelete && (
            <button className="btn btn-danger" onClick={() => onDelete(credential.id)}>
              Delete
            </button>
          )}
        </div>

        {/* Basic Info */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ color: 'var(--text-muted)' }}>Issuer</label>
          <p style={{ fontFamily: 'monospace', fontSize: '0.875rem', wordBreak: 'break-all' }}>
            {credential.issuer}
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label style={{ color: 'var(--text-muted)' }}>Issuance Date</label>
            <p>{new Date(credential.issuanceDate).toLocaleString()}</p>
          </div>
          {credential.expirationDate && (
            <div>
              <label style={{ color: 'var(--text-muted)' }}>Expiration Date</label>
              <p>{new Date(credential.expirationDate).toLocaleString()}</p>
            </div>
          )}
        </div>

        {/* Disclosed Claims */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>
            Disclosed Claims ({credential.disclosures.length})
          </label>
          <div
            style={{
              background: 'var(--bg)',
              padding: '1rem',
              borderRadius: '0.5rem',
            }}
          >
            {credential.disclosures.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                No claims currently disclosed
              </p>
            ) : (
              credential.disclosures.map((disclosure) => (
                <div
                  key={disclosure.claimName}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.5rem',
                    marginBottom: '0.5rem',
                    padding: '0.5rem',
                    background: '#22c55e10',
                    borderRadius: '0.25rem',
                    borderLeft: '3px solid #22c55e',
                  }}
                >
                  <span style={{ color: '#22c55e', fontWeight: 'bold', minWidth: '120px' }}>
                    {disclosure.claimName}:
                  </span>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                    {typeof disclosure.claimValue === 'object'
                      ? JSON.stringify(disclosure.claimValue)
                      : String(disclosure.claimValue)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Plain Claims (non-selective) */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>
            Subject Data
          </label>
          <pre
            style={{
              background: 'var(--bg)',
              padding: '1rem',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              overflow: 'auto',
              maxHeight: '200px',
            }}
          >
            {JSON.stringify(credential.subject, null, 2)}
          </pre>
        </div>

        {/* Raw SD-JWT */}
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ color: 'var(--text-muted)' }}>SD-JWT (Combined)</label>
          <textarea
            className="input"
            value={credential.combined}
            readOnly
            rows={4}
            style={{ fontFamily: 'monospace', fontSize: '0.7rem' }}
          />
          <button
            className="btn btn-secondary"
            style={{ marginTop: '0.5rem' }}
            onClick={() => handleCopy(credential.combined)}
          >
            {copied ? 'Copied!' : 'Copy SD-JWT'}
          </button>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          {onCreatePresentation && credential.disclosures.length > 0 && (
            <button
              className="btn btn-primary"
              onClick={() => onCreatePresentation(credential)}
            >
              Create Presentation
            </button>
          )}
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
