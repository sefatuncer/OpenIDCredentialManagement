/**
 * Agent Capability Discovery Service
 *
 * Enables agents to discover each other's capabilities
 */

import { logger } from '../utils/logger'

export interface AgentCapability {
  id: string
  name: string
  version: string
  description: string
  inputSchema?: Record<string, any>
  outputSchema?: Record<string, any>
  requiredPermissions?: string[]
}

export interface AgentProfile {
  did: string
  name: string
  type: 'issuer' | 'verifier' | 'holder' | 'gateway'
  version: string
  capabilities: AgentCapability[]
  endpoints: {
    base: string
    openid4vci?: string
    openid4vp?: string
    didResolution?: string
    ws?: string
  }
  supportedProtocols: string[]
  supportedCredentialTypes: string[]
  metadata: Record<string, any>
  lastSeen: Date
}

// Well-known capabilities
export const WELL_KNOWN_CAPABILITIES: Record<string, AgentCapability> = {
  'credential:issue': {
    id: 'credential:issue',
    name: 'Credential Issuance',
    version: '1.0',
    description: 'Issue verifiable credentials',
    requiredPermissions: ['issue:credentials'],
  },
  'credential:verify': {
    id: 'credential:verify',
    name: 'Credential Verification',
    version: '1.0',
    description: 'Verify credential presentations',
    requiredPermissions: ['verify:presentations'],
  },
  'credential:hold': {
    id: 'credential:hold',
    name: 'Credential Holding',
    version: '1.0',
    description: 'Store and present credentials',
  },
  'did:resolve': {
    id: 'did:resolve',
    name: 'DID Resolution',
    version: '1.0',
    description: 'Resolve DIDs to DID documents',
  },
  'openid4vci': {
    id: 'openid4vci',
    name: 'OpenID4VCI',
    version: '1.0',
    description: 'OpenID for Verifiable Credential Issuance',
  },
  'openid4vp': {
    id: 'openid4vp',
    name: 'OpenID4VP',
    version: '1.0',
    description: 'OpenID for Verifiable Presentations',
  },
  'sdjwt': {
    id: 'sdjwt',
    name: 'SD-JWT',
    version: '1.0',
    description: 'Selective Disclosure JWT support',
  },
  'revocation': {
    id: 'revocation',
    name: 'Credential Revocation',
    version: '1.0',
    description: 'Check and manage credential revocation status',
  },
}

class CapabilityDiscoveryService {
  private agents: Map<string, AgentProfile> = new Map()
  private localProfile: AgentProfile | null = null

  // Set local agent profile
  setLocalProfile(profile: AgentProfile): void {
    this.localProfile = profile
    this.agents.set(profile.did, profile)
    logger.info(`Local agent profile set: ${profile.did}`)
  }

  // Get local agent profile
  getLocalProfile(): AgentProfile | null {
    return this.localProfile
  }

  // Register a remote agent
  registerAgent(profile: AgentProfile): void {
    profile.lastSeen = new Date()
    this.agents.set(profile.did, profile)
    logger.info(`Agent registered: ${profile.did} (${profile.name})`)
  }

  // Unregister an agent
  unregisterAgent(did: string): boolean {
    const result = this.agents.delete(did)
    if (result) {
      logger.info(`Agent unregistered: ${did}`)
    }
    return result
  }

  // Get agent by DID
  getAgent(did: string): AgentProfile | undefined {
    return this.agents.get(did)
  }

  // Get all registered agents
  getAllAgents(): AgentProfile[] {
    return Array.from(this.agents.values())
  }

  // Find agents by capability
  findAgentsByCapability(capabilityId: string): AgentProfile[] {
    return this.getAllAgents().filter((agent) =>
      agent.capabilities.some((cap) => cap.id === capabilityId)
    )
  }

  // Find agents by type
  findAgentsByType(type: AgentProfile['type']): AgentProfile[] {
    return this.getAllAgents().filter((agent) => agent.type === type)
  }

  // Find issuers for a credential type
  findIssuersForCredentialType(credentialType: string): AgentProfile[] {
    return this.getAllAgents().filter(
      (agent) =>
        agent.type === 'issuer' && agent.supportedCredentialTypes.includes(credentialType)
    )
  }

  // Find verifiers supporting a protocol
  findVerifiersByProtocol(protocol: string): AgentProfile[] {
    return this.getAllAgents().filter(
      (agent) => agent.type === 'verifier' && agent.supportedProtocols.includes(protocol)
    )
  }

  // Check if an agent has a specific capability
  hasCapability(did: string, capabilityId: string): boolean {
    const agent = this.agents.get(did)
    if (!agent) return false
    return agent.capabilities.some((cap) => cap.id === capabilityId)
  }

  // Get agent's capabilities
  getCapabilities(did: string): AgentCapability[] {
    const agent = this.agents.get(did)
    return agent?.capabilities || []
  }

  // Update agent's last seen timestamp
  updateLastSeen(did: string): void {
    const agent = this.agents.get(did)
    if (agent) {
      agent.lastSeen = new Date()
    }
  }

  // Get stale agents (not seen recently)
  getStaleAgents(maxAgeMinutes: number = 30): AgentProfile[] {
    const threshold = new Date(Date.now() - maxAgeMinutes * 60 * 1000)
    return this.getAllAgents().filter((agent) => agent.lastSeen < threshold)
  }

  // Remove stale agents
  pruneStaleAgents(maxAgeMinutes: number = 60): number {
    const stale = this.getStaleAgents(maxAgeMinutes)
    for (const agent of stale) {
      if (agent.did !== this.localProfile?.did) {
        this.agents.delete(agent.did)
      }
    }
    if (stale.length > 0) {
      logger.info(`Pruned ${stale.length} stale agents`)
    }
    return stale.length
  }

  // Create well-known endpoint response
  getWellKnownDiscovery(): {
    agent: AgentProfile | null
    capabilities: AgentCapability[]
    supportedProtocols: string[]
    supportedCredentialTypes: string[]
  } {
    return {
      agent: this.localProfile,
      capabilities: this.localProfile?.capabilities || [],
      supportedProtocols: this.localProfile?.supportedProtocols || [],
      supportedCredentialTypes: this.localProfile?.supportedCredentialTypes || [],
    }
  }

  // Statistics
  getStats(): {
    totalAgents: number
    byType: Record<string, number>
    byCapability: Record<string, number>
  } {
    const byType: Record<string, number> = {}
    const byCapability: Record<string, number> = {}

    for (const agent of this.getAllAgents()) {
      byType[agent.type] = (byType[agent.type] || 0) + 1

      for (const cap of agent.capabilities) {
        byCapability[cap.id] = (byCapability[cap.id] || 0) + 1
      }
    }

    return {
      totalAgents: this.agents.size,
      byType,
      byCapability,
    }
  }
}

export const capabilityDiscovery = new CapabilityDiscoveryService()
