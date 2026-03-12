/**
 * Agent Capability Discovery Service
 *
 * Enables agents to discover each other's capabilities
 * Storage: PostgreSQL via IStorageAdapter (agent_profiles collection)
 */

import { logger } from '../utils/logger'
import { createStorageAdapter, IStorageAdapter } from '../core/storage'

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

// Lazy storage initialization
let agentStorage: IStorageAdapter<AgentProfile> | null = null

function getAgentStorage(): IStorageAdapter<AgentProfile> {
  if (!agentStorage) {
    agentStorage = createStorageAdapter<AgentProfile>('agent_profiles')
  }
  return agentStorage
}

class CapabilityDiscoveryService {
  private localProfile: AgentProfile | null = null

  async setLocalProfile(profile: AgentProfile): Promise<void> {
    this.localProfile = profile
    await getAgentStorage().save(profile.did, profile)
    logger.info(`Local agent profile set: ${profile.did}`)
  }

  getLocalProfile(): AgentProfile | null {
    return this.localProfile
  }

  async registerAgent(profile: AgentProfile): Promise<void> {
    profile.lastSeen = new Date()
    await getAgentStorage().save(profile.did, profile)
    logger.info(`Agent registered: ${profile.did} (${profile.name})`)
  }

  async unregisterAgent(did: string): Promise<boolean> {
    const result = await getAgentStorage().delete(did)
    if (result) {
      logger.info(`Agent unregistered: ${did}`)
    }
    return result
  }

  async getAgent(did: string): Promise<AgentProfile | null> {
    return getAgentStorage().get(did)
  }

  async getAllAgents(): Promise<AgentProfile[]> {
    return getAgentStorage().list()
  }

  async findAgentsByCapability(capabilityId: string): Promise<AgentProfile[]> {
    const agents = await this.getAllAgents()
    return agents.filter((agent) =>
      agent.capabilities.some((cap) => cap.id === capabilityId)
    )
  }

  async findAgentsByType(type: AgentProfile['type']): Promise<AgentProfile[]> {
    const agents = await this.getAllAgents()
    return agents.filter((agent) => agent.type === type)
  }

  async findIssuersForCredentialType(credentialType: string): Promise<AgentProfile[]> {
    const agents = await this.getAllAgents()
    return agents.filter(
      (agent) =>
        agent.type === 'issuer' && agent.supportedCredentialTypes.includes(credentialType)
    )
  }

  async findVerifiersByProtocol(protocol: string): Promise<AgentProfile[]> {
    const agents = await this.getAllAgents()
    return agents.filter(
      (agent) => agent.type === 'verifier' && agent.supportedProtocols.includes(protocol)
    )
  }

  async hasCapability(did: string, capabilityId: string): Promise<boolean> {
    const agent = await getAgentStorage().get(did)
    if (!agent) return false
    return agent.capabilities.some((cap) => cap.id === capabilityId)
  }

  async getCapabilities(did: string): Promise<AgentCapability[]> {
    const agent = await getAgentStorage().get(did)
    return agent?.capabilities || []
  }

  async updateLastSeen(did: string): Promise<void> {
    const agent = await getAgentStorage().get(did)
    if (agent) {
      agent.lastSeen = new Date()
      await getAgentStorage().save(did, agent)
    }
  }

  async getStaleAgents(maxAgeMinutes: number = 30): Promise<AgentProfile[]> {
    const threshold = new Date(Date.now() - maxAgeMinutes * 60 * 1000)
    const agents = await this.getAllAgents()
    return agents.filter((agent) => new Date(agent.lastSeen) < threshold)
  }

  async pruneStaleAgents(maxAgeMinutes: number = 60): Promise<number> {
    const stale = await this.getStaleAgents(maxAgeMinutes)
    const storage = getAgentStorage()
    for (const agent of stale) {
      if (agent.did !== this.localProfile?.did) {
        await storage.delete(agent.did)
      }
    }
    if (stale.length > 0) {
      logger.info(`Pruned ${stale.length} stale agents`)
    }
    return stale.length
  }

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

  async getStats(): Promise<{
    totalAgents: number
    byType: Record<string, number>
    byCapability: Record<string, number>
  }> {
    const agents = await this.getAllAgents()
    const byType: Record<string, number> = {}
    const byCapability: Record<string, number> = {}

    for (const agent of agents) {
      byType[agent.type] = (byType[agent.type] || 0) + 1

      for (const cap of agent.capabilities) {
        byCapability[cap.id] = (byCapability[cap.id] || 0) + 1
      }
    }

    return {
      totalAgents: agents.length,
      byType,
      byCapability,
    }
  }
}

export const capabilityDiscovery = new CapabilityDiscoveryService()
