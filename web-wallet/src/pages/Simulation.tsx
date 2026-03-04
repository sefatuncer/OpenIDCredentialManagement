import { useState, useEffect, useRef, useCallback } from 'react'
import { apiService } from '../services/api.service'

interface SimulationConfig {
  issuerCount: number
  verifierCount: number
  holderCount: number
  speed: 'slow' | 'normal' | 'fast'
}

interface AgentState {
  did: string
  name: string
  role: string
  status: string
  hasBasicCredential: boolean
  hasRichCredential: boolean
  delegationsGiven: number
  delegationsReceived: number
  trustedAgents: string[]
  lastAction: string | null
  lastActionTime: string | null
  // New fields
  credentialsIssued?: number
  credentialsReceived?: number
  credentialsRevoked?: number
  presentationsMade?: number
  verificationsPerformed?: number
  messagesSent?: number
  messagesReceived?: number
  unreadMessages?: number
  trustRelationships?: number
  trustedBy?: number
  trustScore?: number
  activeDelegations?: number
  discoveredAgents?: number
  discoveredBy?: number
}

interface AgentDetailedInfo extends AgentState {
  credentials: Array<{
    id: string
    type: string
    issuer: string
    issuanceDate: string
    revoked: boolean
    revokedAt?: string
    revocationReason?: string
  }>
  recentMessages: Array<{
    id: string
    from: string
    subject: string
    type: string
    timestamp: string
    read: boolean
  }>
  trustRelations: Array<{
    id: string
    trustee: string
    level: string
    score: number
    reason: string
    establishedAt: string
  }>
  delegations: Array<{
    id: string
    delegate: string
    permissions: string[]
    revoked: boolean
    createdAt: string
  }>
  discoveredAgentsList: string[]
  capabilities: string[]
}

interface SimulationEvent {
  id: string
  timestamp: string
  eventType: string
  agentDid?: string
  agentName?: string
  targetDid?: string
  targetName?: string
  action?: string
  result?: string
  data?: Record<string, unknown>
}

interface SimulationStatus {
  sessionId: string
  status: 'idle' | 'running' | 'paused' | 'stopped'
  agentCount: number
  eventCount: number
  startedAt: string | null
  uptime: number
  config: SimulationConfig
}

interface NetworkNode {
  id: string
  name: string
  role: string
  status: string
}

interface NetworkEdge {
  source: string
  target: string
  type: string
  label?: string
  weight?: number
}

interface NetworkState {
  nodes: NetworkNode[]
  edges: NetworkEdge[]
}

interface SimulationStats {
  totalAgents: number
  credentialsIssued: number
  delegationsCreated: number
  trustRelationships: number
  verificationsPerformed: number
  totalEvents: number
  duration: number
  // New stats
  messagesSent?: number
  credentialsRevoked?: number
  agentsDiscovered?: number
  delegationChainsResolved?: number
}

export default function Simulation() {
  const [config, setConfig] = useState<SimulationConfig>({
    issuerCount: 2,
    verifierCount: 2,
    holderCount: 5,
    speed: 'normal',
  })
  const [status, setStatus] = useState<SimulationStatus | null>(null)
  const [agents, setAgents] = useState<AgentState[]>([])
  const [events, setEvents] = useState<SimulationEvent[]>([])
  const [network, setNetwork] = useState<NetworkState>({ nodes: [], edges: [] })
  const [stats, setStats] = useState<SimulationStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wsConnected, setWsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Agent detail modal state
  const [selectedAgent, setSelectedAgent] = useState<AgentDetailedInfo | null>(null)
  const [loadingAgentDetails, setLoadingAgentDetails] = useState(false)

  // Event detail modal state
  const [selectedEvent, setSelectedEvent] = useState<SimulationEvent | null>(null)

  // Fetch simulation status
  const fetchStatus = useCallback(async () => {
    try {
      const data = await apiService.get<SimulationStatus>('/simulation/status')
      setStatus(data)
      return data
    } catch {
      // Simulation endpoint might not exist
      return null
    }
  }, [])

  // Fetch agents
  const fetchAgents = useCallback(async () => {
    try {
      const data = await apiService.get<{ agents: AgentState[] }>('/simulation/agents')
      setAgents(data.agents || [])
    } catch {
      // Ignore
    }
  }, [])

  // Fetch events
  const fetchEvents = useCallback(async () => {
    try {
      const data = await apiService.get<{ events: SimulationEvent[] }>('/simulation/events?limit=50')
      setEvents(data.events || [])
    } catch {
      // Ignore
    }
  }, [])

  // Fetch network
  const fetchNetwork = useCallback(async () => {
    try {
      const data = await apiService.get<NetworkState>('/simulation/network')
      setNetwork(data)
    } catch {
      // Ignore
    }
  }, [])

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const data = await apiService.get<SimulationStats>('/simulation/stats')
      setStats(data)
    } catch {
      // Ignore
    }
  }, [])

  // Fetch agent details
  const fetchAgentDetails = async (did: string) => {
    setLoadingAgentDetails(true)
    try {
      const data = await apiService.get<AgentDetailedInfo>(`/simulation/agents/${encodeURIComponent(did)}`)
      setSelectedAgent(data)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoadingAgentDetails(false)
    }
  }

  // Start simulation
  const startSimulation = async () => {
    setLoading(true)
    setError(null)
    try {
      await apiService.post('/simulation/start', config)
      await fetchStatus()
      startPolling()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // Stop simulation
  const stopSimulation = async () => {
    setLoading(true)
    try {
      const data = await apiService.post<{ stats: SimulationStats }>('/simulation/stop', {})
      setStats(data.stats)
      await fetchStatus()
      stopPolling()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // Pause simulation
  const pauseSimulation = async () => {
    try {
      await apiService.post('/simulation/pause', {})
      await fetchStatus()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  // Resume simulation
  const resumeSimulation = async () => {
    try {
      await apiService.post('/simulation/resume', {})
      await fetchStatus()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  // Start polling for updates
  const startPolling = () => {
    if (pollIntervalRef.current) return
    pollIntervalRef.current = setInterval(async () => {
      await Promise.all([fetchAgents(), fetchEvents(), fetchNetwork(), fetchStats()])
    }, 1000)
  }

  // Stop polling
  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }

  // Connect to WebSocket
  const connectWebSocket = useCallback(() => {
    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3000/ws'
    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setWsConnected(true)
        console.log('WebSocket connected')
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type?.startsWith('simulation:')) {
            // Handle simulation events
            if (data.type === 'simulation:event') {
              setEvents(prev => [data.data, ...prev].slice(0, 100))
            } else if (data.type === 'simulation:network') {
              setNetwork(data.data)
            } else if (data.type === 'simulation:agent') {
              // Update agent
            }
          }
        } catch {
          // Ignore invalid messages
        }
      }

      ws.onclose = () => {
        setWsConnected(false)
        console.log('WebSocket disconnected')
        // Try to reconnect after 5 seconds
        setTimeout(connectWebSocket, 5000)
      }

      ws.onerror = () => {
        setWsConnected(false)
      }
    } catch {
      setWsConnected(false)
    }
  }, [])

  // Initialize
  useEffect(() => {
    fetchStatus().then((s) => {
      if (s?.status === 'running') {
        startPolling()
      }
    })
    connectWebSocket()

    return () => {
      stopPolling()
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [fetchStatus, connectWebSocket])

  // Format time
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Get event icon
  const getEventIcon = (eventType: string, action?: string): string => {
    if (eventType.includes('spawned')) return '🚀'
    if (action === 'ISSUE_CREDENTIAL') return '📜'
    if (action === 'REVOKE_CREDENTIAL') return '❌'
    if (action === 'PRESENT_CREDENTIAL') return '📤'
    if (action === 'VERIFY_PRESENTATION') return '✅'
    if (action === 'SEND_MESSAGE') return '💬'
    if (action === 'RECEIVE_MESSAGE') return '📨'
    if (action === 'ESTABLISH_TRUST') return '🤝'
    if (action === 'CREATE_DELEGATION') return '🔗'
    if (action === 'DISCOVER_AGENT') return '🔍'
    if (eventType.includes('started')) return '▶️'
    if (eventType.includes('stopped')) return '⏹️'
    if (eventType.includes('paused')) return '⏸️'
    return '•'
  }

  // Get role color
  const getRoleColor = (role: string): string => {
    switch (role) {
      case 'issuer': return '#9b59b6'
      case 'holder': return '#3498db'
      case 'verifier': return '#27ae60'
      default: return '#7f8c8d'
    }
  }

  // Get edge color
  const getEdgeColor = (type: string): string => {
    switch (type) {
      case 'trust': return '#27ae60'
      case 'delegation': return '#9b59b6'
      case 'message': return '#3498db'
      case 'discovery': return '#f39c12'
      case 'communication': return '#e74c3c'
      default: return '#7f8c8d'
    }
  }

  // Handle agent click
  const handleAgentClick = (node: NetworkNode) => {
    fetchAgentDetails(node.id)
  }

  // Close modal
  const closeModal = () => {
    setSelectedAgent(null)
  }

  // Shorten DID for display
  const shortenDid = (did: string): string => {
    if (did.length <= 20) return did
    return `${did.slice(0, 15)}...${did.slice(-8)}`
  }

  return (
    <div className="simulation-page">
      <h2>SSI Simulation</h2>
      <p className="page-description">
        Issuers, Holders ve Verifiers otomatik credential alışverişi yapıyor
      </p>

      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Control Panel */}
      <div className="card control-panel">
        <h3>Control Panel</h3>
        <div className="control-row">
          <div className="control-group">
            <label>Issuers</label>
            <input
              type="number"
              min={1}
              max={10}
              value={config.issuerCount}
              onChange={(e) => setConfig({ ...config, issuerCount: parseInt(e.target.value) || 1 })}
              disabled={status?.status === 'running'}
            />
          </div>

          <div className="control-group">
            <label>Holders</label>
            <input
              type="number"
              min={1}
              max={20}
              value={config.holderCount}
              onChange={(e) => setConfig({ ...config, holderCount: parseInt(e.target.value) || 1 })}
              disabled={status?.status === 'running'}
            />
          </div>

          <div className="control-group">
            <label>Verifiers</label>
            <input
              type="number"
              min={1}
              max={10}
              value={config.verifierCount}
              onChange={(e) => setConfig({ ...config, verifierCount: parseInt(e.target.value) || 1 })}
              disabled={status?.status === 'running'}
            />
          </div>

          <div className="control-group">
            <label>Speed</label>
            <select
              value={config.speed}
              onChange={(e) => setConfig({ ...config, speed: e.target.value as SimulationConfig['speed'] })}
              disabled={status?.status === 'running'}
            >
              <option value="slow">Slow</option>
              <option value="normal">Normal</option>
              <option value="fast">Fast</option>
            </select>
          </div>

          <div className="control-buttons">
            {status?.status !== 'running' && status?.status !== 'paused' ? (
              <button
                className="btn btn-primary btn-large"
                onClick={startSimulation}
                disabled={loading}
              >
                {loading ? '...' : '▶ Start Simulation'}
              </button>
            ) : (
              <>
                {status.status === 'running' ? (
                  <button className="btn btn-warning" onClick={pauseSimulation}>
                    ⏸ Pause
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={resumeSimulation}>
                    ▶ Resume
                  </button>
                )}
                <button className="btn btn-danger" onClick={stopSimulation} disabled={loading}>
                  ⏹ Stop
                </button>
              </>
            )}
          </div>
        </div>

        {/* Status indicators */}
        <div className="status-bar">
          <span className={`status-indicator ${status?.status || 'idle'}`}>
            {status?.status?.toUpperCase() || 'IDLE'}
          </span>
{wsConnected && (
            <span className="ws-indicator connected">
              WS: Connected
            </span>
          )}
          {status?.status === 'running' && (
            <span className="uptime">Uptime: {formatTime(status.uptime)}</span>
          )}
        </div>
      </div>

      {/* Stats Panel */}
      {stats && (
        <div className="card stats-panel">
          <h3>Statistics</h3>
          <div className="stats-grid">
            <div className="stat-item">
              <span className="stat-value">{stats.totalAgents}</span>
              <span className="stat-label">Agents</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{stats.credentialsIssued}</span>
              <span className="stat-label">Credentials</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{stats.credentialsRevoked || 0}</span>
              <span className="stat-label">Revoked</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{stats.messagesSent || 0}</span>
              <span className="stat-label">Messages</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{stats.trustRelationships}</span>
              <span className="stat-label">Trust Relations</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{stats.delegationsCreated}</span>
              <span className="stat-label">Delegations</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{stats.verificationsPerformed}</span>
              <span className="stat-label">Verifications</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{stats.agentsDiscovered || 0}</span>
              <span className="stat-label">Discovered</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{stats.totalEvents}</span>
              <span className="stat-label">Total Events</span>
            </div>
          </div>
        </div>
      )}

      {/* Main content grid */}
      <div className="simulation-grid">
        {/* Network Visualization */}
        <div className="card network-panel">
          <h3>Agent Network <span className="hint">(Click agent for details)</span></h3>
          <div className="network-viz">
            {network.nodes.length === 0 ? (
              <div className="empty-state">
                <p>No agents spawned yet</p>
                <p className="hint">Start the simulation to see agents appear</p>
              </div>
            ) : (
              <div className="network-canvas">
                {/* Simple grid-based visualization */}
                <div className="agent-grid">
                  {network.nodes.map((node) => (
                    <div
                      key={node.id}
                      className={`agent-node ${node.role} ${node.status} clickable`}
                      style={{ borderColor: getRoleColor(node.role) }}
                      title={`Click to see details\n${node.name}\nRole: ${node.role}\nStatus: ${node.status}`}
                      onClick={() => handleAgentClick(node)}
                    >
                      <span className="agent-avatar">
                        {node.role === 'issuer' ? '🏛️' : node.role === 'verifier' ? '🔍' : '👤'}
                      </span>
                      <span className="agent-name">{node.name}</span>
                      <span className="agent-role" style={{ color: getRoleColor(node.role) }}>
                        {node.role}
                      </span>
                    </div>
                  ))}
                </div>
                {/* Connection summary */}
                <div className="connections-info">
                  {network.edges.length > 0 && (
                    <div className="edge-legend">
                      <span style={{ color: getEdgeColor('trust') }}>● Trust</span>
                      <span style={{ color: getEdgeColor('delegation') }}>● Delegation</span>
                      <span style={{ color: getEdgeColor('message') }}>● Message</span>
                      <span style={{ color: getEdgeColor('discovery') }}>● Discovery</span>
                      <span className="edge-count">({network.edges.length} connections)</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Event Stream */}
        <div className="card event-panel">
          <h3>
            Live Event Stream
            {events.length > 0 && <span className="event-count">({events.length})</span>}
          </h3>
          <div className="event-stream">
            {events.length === 0 ? (
              <div className="empty-state">
                <p>No events yet</p>
                <p className="hint">Events will appear here as agents interact</p>
              </div>
            ) : (
              events.map((event) => (
                <div
                  key={event.id}
                  className={`event-item ${event.result} clickable`}
                  onClick={() => setSelectedEvent(event)}
                  title="Click to see details"
                >
                  <span className="event-icon">{getEventIcon(event.eventType, event.action)}</span>
                  <span className="event-time">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="event-content">
                    {event.agentName && <strong>{event.agentName}</strong>}
                    {' '}
                    {event.action || event.eventType.split('.').pop()}
                    {event.targetName && (
                      <>
                        {' → '}
                        <strong>{event.targetName}</strong>
                      </>
                    )}
                    {event.result && (
                      <span className={`result-badge ${event.result}`}>
                        {event.result === 'success' ? '✓' : '✗'}
                      </span>
                    )}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Agent List */}
      {agents.length > 0 && (
        <div className="card agent-list-panel">
          <h3>Active Agents ({agents.length})</h3>
          <div className="agent-table">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Credentials</th>
                  <th>Messages</th>
                  <th>Trust Score</th>
                  <th>Delegations</th>
                  <th>Discovered</th>
                  <th>Last Action</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr key={agent.did} onClick={() => fetchAgentDetails(agent.did)} className="clickable-row">
                    <td>
                      <span className="agent-name-cell">
                        {agent.role === 'issuer' ? '🏛️' : agent.role === 'verifier' ? '🔍' : '👤'} {agent.name}
                      </span>
                    </td>
                    <td>
                      <span className="role-badge" style={{ backgroundColor: getRoleColor(agent.role) }}>
                        {agent.role}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge ${agent.status}`}>
                        {agent.status}
                      </span>
                    </td>
                    <td>
                      {agent.role === 'issuer' ? (
                        <span>📜 {agent.credentialsIssued || 0} issued</span>
                      ) : agent.role === 'holder' ? (
                        <span>📜 {agent.credentialsReceived || 0} held</span>
                      ) : (
                        <span>✅ {agent.verificationsPerformed || 0} verified</span>
                      )}
                    </td>
                    <td>
                      ↑{agent.messagesSent || 0} ↓{agent.messagesReceived || 0}
                      {(agent.unreadMessages || 0) > 0 && (
                        <span className="unread-badge">{agent.unreadMessages}</span>
                      )}
                    </td>
                    <td>
                      <span className="trust-score">{agent.trustScore || 50}</span>
                    </td>
                    <td>
                      ↑{agent.delegationsGiven} ↓{agent.delegationsReceived}
                    </td>
                    <td>{agent.discoveredAgents || 0}</td>
                    <td className="last-action">
                      {agent.lastAction || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Agent Detail Modal */}
      {selectedAgent && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {selectedAgent.role === 'issuer' ? '🏛️' : selectedAgent.role === 'verifier' ? '🔍' : '👤'}
                {' '}{selectedAgent.name}
              </h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>

            {loadingAgentDetails ? (
              <div className="modal-loading">Loading...</div>
            ) : (
              <div className="modal-body">
                {/* Basic Info */}
                <div className="detail-section">
                  <h4>Basic Information</h4>
                  <div className="detail-grid">
                    <div className="detail-item full-width">
                      <label>DID</label>
                      <code title={selectedAgent.did}>{selectedAgent.did}</code>
                    </div>
                    <div className="detail-item">
                      <label>Role</label>
                      <span className="role-badge" style={{ backgroundColor: getRoleColor(selectedAgent.role) }}>
                        {selectedAgent.role}
                      </span>
                    </div>
                    <div className="detail-item">
                      <label>Status</label>
                      <span className={`status-badge ${selectedAgent.status}`}>{selectedAgent.status}</span>
                    </div>
                    <div className="detail-item">
                      <label>Trust Score</label>
                      <span className="trust-score-large">{selectedAgent.trustScore || 50}/100</span>
                    </div>
                  </div>
                </div>

                {/* Capabilities */}
                <div className="detail-section">
                  <h4>Capabilities</h4>
                  <div className="capabilities-list">
                    {selectedAgent.capabilities?.map((cap, i) => (
                      <span key={i} className="capability-badge">{cap}</span>
                    ))}
                  </div>
                </div>

                {/* Statistics */}
                <div className="detail-section">
                  <h4>Statistics</h4>
                  <div className="stats-mini-grid">
                    {selectedAgent.role === 'issuer' && (
                      <>
                        <div className="stat-mini"><span className="val">{selectedAgent.credentialsIssued || 0}</span><span className="lbl">Issued</span></div>
                        <div className="stat-mini"><span className="val">{selectedAgent.credentialsRevoked || 0}</span><span className="lbl">Revoked</span></div>
                      </>
                    )}
                    {selectedAgent.role === 'holder' && (
                      <>
                        <div className="stat-mini"><span className="val">{selectedAgent.credentialsReceived || 0}</span><span className="lbl">Received</span></div>
                        <div className="stat-mini"><span className="val">{selectedAgent.presentationsMade || 0}</span><span className="lbl">Presented</span></div>
                      </>
                    )}
                    {selectedAgent.role === 'verifier' && (
                      <div className="stat-mini"><span className="val">{selectedAgent.verificationsPerformed || 0}</span><span className="lbl">Verified</span></div>
                    )}
                    <div className="stat-mini"><span className="val">{selectedAgent.messagesSent || 0}</span><span className="lbl">Msg Sent</span></div>
                    <div className="stat-mini"><span className="val">{selectedAgent.messagesReceived || 0}</span><span className="lbl">Msg Recv</span></div>
                    <div className="stat-mini"><span className="val">{selectedAgent.trustRelationships || 0}</span><span className="lbl">Trusts</span></div>
                    <div className="stat-mini"><span className="val">{selectedAgent.trustedBy || 0}</span><span className="lbl">Trusted By</span></div>
                    <div className="stat-mini"><span className="val">{selectedAgent.activeDelegations || 0}</span><span className="lbl">Delegations</span></div>
                    <div className="stat-mini"><span className="val">{selectedAgent.discoveredAgents || 0}</span><span className="lbl">Discovered</span></div>
                  </div>
                </div>

                {/* Credentials */}
                {selectedAgent.credentials && selectedAgent.credentials.length > 0 && (
                  <div className="detail-section">
                    <h4>Credentials ({selectedAgent.credentials.length})</h4>
                    <div className="detail-list">
                      {selectedAgent.credentials.map((cred) => (
                        <div key={cred.id} className={`list-item ${cred.revoked ? 'revoked' : ''}`}>
                          <span className="item-icon">{cred.revoked ? '❌' : '📜'}</span>
                          <div className="item-content">
                            <span className="item-title">{cred.type}</span>
                            <span className="item-subtitle">
                              Issued: {new Date(cred.issuanceDate).toLocaleDateString()}
                              {cred.revoked && ` | Revoked: ${cred.revocationReason}`}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Trust Relations */}
                {selectedAgent.trustRelations && selectedAgent.trustRelations.length > 0 && (
                  <div className="detail-section">
                    <h4>Trust Relations ({selectedAgent.trustRelations.length})</h4>
                    <div className="detail-list">
                      {selectedAgent.trustRelations.map((trust) => (
                        <div key={trust.id} className="list-item">
                          <span className="item-icon">🤝</span>
                          <div className="item-content">
                            <span className="item-title">
                              {shortenDid(trust.trustee)} - {trust.level} ({trust.score}/100)
                            </span>
                            <span className="item-subtitle">{trust.reason}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Delegations */}
                {selectedAgent.delegations && selectedAgent.delegations.length > 0 && (
                  <div className="detail-section">
                    <h4>Delegations ({selectedAgent.delegations.length})</h4>
                    <div className="detail-list">
                      {selectedAgent.delegations.map((del) => (
                        <div key={del.id} className={`list-item ${del.revoked ? 'revoked' : ''}`}>
                          <span className="item-icon">{del.revoked ? '🔗❌' : '🔗'}</span>
                          <div className="item-content">
                            <span className="item-title">To: {shortenDid(del.delegate)}</span>
                            <span className="item-subtitle">
                              Permissions: {del.permissions.join(', ')}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent Messages */}
                {selectedAgent.recentMessages && selectedAgent.recentMessages.length > 0 && (
                  <div className="detail-section">
                    <h4>Recent Messages ({selectedAgent.recentMessages.length})</h4>
                    <div className="detail-list">
                      {selectedAgent.recentMessages.map((msg) => (
                        <div key={msg.id} className={`list-item ${msg.read ? '' : 'unread'}`}>
                          <span className="item-icon">{msg.read ? '📧' : '📬'}</span>
                          <div className="item-content">
                            <span className="item-title">{msg.subject}</span>
                            <span className="item-subtitle">
                              From: {shortenDid(msg.from)} | {new Date(msg.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div className="modal-overlay" onClick={() => setSelectedEvent(null)}>
          <div className="modal-content event-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {getEventIcon(selectedEvent.eventType, selectedEvent.action)}
                {' '}Event Details
              </h3>
              <button className="modal-close" onClick={() => setSelectedEvent(null)}>×</button>
            </div>

            <div className="modal-body">
              {/* Event Info */}
              <div className="detail-section">
                <h4>Event Information</h4>
                <div className="detail-grid">
                  <div className="detail-item">
                    <label>Event ID</label>
                    <code>{selectedEvent.id}</code>
                  </div>
                  <div className="detail-item">
                    <label>Event Type</label>
                    <span className="event-type-badge">{selectedEvent.eventType}</span>
                  </div>
                  <div className="detail-item">
                    <label>Action</label>
                    <span className="action-badge">{selectedEvent.action || 'N/A'}</span>
                  </div>
                  <div className="detail-item">
                    <label>Result</label>
                    <span className={`result-badge-large ${selectedEvent.result}`}>
                      {selectedEvent.result === 'success' ? '✓ Success' : selectedEvent.result === 'failed' ? '✗ Failed' : selectedEvent.result || 'N/A'}
                    </span>
                  </div>
                  <div className="detail-item">
                    <label>Timestamp</label>
                    <span>{new Date(selectedEvent.timestamp).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Agent Info */}
              {(selectedEvent.agentDid || selectedEvent.agentName) && (
                <div className="detail-section">
                  <h4>Source Agent</h4>
                  <div className="detail-grid">
                    {selectedEvent.agentName && (
                      <div className="detail-item">
                        <label>Name</label>
                        <span className="agent-name-display">{selectedEvent.agentName}</span>
                      </div>
                    )}
                    {selectedEvent.agentDid && (
                      <div className="detail-item full-width">
                        <label>DID</label>
                        <code>{selectedEvent.agentDid}</code>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Target Info */}
              {(selectedEvent.targetDid || selectedEvent.targetName) && (
                <div className="detail-section">
                  <h4>Target Agent</h4>
                  <div className="detail-grid">
                    {selectedEvent.targetName && (
                      <div className="detail-item">
                        <label>Name</label>
                        <span className="agent-name-display">{selectedEvent.targetName}</span>
                      </div>
                    )}
                    {selectedEvent.targetDid && (
                      <div className="detail-item full-width">
                        <label>DID</label>
                        <code>{selectedEvent.targetDid}</code>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Event Data */}
              {selectedEvent.data && Object.keys(selectedEvent.data).length > 0 && (
                <div className="detail-section">
                  <h4>Event Data</h4>
                  <div className="event-data-container">
                    <pre className="event-data-json">
                      {JSON.stringify(selectedEvent.data, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .simulation-page {
          padding-bottom: 2rem;
        }

        .page-description {
          color: #7f8c8d;
          margin-bottom: 1.5rem;
        }

        .error-banner {
          background: #e74c3c;
          color: white;
          padding: 0.75rem 1rem;
          border-radius: 8px;
          margin-bottom: 1rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .error-banner button {
          background: transparent;
          border: none;
          color: white;
          font-size: 1.5rem;
          cursor: pointer;
        }

        .control-panel {
          margin-bottom: 1.5rem;
        }

        .control-row {
          display: flex;
          gap: 1.5rem;
          align-items: flex-end;
          flex-wrap: wrap;
        }

        .control-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .control-group label {
          font-weight: 500;
          color: #e2e8f0;
        }

        .control-group input,
        .control-group select {
          padding: 0.75rem;
          border: 1px solid #334155;
          border-radius: 6px;
          font-size: 1rem;
          min-width: 150px;
          background: #1e293b;
          color: #f8fafc;
        }

        .control-buttons {
          display: flex;
          gap: 0.5rem;
          margin-left: auto;
        }

        .btn-large {
          padding: 0.75rem 1.5rem;
          font-size: 1.1rem;
        }

        .btn-warning {
          background: #f39c12;
        }

        .status-bar {
          display: flex;
          gap: 1rem;
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid #334155;
        }

        .status-indicator {
          padding: 0.25rem 0.75rem;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .status-indicator.idle { background: #bdc3c7; color: white; }
        .status-indicator.running { background: #27ae60; color: white; }
        .status-indicator.paused { background: #f39c12; color: white; }
        .status-indicator.stopped { background: #e74c3c; color: white; }

        .ws-indicator {
          font-size: 0.85rem;
        }

        .ws-indicator.connected { color: #27ae60; }
        .ws-indicator.disconnected { color: #e74c3c; }

        .uptime {
          margin-left: auto;
          font-family: monospace;
          color: #7f8c8d;
        }

        .stats-panel {
          margin-bottom: 1.5rem;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
          gap: 1rem;
        }

        .stat-item {
          text-align: center;
          padding: 1rem;
          background: #1e293b;
          border-radius: 8px;
        }

        .stat-value {
          display: block;
          font-size: 2rem;
          font-weight: 700;
          color: #6366f1;
        }

        .stat-label {
          font-size: 0.85rem;
          color: #94a3b8;
        }

        .simulation-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
          margin-bottom: 1.5rem;
        }

        @media (max-width: 1024px) {
          .simulation-grid {
            grid-template-columns: 1fr;
          }
        }

        .network-panel, .event-panel {
          min-height: 400px;
        }

        .network-panel h3 .hint {
          font-size: 0.75rem;
          font-weight: normal;
          color: #7f8c8d;
          margin-left: 0.5rem;
        }

        .network-viz {
          height: 350px;
          overflow: auto;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #7f8c8d;
        }

        .empty-state .hint {
          font-size: 0.85rem;
          opacity: 0.7;
        }

        .agent-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
          padding: 1rem;
        }

        .agent-node {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 1rem;
          border: 2px solid;
          border-radius: 12px;
          background: #1e293b;
          min-width: 100px;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .agent-node.clickable {
          cursor: pointer;
        }

        .agent-node:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }

        .agent-node.active {
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }

        .agent-avatar {
          font-size: 2rem;
          margin-bottom: 0.5rem;
        }

        .agent-name {
          font-weight: 600;
          font-size: 0.9rem;
          color: #f8fafc;
        }

        .agent-role {
          font-size: 0.75rem;
          text-transform: uppercase;
        }

        .connections-info {
          text-align: center;
          color: #7f8c8d;
          font-size: 0.85rem;
          padding: 0.5rem;
        }

        .edge-legend {
          display: flex;
          gap: 1rem;
          justify-content: center;
          flex-wrap: wrap;
        }

        .edge-count {
          color: #7f8c8d;
        }

        .event-panel h3 {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .event-count {
          font-size: 0.85rem;
          font-weight: normal;
          color: #7f8c8d;
        }

        .event-stream {
          height: 350px;
          overflow-y: auto;
          padding-right: 0.5rem;
        }

        .event-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.5rem;
          border-bottom: 1px solid #334155;
          font-size: 0.9rem;
        }

        .event-item:last-child {
          border-bottom: none;
        }

        .event-icon {
          flex-shrink: 0;
        }

        .event-time {
          font-family: monospace;
          font-size: 0.8rem;
          color: #7f8c8d;
          flex-shrink: 0;
        }

        .event-content {
          flex: 1;
        }

        .event-content strong {
          color: #6366f1;
        }

        .result-badge {
          margin-left: 0.5rem;
          font-size: 0.85rem;
        }

        .result-badge.success { color: #27ae60; }
        .result-badge.failed { color: #e74c3c; }

        .agent-list-panel {
          overflow-x: auto;
        }

        .agent-table table {
          width: 100%;
          border-collapse: collapse;
        }

        .agent-table th,
        .agent-table td {
          padding: 0.75rem;
          text-align: left;
          border-bottom: 1px solid #334155;
        }

        .agent-table th {
          font-weight: 600;
          color: #e2e8f0;
          background: #1e293b;
        }

        .clickable-row {
          cursor: pointer;
        }

        .clickable-row:hover {
          background: #334155;
        }

        .agent-name-cell {
          font-weight: 500;
          color: #f8fafc;
        }

        .role-badge {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 12px;
          font-size: 0.75rem;
          color: white;
          text-transform: capitalize;
        }

        .status-badge {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 12px;
          font-size: 0.75rem;
        }

        .status-badge.active { background: #d5f5e3; color: #27ae60; }
        .status-badge.idle { background: #fdebd0; color: #f39c12; }
        .status-badge.spawning { background: #d4efdf; color: #2ecc71; }
        .status-badge.terminated { background: #fadbd8; color: #e74c3c; }

        .unread-badge {
          background: #e74c3c;
          color: white;
          padding: 0.1rem 0.4rem;
          border-radius: 10px;
          font-size: 0.7rem;
          margin-left: 0.25rem;
        }

        .trust-score {
          font-weight: 600;
          color: #27ae60;
        }

        .last-action {
          font-family: monospace;
          font-size: 0.85rem;
          color: #7f8c8d;
        }

        /* Modal Styles */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal-content {
          background: #0f172a;
          border-radius: 12px;
          max-width: 700px;
          width: 90%;
          max-height: 85vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          color: #f8fafc;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.5rem;
          border-bottom: 1px solid #334155;
          background: #1e293b;
        }

        .modal-header h3 {
          margin: 0;
        }

        .modal-close {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          color: #94a3b8;
        }

        .modal-close:hover {
          color: #f8fafc;
        }

        .modal-loading {
          padding: 3rem;
          text-align: center;
          color: #94a3b8;
        }

        .modal-body {
          padding: 1.5rem;
          overflow-y: auto;
        }

        .detail-section {
          margin-bottom: 1.5rem;
        }

        .detail-section h4 {
          margin: 0 0 0.75rem;
          color: #e2e8f0;
          border-bottom: 1px solid #334155;
          padding-bottom: 0.5rem;
        }

        .detail-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 1rem;
        }

        .detail-item {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .detail-item label {
          font-size: 0.75rem;
          color: #94a3b8;
          text-transform: uppercase;
        }

        .detail-item code {
          font-size: 0.85rem;
          background: #334155;
          color: #e2e8f0;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          word-break: break-all;
        }

        .detail-item.full-width {
          grid-column: 1 / -1;
        }

        .trust-score-large {
          font-size: 1.25rem;
          font-weight: 700;
          color: #27ae60;
        }

        .capabilities-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .capability-badge {
          background: #1e3a5f;
          color: #60a5fa;
          padding: 0.25rem 0.75rem;
          border-radius: 12px;
          font-size: 0.8rem;
        }

        .stats-mini-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
          gap: 0.75rem;
        }

        .stat-mini {
          text-align: center;
          padding: 0.75rem;
          background: #334155;
          border-radius: 8px;
        }

        .stat-mini .val {
          display: block;
          font-size: 1.25rem;
          font-weight: 700;
          color: #6366f1;
        }

        .stat-mini .lbl {
          font-size: 0.7rem;
          color: #94a3b8;
        }

        .detail-list {
          max-height: 200px;
          overflow-y: auto;
        }

        .list-item {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 0.75rem;
          border-bottom: 1px solid #334155;
        }

        .list-item:last-child {
          border-bottom: none;
        }

        .list-item.revoked {
          opacity: 0.6;
        }

        .list-item.unread {
          background: #3d3a29;
        }

        .item-icon {
          flex-shrink: 0;
          font-size: 1.25rem;
        }

        .item-content {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          overflow: hidden;
        }

        .item-title {
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          color: #f8fafc;
        }

        .item-subtitle {
          font-size: 0.8rem;
          color: #94a3b8;
        }

        /* Event Modal Styles */
        .event-modal {
          max-width: 600px;
        }

        .event-item.clickable {
          cursor: pointer;
          transition: background 0.2s;
        }

        .event-item.clickable:hover {
          background: #334155;
        }

        .event-type-badge {
          background: #1e3a5f;
          color: #60a5fa;
          padding: 0.25rem 0.75rem;
          border-radius: 12px;
          font-size: 0.85rem;
        }

        .action-badge {
          background: #3d2f5f;
          color: #a78bfa;
          padding: 0.25rem 0.75rem;
          border-radius: 12px;
          font-size: 0.85rem;
          font-family: monospace;
        }

        .result-badge-large {
          padding: 0.25rem 0.75rem;
          border-radius: 12px;
          font-size: 0.85rem;
          font-weight: 600;
        }

        .result-badge-large.success {
          background: #14532d;
          color: #4ade80;
        }

        .result-badge-large.failed {
          background: #7f1d1d;
          color: #f87171;
        }

        .agent-name-display {
          font-weight: 600;
          color: #6366f1;
          font-size: 1rem;
        }

        .event-data-container {
          background: #1e293b;
          border-radius: 8px;
          padding: 1rem;
          max-height: 300px;
          overflow: auto;
        }

        .event-data-json {
          margin: 0;
          font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
          font-size: 0.85rem;
          color: #e2e8f0;
          white-space: pre-wrap;
          word-break: break-all;
        }
      `}</style>
    </div>
  )
}
