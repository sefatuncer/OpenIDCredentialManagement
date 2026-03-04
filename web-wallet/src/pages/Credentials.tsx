import { useState, useEffect } from 'react'
import { parseJwt } from '../api'

interface StoredCredential {
  id: string
  jwt: string
  type: string
  issuer: string
  issuanceDate: string
  subject: Record<string, unknown>
}

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
  const [selectedCredential, setSelectedCredential] = useState<StoredCredential | null>(null)
  const [loading, setLoading] = useState(true)

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
        <button className="btn btn-primary" onClick={addTestCredential}>
          Add Test Credential
        </button>
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
          {credentials.map((credential) => (
            <div
              key={credential.id}
              className="credential-card"
              onClick={() => setSelectedCredential(credential)}
              style={{ cursor: 'pointer' }}
            >
              <div className="credential-type">{credential.type}</div>
              <div className="credential-subject">
                {(credential.subject as any).agentName || 'AI Agent'}
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
                {(credential.subject as any).agentVersion && (
                  <div className="credential-detail">
                    <label>Version</label>
                    <span>{(credential.subject as any).agentVersion}</span>
                  </div>
                )}
                {(credential.subject as any).developer && (
                  <div className="credential-detail">
                    <label>Developer</label>
                    <span>{(credential.subject as any).developer}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedCredential && (
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
                onClick={() => deleteCredential(selectedCredential.id)}
              >
                Delete
              </button>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: 'var(--text-muted)' }}>Type</label>
              <p>{selectedCredential.type}</p>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: 'var(--text-muted)' }}>Issuer</label>
              <p style={{ fontFamily: 'monospace', fontSize: '0.875rem', wordBreak: 'break-all' }}>
                {selectedCredential.issuer}
              </p>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ color: 'var(--text-muted)' }}>Issuance Date</label>
              <p>{new Date(selectedCredential.issuanceDate).toLocaleString()}</p>
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
                {JSON.stringify(selectedCredential.subject, null, 2)}
              </pre>
            </div>

            <div>
              <label style={{ color: 'var(--text-muted)' }}>JWT</label>
              <textarea
                className="input"
                value={selectedCredential.jwt}
                readOnly
                rows={4}
                style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
              />
              <button
                className="btn btn-primary"
                style={{ marginTop: '0.5rem' }}
                onClick={() => navigator.clipboard.writeText(selectedCredential.jwt)}
              >
                Copy JWT
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
