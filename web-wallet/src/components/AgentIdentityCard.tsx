/**
 * Agent Identity Credential Card — type-specific rendering
 * Shows agent name, type, capabilities, trust level, security domain
 */

interface AgentIdentityCardProps {
  credential: {
    id: string
    type: string
    issuer: string
    issuanceDate: string
    subject: Record<string, unknown>
  }
  onClick: () => void
}

const TRUST_COLORS: Record<string, string> = {
  basic: '#6b7280',
  elevated: '#f59e0b',
  high: '#10b981',
}

export default function AgentIdentityCard({ credential, onClick }: AgentIdentityCardProps) {
  const s = credential.subject
  const agentName = (s.agentName || s.agent_name || 'AI Agent') as string
  const agentType = (s.agentType || s.agent_type || 'unknown') as string
  const trustLevel = (s.trustLevel || s.trust_level || 'basic') as string
  const capabilities = (s.capabilities || []) as string[]
  const securityDomain = (s.securityDomain || s.security_domain) as string | undefined

  return (
    <div className="credential-card" onClick={onClick} style={{ cursor: 'pointer', borderLeft: '4px solid #3b82f6' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.75rem', color: '#3b82f6', fontWeight: 600, textTransform: 'uppercase' }}>
          Agent Identity
        </span>
        <span
          style={{
            fontSize: '0.7rem',
            padding: '2px 8px',
            borderRadius: '9999px',
            background: TRUST_COLORS[trustLevel] || TRUST_COLORS.basic,
            color: '#fff',
          }}
        >
          {trustLevel}
        </span>
      </div>

      <div className="credential-subject" style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.25rem' }}>
        {agentName}
      </div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
        {agentType}
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
        {securityDomain && (
          <div className="credential-detail">
            <label>Domain</label>
            <span>{securityDomain}</span>
          </div>
        )}
      </div>

      {capabilities.length > 0 && (
        <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {capabilities.slice(0, 5).map((cap) => (
            <span
              key={cap}
              style={{
                fontSize: '0.7rem',
                padding: '2px 6px',
                borderRadius: '4px',
                background: 'var(--bg)',
                color: 'var(--text-muted)',
              }}
            >
              {cap}
            </span>
          ))}
          {capabilities.length > 5 && (
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              +{capabilities.length - 5} more
            </span>
          )}
        </div>
      )}
    </div>
  )
}
