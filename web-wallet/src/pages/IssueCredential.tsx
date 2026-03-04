import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { createCredentialOffer } from '../api'

const CREDENTIAL_TYPES = [
  {
    id: 'AIAgentIdentityCredential',
    name: 'AI Agent Identity',
    description: 'Basic identity credential for AI agents',
    fields: [
      { name: 'agentName', label: 'Agent Name', required: true },
      { name: 'agentVersion', label: 'Version', required: true },
      { name: 'developer', label: 'Developer/Organization', required: true },
      { name: 'capabilities', label: 'Capabilities (comma-separated)', required: false },
    ],
  },
  {
    id: 'CapabilityCredential',
    name: 'Capability Credential',
    description: 'Certifies specific capabilities of an AI agent',
    fields: [
      { name: 'capability', label: 'Capability Name', required: true },
      { name: 'level', label: 'Level (basic/intermediate/advanced)', required: true },
      { name: 'certifiedBy', label: 'Certified By', required: true },
    ],
  },
  {
    id: 'AutonomyLevelCredential',
    name: 'Autonomy Level',
    description: 'Defines the autonomy level of an AI agent',
    fields: [
      { name: 'level', label: 'Autonomy Level (1-5)', required: true },
      { name: 'restrictions', label: 'Restrictions', required: false },
      { name: 'supervisor', label: 'Supervisor DID', required: false },
    ],
  },
]

export default function IssueCredential() {
  const [selectedType, setSelectedType] = useState(CREDENTIAL_TYPES[0])
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [offer, setOffer] = useState<{
    credentialOfferUri: string
    qrCodeData: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleTypeChange = (typeId: string) => {
    const type = CREDENTIAL_TYPES.find((t) => t.id === typeId)
    if (type) {
      setSelectedType(type)
      setFormData({})
      setOffer(null)
      setError(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setOffer(null)

    try {
      const result = await createCredentialOffer([selectedType.id], formData)
      setOffer({
        credentialOfferUri: result.credentialOfferUri,
        qrCodeData: result.qrCodeData || result.credentialOfferUri,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create offer')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem' }}>Issue Credential</h2>

      <div className="grid">
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Credential Type</h3>
          <div className="tabs">
            {CREDENTIAL_TYPES.map((type) => (
              <button
                key={type.id}
                className={`tab ${selectedType.id === type.id ? 'active' : ''}`}
                onClick={() => handleTypeChange(type.id)}
              >
                {type.name}
              </button>
            ))}
          </div>

          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            {selectedType.description}
          </p>

          <form onSubmit={handleSubmit}>
            {selectedType.fields.map((field) => (
              <div className="form-group" key={field.name}>
                <label>
                  {field.label}
                  {field.required && <span style={{ color: 'var(--danger)' }}> *</span>}
                </label>
                <input
                  className="input"
                  type="text"
                  value={formData[field.name] || ''}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, [field.name]: e.target.value }))
                  }
                  required={field.required}
                  placeholder={`Enter ${field.label.toLowerCase()}`}
                />
              </div>
            ))}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ width: '100%' }}
            >
              {loading ? 'Creating Offer...' : 'Create Credential Offer'}
            </button>
          </form>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Credential Offer</h3>

          {error && <div className="alert alert-error">{error}</div>}

          {!offer && !error && (
            <div className="empty-state">
              <p>Fill out the form and click "Create Credential Offer" to generate a QR code.</p>
            </div>
          )}

          {offer && (
            <div>
              <div className="qr-container">
                <QRCodeSVG value={offer.qrCodeData} size={250} />
                <p style={{ fontSize: '0.875rem' }}>
                  Scan this QR code with a wallet app to receive the credential
                </p>
              </div>

              <div style={{ marginTop: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                  Credential Offer URI
                </label>
                <textarea
                  className="input"
                  value={offer.credentialOfferUri}
                  readOnly
                  rows={3}
                  style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                />
                <button
                  className="btn btn-primary"
                  style={{ marginTop: '0.5rem' }}
                  onClick={() => navigator.clipboard.writeText(offer.credentialOfferUri)}
                >
                  Copy URI
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
