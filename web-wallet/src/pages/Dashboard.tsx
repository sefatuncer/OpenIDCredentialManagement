import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

interface Stats {
  totalCredentials: number
  activeOffers: number
  verificationsToday: number
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    totalCredentials: 0,
    activeOffers: 0,
    verificationsToday: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Simulated stats - in production would fetch from API
    setTimeout(() => {
      setStats({
        totalCredentials: 3,
        activeOffers: 1,
        verificationsToday: 5,
      })
      setLoading(false)
    }, 500)
  }, [])

  return (
    <div>
      <h2 style={{ marginBottom: '1.5rem' }}>Dashboard</h2>

      <div className="grid" style={{ marginBottom: '2rem' }}>
        <div className="card">
          <div className="card-header">
            <h3>Total Credentials</h3>
          </div>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>
            {loading ? '-' : stats.totalCredentials}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Active Offers</h3>
          </div>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--warning)' }}>
            {loading ? '-' : stats.activeOffers}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Verifications Today</h3>
          </div>
          <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: 'var(--success)' }}>
            {loading ? '-' : stats.verificationsToday}
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: '1rem' }}>Quick Actions</h3>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <Link to="/issue">
            <button className="btn btn-primary">Issue New Credential</button>
          </Link>
          <Link to="/credentials">
            <button className="btn btn-primary">View Credentials</button>
          </Link>
          <Link to="/verify">
            <button className="btn btn-primary">Verify Credential</button>
          </Link>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Supported Credential Types</h3>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span className="badge badge-success">AIAgentIdentityCredential</span>
          <span className="badge badge-success">CapabilityCredential</span>
          <span className="badge badge-success">AutonomyLevelCredential</span>
          <span className="badge badge-success">ParentAgentCredential</span>
          <span className="badge badge-success">VerifiedBotCredential</span>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>About AI Agent Identity System</h3>
        <p style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
          This web wallet allows you to issue, manage, and verify Verifiable Credentials
          for AI Agents. Use the OpenID4VCI protocol to issue credentials and OpenID4VP
          for verification. All credentials are cryptographically signed and can be verified
          without contacting the issuer.
        </p>
      </div>
    </div>
  )
}
