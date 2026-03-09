import { useState, useEffect } from 'react'
import SDJWTCredentialCard, { SDJWTCredentialDetail } from '../components/SDJWTCredentialCard'
import CreatePresentationModal from '../components/CreatePresentationModal'
import { isSDJWT, sdJWTToCredentialData } from '../services/sdjwt.service'
import type { SDJWTCredentialData } from '../types/sdjwt.types'

interface StoredCredential {
  id: string
  jwt: string
  type: string
  issuer: string
  issuanceDate: string
  subject: Record<string, unknown>
  // SD-JWT fields (optional)
  isSDJWT?: boolean
  combined?: string
}

type SelectedCredential = StoredCredential | SDJWTCredentialData | null

// Simple credential storage encryption using Web Crypto API
// Note: For production, use proper key management and consider IndexedDB with encryption
const STORAGE_KEY = 'ai-agent-credentials-v2'

async function getEncryptionKey(): Promise<CryptoKey> {
  const storedKey = sessionStorage.getItem('credential-encryption-key')
  if (storedKey) {
    const keyData = JSON.parse(storedKey)
    return await crypto.subtle.importKey(
      'jwk',
      keyData,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    )
  }

  // Generate new key for this session
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )

  // Store key in sessionStorage (cleared when browser closes)
  const exportedKey = await crypto.subtle.exportKey('jwk', key)
  sessionStorage.setItem('credential-encryption-key', JSON.stringify(exportedKey))

  return key
}

async function encryptCredentials(credentials: StoredCredential[]): Promise<string> {
  const key = await getEncryptionKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = new TextEncoder().encode(JSON.stringify(credentials))

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  )

  // Combine IV and encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), iv.length)

  return btoa(String.fromCharCode(...combined))
}

async function decryptCredentials(encryptedData: string): Promise<StoredCredential[]> {
  try {
    const key = await getEncryptionKey()
    const combined = new Uint8Array(
      atob(encryptedData).split('').map(c => c.charCodeAt(0))
    )

    const iv = combined.slice(0, 12)
    const encrypted = combined.slice(12)

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    )

    return JSON.parse(new TextDecoder().decode(decrypted))
  } catch {
    // If decryption fails (new session, corrupted data), return empty
    return []
  }
}

// Migrate old unencrypted storage
async function migrateOldStorage(): Promise<StoredCredential[]> {
  const oldData = localStorage.getItem('ai-agent-credentials')
  if (oldData) {
    try {
      const credentials = JSON.parse(oldData)
      // Remove old unencrypted data
      localStorage.removeItem('ai-agent-credentials')
      return credentials
    } catch {
      localStorage.removeItem('ai-agent-credentials')
    }
  }
  return []
}

export default function Credentials() {
  const [credentials, setCredentials] = useState<StoredCredential[]>([])
  const [selectedCredential, setSelectedCredential] = useState<SelectedCredential>(null)
  const [loading, setLoading] = useState(true)
  const [presentationCredential, setPresentationCredential] = useState<SDJWTCredentialData | null>(null)

  useEffect(() => {
    // Load credentials from encrypted storage
    const loadCredentials = async () => {
      try {
        // First, try to migrate old unencrypted data
        const migratedCreds = await migrateOldStorage()
        if (migratedCreds.length > 0) {
          setCredentials(migratedCreds)
          // Save migrated credentials with encryption
          const encrypted = await encryptCredentials(migratedCreds)
          localStorage.setItem(STORAGE_KEY, encrypted)
          setLoading(false)
          return
        }

        // Load encrypted credentials
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) {
          const decrypted = await decryptCredentials(stored)
          setCredentials(decrypted)
        }
      } catch (error) {
        console.error('Failed to load credentials:', error)
      }
      setLoading(false)
    }

    loadCredentials()
  }, [])

  const addTestCredential = async () => {
    const testCredential: StoredCredential = {
      id: `cred-${Date.now()}`,
      jwt: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJ2YyI6eyJAY29udGV4dCI6WyJodHRwczovL3d3dy53My5vcmcvMjAxOC9jcmVkZW50aWFscy92MSJdLCJ0eXBlIjpbIlZlcmlmaWFibGVDcmVkZW50aWFsIiwiQUlBZ2VudElkZW50aXR5Q3JlZGVudGlhbCJdLCJjcmVkZW50aWFsU3ViamVjdCI6eyJhZ2VudE5hbWUiOiJDbGF1ZGUgQXNzaXN0YW50IiwiYWdlbnRWZXJzaW9uIjoiMy4wIiwiZGV2ZWxvcGVyIjoiQW50aHJvcGljIn19LCJpc3MiOiJkaWQ6a2V5OnoxMjMiLCJzdWIiOiJkaWQ6a2V5OnoxMjMiLCJpYXQiOjE3MDcyMjA4MDAsImV4cCI6MTczODc1NjgwMH0.test',
      type: 'AIAgentIdentityCredential',
      issuer: 'did:key:z123...',
      issuanceDate: new Date().toISOString(),
      subject: {
        agentName: 'Claude Assistant',
        agentVersion: '3.0',
        developer: 'Anthropic',
        capabilities: ['text-generation', 'code-assistance', 'reasoning'],
      },
    }

    const updated = [...credentials, testCredential]
    setCredentials(updated)
    // Store with encryption
    const encrypted = await encryptCredentials(updated)
    localStorage.setItem(STORAGE_KEY, encrypted)
  }

  const addTestSDJWTCredential = async () => {
    // SD-JWT test credential with selective disclosure claims
    // Format: jwt~disclosure1~disclosure2~...
    // Each disclosure is base64url encoded [salt, claimName, claimValue]
    const salt1 = btoa(Math.random().toString()).replace(/[+/=]/g, '').substring(0, 16)
    const salt2 = btoa(Math.random().toString()).replace(/[+/=]/g, '').substring(0, 16)
    const salt3 = btoa(Math.random().toString()).replace(/[+/=]/g, '').substring(0, 16)

    // Create disclosures
    const disclosure1 = btoa(JSON.stringify([salt1, 'capabilities', ['text-gen', 'code', 'reasoning']])).replace(/=/g, '')
    const disclosure2 = btoa(JSON.stringify([salt2, 'trustLevel', 'high'])).replace(/=/g, '')
    const disclosure3 = btoa(JSON.stringify([salt3, 'ownerName', 'Anthropic Inc.'])).replace(/=/g, '')

    // Simple test JWT with _sd array (mock - not cryptographically valid)
    const header = btoa(JSON.stringify({ alg: 'EdDSA', typ: 'vc+sd-jwt' })).replace(/=/g, '')
    const payload = btoa(JSON.stringify({
      iss: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      sub: 'did:key:z6MkjRagNiMu91DduvCvgEsqLZDVzrJzFrwahc4tXLt9DoHd',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400 * 365,
      vc: {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: ['VerifiableCredential', 'AIAgentIdentityCredential'],
        credentialSubject: {
          id: 'did:key:z6MkjRagNiMu91DduvCvgEsqLZDVzrJzFrwahc4tXLt9DoHd',
          agentName: 'Claude Assistant',
          agentVersion: '3.5',
          _sd: ['hash1', 'hash2', 'hash3']
        }
      },
      _sd_alg: 'sha-256'
    })).replace(/=/g, '')
    const signature = 'mock_signature_for_testing'

    const combined = `${header}.${payload}.${signature}~${disclosure1}~${disclosure2}~${disclosure3}`

    const testSDJWT: StoredCredential = {
      id: `sdjwt-${Date.now()}`,
      jwt: `${header}.${payload}.${signature}`,
      combined: combined,
      isSDJWT: true,
      type: 'AIAgentIdentityCredential',
      issuer: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      issuanceDate: new Date().toISOString(),
      subject: {
        agentName: 'Claude Assistant',
        agentVersion: '3.5',
        capabilities: ['text-gen', 'code', 'reasoning'],
        trustLevel: 'high',
        ownerName: 'Anthropic Inc.',
      },
    }

    const updated = [...credentials, testSDJWT]
    setCredentials(updated)
    const encrypted = await encryptCredentials(updated)
    localStorage.setItem(STORAGE_KEY, encrypted)
  }

  // Convert stored credential to SD-JWT credential data if applicable
  const getSDJWTCredentialData = (cred: StoredCredential): SDJWTCredentialData | null => {
    if (cred.isSDJWT && cred.combined) {
      return sdJWTToCredentialData(cred.id, cred.combined)
    }
    // Check if JWT itself is SD-JWT format
    if (isSDJWT(cred.jwt)) {
      return sdJWTToCredentialData(cred.id, cred.jwt)
    }
    return null
  }

  const handleCreatePresentation = (credential: SDJWTCredentialData) => {
    setSelectedCredential(null)
    setPresentationCredential(credential)
  }

  const deleteCredential = async (id: string) => {
    const updated = credentials.filter((c) => c.id !== id)
    setCredentials(updated)
    // Store with encryption
    const encrypted = await encryptCredentials(updated)
    localStorage.setItem(STORAGE_KEY, encrypted)
    if (selectedCredential?.id === id) {
      setSelectedCredential(null)
    }
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <span>Loading credentials...</span>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2>My Credentials</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={addTestCredential}>
            Add JWT Credential
          </button>
          <button className="btn btn-primary" onClick={addTestSDJWTCredential}>
            Add SD-JWT Credential
          </button>
        </div>
      </div>

      {credentials.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <h3>No Credentials Yet</h3>
            <p>Receive credentials by scanning a credential offer QR code or add a test credential.</p>
          </div>
        </div>
      ) : (
        <div className="grid">
          {credentials.map((credential) => {
            const sdjwtData = getSDJWTCredentialData(credential)

            if (sdjwtData) {
              // Render SD-JWT credential card
              return (
                <SDJWTCredentialCard
                  key={credential.id}
                  credential={sdjwtData}
                  onClick={() => setSelectedCredential(sdjwtData)}
                  onCreatePresentation={handleCreatePresentation}
                />
              )
            }

            // Render regular JWT credential card
            return (
              <div
                key={credential.id}
                className="credential-card"
                onClick={() => setSelectedCredential(credential)}
                style={{ cursor: 'pointer' }}
              >
                <div className="credential-type">{credential.type}</div>
                <div className="credential-subject">
                  {(credential.subject as Record<string, unknown>).agentName as string || 'AI Agent'}
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
                  {(credential.subject as Record<string, unknown>).agentVersion && (
                    <div className="credential-detail">
                      <label>Version</label>
                      <span>{(credential.subject as Record<string, unknown>).agentVersion as string}</span>
                    </div>
                  )}
                  {(credential.subject as Record<string, unknown>).developer && (
                    <div className="credential-detail">
                      <label>Developer</label>
                      <span>{(credential.subject as Record<string, unknown>).developer as string}</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* SD-JWT Credential Detail Modal */}
      {selectedCredential && 'isSDJWT' in selectedCredential && selectedCredential.isSDJWT && (
        <SDJWTCredentialDetail
          credential={selectedCredential as SDJWTCredentialData}
          onClose={() => setSelectedCredential(null)}
          onDelete={deleteCredential}
          onCreatePresentation={handleCreatePresentation}
        />
      )}

      {/* Regular JWT Credential Detail Modal */}
      {selectedCredential && !('isSDJWT' in selectedCredential && selectedCredential.isSDJWT) && (
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
          onClick={() => setSelectedCredential(null)}
        >
          <div
            className="card"
            style={{ maxWidth: '600px', width: '90%', maxHeight: '80vh', overflow: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-header">
              <h3>Credential Details</h3>
              <button
                className="btn btn-danger"
                onClick={() => deleteCredential((selectedCredential as StoredCredential).id)}
              >
                Delete
              </button>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: 'var(--text-muted)' }}>Type</label>
              <p>{(selectedCredential as StoredCredential).type}</p>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: 'var(--text-muted)' }}>Issuer</label>
              <p style={{ fontFamily: 'monospace', fontSize: '0.875rem', wordBreak: 'break-all' }}>
                {(selectedCredential as StoredCredential).issuer}
              </p>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: 'var(--text-muted)' }}>Issuance Date</label>
              <p>{new Date((selectedCredential as StoredCredential).issuanceDate).toLocaleString()}</p>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: 'var(--text-muted)' }}>Subject Data</label>
              <pre
                style={{
                  background: 'var(--bg)',
                  padding: '1rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  overflow: 'auto',
                }}
              >
                {JSON.stringify((selectedCredential as StoredCredential).subject, null, 2)}
              </pre>
            </div>

            <div>
              <label style={{ color: 'var(--text-muted)' }}>JWT</label>
              <textarea
                className="input"
                value={(selectedCredential as StoredCredential).jwt}
                readOnly
                rows={4}
                style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
              />
              <button
                className="btn btn-primary"
                style={{ marginTop: '0.5rem' }}
                onClick={() => navigator.clipboard.writeText((selectedCredential as StoredCredential).jwt)}
              >
                Copy JWT
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Presentation Modal */}
      {presentationCredential && (
        <CreatePresentationModal
          credential={presentationCredential}
          onClose={() => setPresentationCredential(null)}
        />
      )}
    </div>
  )
}
