/**
 * Delegation Chain Visualization — A → B → C with scope narrowing
 */

interface ChainNode {
  id: string
  delegatorDid: string
  delegateeDid: string
  chainDepth: number
  scope: {
    actions: string[]
    resources: string[]
  }
  revokedAt: string | null
  expiresAt: string
}

interface DelegationChainViewProps {
  chain: ChainNode[]
  onClose: () => void
}

export default function DelegationChainView({ chain, onClose }: DelegationChainViewProps) {
  const truncateDid = (did: string) => did.length > 24 ? `${did.substring(0, 12)}...${did.slice(-8)}` : did

  const getStatusColor = (node: ChainNode) => {
    if (node.revokedAt) return '#ef4444'
    if (new Date(node.expiresAt) < new Date()) return '#6b7280'
    return '#10b981'
  }

  const getStatusLabel = (node: ChainNode) => {
    if (node.revokedAt) return 'Revoked'
    if (new Date(node.expiresAt) < new Date()) return 'Expired'
    return 'Active'
  }

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.8)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ maxWidth: '500px', width: '90%', maxHeight: '80vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-header" style={{ marginBottom: '1rem' }}>
          <h3>Delegation Chain</h3>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>

        {chain.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No chain data available.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {chain.map((node, i) => (
              <div key={node.id}>
                {/* Node */}
                <div
                  style={{
                    border: `2px solid ${getStatusColor(node)}`,
                    borderRadius: '8px',
                    padding: '0.75rem',
                    background: node.revokedAt ? 'rgba(239,68,68,0.05)' : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                      Depth {node.chainDepth}
                    </span>
                    <span
                      style={{
                        fontSize: '0.7rem', padding: '1px 6px', borderRadius: '9999px',
                        background: getStatusColor(node), color: '#fff',
                      }}
                    >
                      {getStatusLabel(node)}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.8rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                      {truncateDid(node.delegatorDid)}
                    </span>
                    <span style={{ margin: '0 0.5rem' }}>&rarr;</span>
                    <span style={{ fontFamily: 'monospace' }}>
                      {truncateDid(node.delegateeDid)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '0.25rem' }}>
                    {node.scope.actions.slice(0, 3).map((a) => (
                      <span key={a} style={{ fontSize: '0.65rem', padding: '1px 4px', borderRadius: '3px', background: '#fef3c7', color: '#92400e' }}>
                        {a}
                      </span>
                    ))}
                    {node.scope.resources.slice(0, 2).map((r) => (
                      <span key={r} style={{ fontSize: '0.65rem', padding: '1px 4px', borderRadius: '3px', background: '#e0e7ff', color: '#3730a3' }}>
                        {r}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Arrow between nodes */}
                {i < chain.length - 1 && (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '1.2rem', lineHeight: '1.5' }}>
                    &#8595;
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
