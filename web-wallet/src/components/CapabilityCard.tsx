/**
 * Capability Credential Card — type-specific rendering
 * Shows capability type, resource, actions, tool allow list, usage
 */

interface CapabilityCardProps {
  credential: {
    id: string
    type: string
    issuer: string
    issuanceDate: string
    subject: Record<string, unknown>
  }
  onClick: () => void
}

export default function CapabilityCard({ credential, onClick }: CapabilityCardProps) {
  const s = credential.subject
  const capabilityType = (s.capabilityType || s.capability_type || 'Unknown') as string
  const resource = (s.resource || '*') as string
  const actions = (s.actions || []) as string[]
  const toolAllowList = (s.toolAllowList || s.tool_allow_list || []) as string[]
  const maxUsageCount = s.maxUsageCount || s.max_usage_count
  const grantedBy = (s.grantedBy || s.granted_by || '') as string
  const requiredContext = (s.requiredContext || s.required_context || '') as string
  const validUntil = (s.validUntil || s.valid_until) as string | undefined

  const daysLeft = validUntil
    ? Math.max(0, Math.ceil((new Date(validUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null

  return (
    <div className="credential-card" onClick={onClick} style={{ cursor: 'pointer', borderLeft: '4px solid #10b981' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600, textTransform: 'uppercase' }}>
          Capability
        </span>
        {daysLeft !== null && daysLeft <= 3 && (
          <span
            style={{
              fontSize: '0.7rem',
              padding: '2px 8px',
              borderRadius: '9999px',
              background: '#fef3c7',
              color: '#92400e',
            }}
          >
            {daysLeft}d left
          </span>
        )}
      </div>

      <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.25rem' }}>{capabilityType}</div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: '0.5rem' }}>
        {resource}
      </div>

      <div className="credential-details">
        {actions.length > 0 && (
          <div className="credential-detail">
            <label>Actions</label>
            <span>{actions.join(', ')}</span>
          </div>
        )}
        {maxUsageCount !== undefined && (
          <div className="credential-detail">
            <label>Max Uses</label>
            <span>{String(maxUsageCount)}</span>
          </div>
        )}
        {grantedBy && (
          <div className="credential-detail">
            <label>Granted By</label>
            <span>{grantedBy.substring(0, 20)}...</span>
          </div>
        )}
      </div>

      {/* Tool allow list + context */}
      {(toolAllowList.length > 0 || requiredContext) && (
        <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {toolAllowList.slice(0, 4).map((tool) => (
            <span
              key={tool}
              style={{
                fontSize: '0.7rem',
                padding: '2px 6px',
                borderRadius: '4px',
                background: '#d1fae5',
                color: '#065f46',
              }}
            >
              {tool}
            </span>
          ))}
          {requiredContext && (
            <span
              style={{
                fontSize: '0.7rem',
                padding: '2px 6px',
                borderRadius: '4px',
                background: '#e0e7ff',
                color: '#3730a3',
              }}
            >
              ctx: {requiredContext}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
