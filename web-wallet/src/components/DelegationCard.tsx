/**
 * Delegation Credential Card — type-specific rendering
 * Shows delegator→delegatee, scope, constraints, expiry, chain depth
 */

interface DelegationCardProps {
  credential: {
    id: string
    type: string
    issuer: string
    issuanceDate: string
    subject: Record<string, unknown>
  }
  onClick: () => void
}

export default function DelegationCard({ credential, onClick }: DelegationCardProps) {
  const s = credential.subject
  const delegatorName = (s.delegatorName || s.delegator_name || 'Unknown') as string
  const delegateName = (s.delegateName || s.delegate_name || 'Unknown') as string
  const scope = (s.scope || []) as string[]
  const purpose = (s.purpose || '') as string
  const attenuationLevel = (s.attenuationLevel || s.attenuation_level || 0) as number
  const maxAmount = s.maxAmount || s.max_amount
  const allowedServices = (s.allowedServices || s.allowed_services || []) as string[]
  const validUntil = (s.validUntil || s.valid_until) as string | undefined

  const isExpired = validUntil ? new Date(validUntil) < new Date() : false
  const daysLeft = validUntil
    ? Math.max(0, Math.ceil((new Date(validUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null

  return (
    <div
      className="credential-card"
      onClick={onClick}
      style={{ cursor: 'pointer', borderLeft: `4px solid ${isExpired ? '#ef4444' : '#f59e0b'}` }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: 600, textTransform: 'uppercase' }}>
          Delegation
        </span>
        {attenuationLevel > 0 && (
          <span
            style={{
              fontSize: '0.7rem',
              padding: '2px 8px',
              borderRadius: '9999px',
              background: '#6366f1',
              color: '#fff',
            }}
          >
            Chain depth: {attenuationLevel}
          </span>
        )}
      </div>

      {/* Delegator → Delegatee */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <span style={{ fontWeight: 600 }}>{delegatorName}</span>
        <span style={{ color: 'var(--text-muted)' }}>&rarr;</span>
        <span style={{ fontWeight: 600 }}>{delegateName}</span>
      </div>

      {purpose && (
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{purpose}</div>
      )}

      <div className="credential-details">
        {daysLeft !== null && (
          <div className="credential-detail">
            <label>{isExpired ? 'Expired' : 'Expires'}</label>
            <span style={{ color: isExpired ? '#ef4444' : daysLeft < 7 ? '#f59e0b' : 'inherit' }}>
              {isExpired ? 'Expired' : `${daysLeft}d left`}
            </span>
          </div>
        )}
        {maxAmount !== undefined && (
          <div className="credential-detail">
            <label>Max Amount</label>
            <span>{String(maxAmount)}</span>
          </div>
        )}
      </div>

      {/* Scope tags */}
      {scope.length > 0 && (
        <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {scope.slice(0, 4).map((scopeItem) => (
            <span
              key={scopeItem}
              style={{
                fontSize: '0.7rem',
                padding: '2px 6px',
                borderRadius: '4px',
                background: '#fef3c7',
                color: '#92400e',
              }}
            >
              {scopeItem}
            </span>
          ))}
          {allowedServices.length > 0 && (
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              | {allowedServices.length} services
            </span>
          )}
        </div>
      )}
    </div>
  )
}
