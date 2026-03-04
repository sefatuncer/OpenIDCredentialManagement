/**
 * Simulation Engine
 * ISOLATED from main system - controls autonomous agent simulation
 * Easy to remove later
 */

import { v4 as uuidv4 } from 'uuid'
import {
  AutonomousAgent,
  clearSimulationData,
  getAllTrustRelations,
  getAllDelegations,
  getAllMessages,
} from './autonomous-agent'
import {
  SimulationConfig,
  SimulationState,
  SimulationStatus,
  SimulationStats,
  SimulationEvent,
  AgentRole,
  AgentState,
  NetworkState,
  NetworkEdge,
} from './types'
import { logger } from '../utils/logger'
import {
  updateAgentCount,
  recordAgentAction,
  recordCredentialIssuance,
  recordCredentialVerification,
  updateCapabilityCount,
} from '../services/metrics.service'

class SimulationEngine {
  private agents: AutonomousAgent[] = []
  private status: SimulationStatus = 'idle'
  private sessionId: string = ''
  private config: SimulationConfig | null = null
  private startedAt: Date | null = null
  private events: SimulationEvent[] = []
  private stats: SimulationStats = this.getEmptyStats()
  private tickInterval: NodeJS.Timeout | null = null
  private eventListeners: Array<(event: SimulationEvent) => void> = []

  /**
   * Start a new simulation
   */
  async start(config: SimulationConfig): Promise<{ sessionId: string; status: SimulationStatus }> {
    if (this.status === 'running') {
      throw new Error('Simulation is already running')
    }

    // Reset state
    this.reset()

    this.sessionId = uuidv4()
    this.config = config
    this.status = 'running'
    this.startedAt = new Date()

    logger.info('Starting simulation', { sessionId: this.sessionId, config })

    this.emitEvent({
      eventType: 'simulation.started',
      data: { sessionId: this.sessionId, config },
    })

    try {
      // Spawn issuers
      for (let i = 0; i < config.issuerCount; i++) {
        const agent = new AutonomousAgent(`Issuer-${i + 1}`, 'issuer')
        this.agents.push(agent)
        this.stats.totalAgents++
        this.emitEvent({
          eventType: 'agent.spawned',
          agentDid: agent.did,
          agentName: agent.name,
          data: { role: 'issuer' },
        })
      }

      // Spawn holders
      for (let i = 0; i < config.holderCount; i++) {
        const agent = new AutonomousAgent(`Holder-${i + 1}`, 'holder')
        this.agents.push(agent)
        this.stats.totalAgents++
        this.emitEvent({
          eventType: 'agent.spawned',
          agentDid: agent.did,
          agentName: agent.name,
          data: { role: 'holder' },
        })
      }

      // Spawn verifiers
      for (let i = 0; i < config.verifierCount; i++) {
        const agent = new AutonomousAgent(`Verifier-${i + 1}`, 'verifier')
        this.agents.push(agent)
        this.stats.totalAgents++
        this.emitEvent({
          eventType: 'agent.spawned',
          agentDid: agent.did,
          agentName: agent.name,
          data: { role: 'verifier' },
        })
      }

      // Update Prometheus metrics for agent counts
      this.updatePrometheusAgentCounts()

      // Start autonomous loop with delay
      this.startAutonomousLoop()

      return { sessionId: this.sessionId, status: this.status }
    } catch (error) {
      logger.error('Failed to start simulation', { error })
      this.status = 'stopped'
      throw error
    }
  }

  /**
   * Stop the simulation
   */
  stop(): { status: SimulationStatus; stats: SimulationStats } {
    if (this.status !== 'running' && this.status !== 'paused') {
      return { status: this.status, stats: this.stats }
    }

    if (this.tickInterval) {
      clearInterval(this.tickInterval)
      this.tickInterval = null
    }

    // Terminate all agents
    for (const agent of this.agents) {
      agent.terminate()
    }

    this.status = 'stopped'
    this.stats.duration = this.getUptime()

    this.emitEvent({
      eventType: 'simulation.stopped',
      data: { stats: this.stats },
    })

    logger.info('Simulation stopped', { sessionId: this.sessionId, stats: this.stats })

    return { status: this.status, stats: this.stats }
  }

  /**
   * Pause the simulation
   */
  pause(): SimulationStatus {
    if (this.status !== 'running') {
      return this.status
    }

    if (this.tickInterval) {
      clearInterval(this.tickInterval)
      this.tickInterval = null
    }

    this.status = 'paused'

    this.emitEvent({ eventType: 'simulation.paused' })

    return this.status
  }

  /**
   * Resume the simulation
   */
  resume(): SimulationStatus {
    if (this.status !== 'paused') {
      return this.status
    }

    this.status = 'running'
    this.startAutonomousLoop()

    this.emitEvent({ eventType: 'simulation.resumed' })

    return this.status
  }

  /**
   * Get current simulation status
   */
  getStatus(): SimulationState {
    return {
      sessionId: this.sessionId,
      status: this.status,
      agentCount: this.agents.length,
      eventCount: this.events.length,
      startedAt: this.startedAt,
      uptime: this.getUptime(),
      config: this.config || { issuerCount: 0, verifierCount: 0, holderCount: 0, speed: 'normal' },
    }
  }

  /**
   * Get all agents
   */
  getAgents(): AgentState[] {
    return this.agents.map(agent => agent.getState())
  }

  /**
   * Get agent by DID
   */
  getAgent(did: string): AutonomousAgent | undefined {
    return this.agents.find(a => a.did === did)
  }

  /**
   * Get detailed agent info by DID
   */
  getAgentDetails(did: string): Record<string, unknown> | null {
    const agent = this.agents.find(a => a.did === did)
    if (!agent) return null
    return agent.getDetailedInfo()
  }

  /**
   * Get events with pagination
   */
  getEvents(limit = 100, offset = 0): SimulationEvent[] {
    return this.events.slice(offset, offset + limit)
  }

  /**
   * Get network state (nodes and edges)
   */
  getNetworkState(): NetworkState {
    const nodes = this.agents.map(agent => {
      const state = agent.getState()
      return {
        id: state.did,
        name: state.name,
        role: state.role,
        status: state.status,
      }
    })

    const edges: NetworkEdge[] = []
    const edgeSet = new Set<string>() // Prevent duplicates

    // Build edges from recent events
    const recentEvents = this.events.slice(0, 100)

    for (const event of recentEvents) {
      const eventData = event.data as Record<string, unknown> | undefined

      // Credential issuance edges
      if (event.action === 'ISSUE_CREDENTIAL' && eventData?.holder) {
        const holderAgent = this.agents.find(a => a.name === eventData?.holder)
        if (event.agentDid && holderAgent) {
          const edgeKey = `delegation:${event.agentDid}:${holderAgent.did}`
          if (!edgeSet.has(edgeKey)) {
            edges.push({
              source: event.agentDid,
              target: holderAgent.did,
              type: 'delegation',
              label: 'issued',
            })
            edgeSet.add(edgeKey)
          }
        }
      }

      // Presentation edges
      if (event.action === 'PRESENT_CREDENTIAL' && eventData?.verifier) {
        const verifierAgent = this.agents.find(a => a.name === eventData?.verifier)
        if (event.agentDid && verifierAgent) {
          const edgeKey = `communication:${event.agentDid}:${verifierAgent.did}`
          if (!edgeSet.has(edgeKey)) {
            edges.push({
              source: event.agentDid,
              target: verifierAgent.did,
              type: 'communication',
              label: 'presented',
            })
            edgeSet.add(edgeKey)
          }
        }
      }

      // Message edges
      if (event.action === 'SEND_MESSAGE' && eventData?.to) {
        const targetAgent = this.agents.find(a => a.name === eventData?.to)
        if (event.agentDid && targetAgent) {
          const edgeKey = `message:${event.agentDid}:${targetAgent.did}`
          if (!edgeSet.has(edgeKey)) {
            edges.push({
              source: event.agentDid,
              target: targetAgent.did,
              type: 'message',
              label: String(eventData?.subject || 'message'),
            })
            edgeSet.add(edgeKey)
          }
        }
      }

      // Discovery edges
      if (event.action === 'DISCOVER_AGENT' && eventData?.discoveredDid) {
        const edgeKey = `discovery:${event.agentDid}:${eventData.discoveredDid}`
        if (!edgeSet.has(edgeKey)) {
          edges.push({
            source: event.agentDid!,
            target: String(eventData.discoveredDid),
            type: 'discovery',
            label: 'discovered',
          })
          edgeSet.add(edgeKey)
        }
      }
    }

    // Add trust relationship edges
    const trustRelations = getAllTrustRelations()
    for (const trust of trustRelations) {
      const edgeKey = `trust:${trust.trustor}:${trust.trustee}`
      if (!edgeSet.has(edgeKey)) {
        edges.push({
          source: trust.trustor,
          target: trust.trustee,
          type: 'trust',
          label: trust.level,
          weight: trust.score,
        })
        edgeSet.add(edgeKey)
      }
    }

    // Add delegation edges
    const delegations = getAllDelegations()
    for (const delegation of delegations) {
      if (!delegation.revoked) {
        const edgeKey = `delegation:${delegation.delegator}:${delegation.delegate}`
        if (!edgeSet.has(edgeKey)) {
          edges.push({
            source: delegation.delegator,
            target: delegation.delegate,
            type: 'delegation',
            label: delegation.permissions.join(','),
          })
          edgeSet.add(edgeKey)
        }
      }
    }

    return { nodes, edges }
  }

  /**
   * Get statistics
   */
  getStats(): SimulationStats {
    return { ...this.stats, duration: this.getUptime() }
  }

  /**
   * Register event listener
   */
  onEvent(listener: (event: SimulationEvent) => void): () => void {
    this.eventListeners.push(listener)
    return () => {
      const index = this.eventListeners.indexOf(listener)
      if (index > -1) {
        this.eventListeners.splice(index, 1)
      }
    }
  }

  // Private methods

  /**
   * Update Prometheus metrics with current agent counts
   */
  private updatePrometheusAgentCounts(): void {
    // Count agents by role and status
    const counts: Record<string, Record<string, number>> = {
      issuer: { active: 0, idle: 0, spawning: 0, terminated: 0 },
      holder: { active: 0, idle: 0, spawning: 0, terminated: 0 },
      verifier: { active: 0, idle: 0, spawning: 0, terminated: 0 },
    }

    for (const agent of this.agents) {
      const state = agent.getState()
      const role = state.role
      const status = state.status || 'active'
      if (counts[role]) {
        counts[role][status] = (counts[role][status] || 0) + 1
      }
    }

    // Update metrics for each combination
    for (const [role, statusCounts] of Object.entries(counts)) {
      for (const [status, count] of Object.entries(statusCounts)) {
        updateAgentCount(status, 'medium', role, count)
      }
    }

    // Update capability counts
    const capabilityCounts: Record<string, number> = {}
    for (const agent of this.agents) {
      const info = agent.getDetailedInfo()
      const capabilities = (info?.capabilities as string[]) || []
      for (const cap of capabilities) {
        capabilityCounts[cap] = (capabilityCounts[cap] || 0) + 1
      }
    }

    for (const [capability, count] of Object.entries(capabilityCounts)) {
      updateCapabilityCount(capability, count)
    }
  }

  private startAutonomousLoop(): void {
    const tickDelay = this.getTickDelay()

    this.tickInterval = setInterval(async () => {
      if (this.status !== 'running') return

      // Execute one tick for each agent
      for (const agent of this.agents) {
        if (this.status !== 'running') break

        try {
          const { action, result } = await agent.tick(this.agents)

          if (action !== 'IDLE') {
            this.emitEvent({
              eventType: 'agent.action',
              agentDid: agent.did,
              agentName: agent.name,
              action: action,
              result: result.success ? 'success' : 'failed',
              data: result.data,
            })

            // Update stats
            if (result.success) {
              switch (action) {
                case 'ISSUE_CREDENTIAL':
                  this.stats.credentialsIssued++
                  break
                case 'PRESENT_CREDENTIAL':
                  this.stats.delegationsCreated++ // Legacy compatibility
                  break
                case 'VERIFY_PRESENTATION':
                  this.stats.verificationsPerformed++
                  break
                case 'SEND_MESSAGE':
                  this.stats.messagesSent++
                  break
                case 'REVOKE_CREDENTIAL':
                  this.stats.credentialsRevoked++
                  break
                case 'ESTABLISH_TRUST':
                  this.stats.trustRelationships++
                  break
                case 'CREATE_DELEGATION':
                  this.stats.delegationsCreated++
                  break
                case 'DISCOVER_AGENT':
                  this.stats.agentsDiscovered++
                  break
                case 'USE_DELEGATION':
                  this.stats.delegationChainsResolved++
                  break
              }
            }

            // Update Prometheus metrics
            recordAgentAction(action, agent.role)
            if (action === 'ISSUE_CREDENTIAL') {
              recordCredentialIssuance('AgentCredential')
            } else if (action === 'VERIFY_PRESENTATION' && result.success) {
              recordCredentialVerification('AgentCredential', result.success)
            }
          }
        } catch (error) {
          logger.error('Agent tick failed', { agent: agent.name, error })
        }
      }

      // Update agent count metrics periodically
      this.updatePrometheusAgentCounts()
    }, tickDelay)
  }

  private getTickDelay(): number {
    if (!this.config) return 1000

    switch (this.config.speed) {
      case 'slow': return 2000
      case 'normal': return 1000
      case 'fast': return 300
      default: return this.config.tickDelay || 1000
    }
  }

  private emitEvent(eventData: Partial<SimulationEvent>): void {
    const event: SimulationEvent = {
      id: uuidv4(),
      timestamp: new Date(),
      eventType: eventData.eventType || 'unknown',
      ...eventData,
    }

    this.events.unshift(event)
    this.stats.totalEvents++

    // Keep only last 500 events
    if (this.events.length > 500) {
      this.events = this.events.slice(0, 500)
    }

    // Notify listeners
    for (const listener of this.eventListeners) {
      try {
        listener(event)
      } catch (error) {
        logger.error('Event listener error', { error })
      }
    }
  }

  private getUptime(): number {
    if (!this.startedAt) return 0
    return Math.floor((Date.now() - this.startedAt.getTime()) / 1000)
  }

  private getEmptyStats(): SimulationStats {
    return {
      totalAgents: 0,
      credentialsIssued: 0,
      delegationsCreated: 0,
      trustRelationships: 0,
      verificationsPerformed: 0,
      totalEvents: 0,
      duration: 0,
      // New stats
      messagesSent: 0,
      credentialsRevoked: 0,
      agentsDiscovered: 0,
      delegationChainsResolved: 0,
    }
  }

  private reset(): void {
    // Stop existing tick loop
    if (this.tickInterval) {
      clearInterval(this.tickInterval)
      this.tickInterval = null
    }

    // Terminate existing agents
    for (const agent of this.agents) {
      agent.terminate()
    }

    // Clear simulation data
    clearSimulationData()

    this.agents = []
    this.events = []
    this.stats = this.getEmptyStats()
    this.sessionId = ''
    this.config = null
    this.startedAt = null
    this.status = 'idle'
  }
}

// Export singleton instance
export const simulationEngine = new SimulationEngine()
