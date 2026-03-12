/**
 * DIDComm Service — Agent-to-Agent Messaging
 *
 * Wrapper around Credo-TS DIDComm module for connections,
 * basic messages, and OOB invitations.
 *
 * Feature-flag gated: module.didcomm
 */

import { getCredoAgent, isCredoAgentReady } from '../agents/credo.agent'
import { isFeatureEnabled } from '../core/feature-flags'
import { logger } from '../utils/logger'

// --- Types ---

export interface DIDCommConnection {
  id: string
  state: string
  role: string
  theirDid?: string
  theirLabel?: string
  createdAt: string
  updatedAt: string
}

export interface DIDCommMessage {
  id: string
  connectionId: string
  content: string
  sentTime: string
  role: 'sender' | 'receiver'
}

export interface DIDCommInvitation {
  invitationUrl: string
  outOfBandId: string
}

// --- Public API ---

/**
 * Check if DIDComm is enabled and agent is ready
 */
export function isDidCommEnabled(): boolean {
  return isFeatureEnabled('module.didcomm') && isCredoAgentReady()
}

/**
 * Create an OOB invitation for DIDComm connection
 */
export async function createDidCommInvitation(): Promise<DIDCommInvitation> {
  const agent = requireAgent()

  try {
    const oobApi = agent.modules.didComm.outOfBand
    const invitation = await oobApi.createInvitation({})

    const invitationUrl = invitation.outOfBandInvitation.toUrl({
      domain: process.env.ISSUER_BASE_URL || 'http://localhost:3000',
    })

    logger.info('DIDComm invitation created', { outOfBandId: invitation.id })

    return {
      invitationUrl,
      outOfBandId: invitation.id,
    }
  } catch (err) {
    logger.error('Failed to create DIDComm invitation', { error: (err as Error).message })
    throw err
  }
}

/**
 * Receive and accept an OOB invitation
 */
export async function receiveDidCommInvitation(
  invitationUrl: string,
): Promise<{ connectionId: string; state: string }> {
  const agent = requireAgent()

  try {
    const oobApi = agent.modules.didComm.outOfBand
    const { connectionRecord } = await oobApi.receiveInvitationFromUrl(invitationUrl)

    if (!connectionRecord) {
      throw new Error('No connection record created from invitation')
    }

    logger.info('DIDComm invitation received', {
      connectionId: connectionRecord.id,
      state: connectionRecord.state,
    })

    return {
      connectionId: connectionRecord.id,
      state: connectionRecord.state,
    }
  } catch (err) {
    logger.error('Failed to receive DIDComm invitation', { error: (err as Error).message })
    throw err
  }
}

/**
 * List all DIDComm connections
 */
export async function getDidCommConnections(): Promise<DIDCommConnection[]> {
  const agent = requireAgent()

  try {
    const connectionsApi = agent.modules.didComm.connections
    const records = await connectionsApi.getAll()

    return records.map(mapConnection)
  } catch (err) {
    logger.error('Failed to get DIDComm connections', { error: (err as Error).message })
    throw err
  }
}

/**
 * Get a single DIDComm connection by ID
 */
export async function getDidCommConnection(connectionId: string): Promise<DIDCommConnection | null> {
  const agent = requireAgent()

  try {
    const connectionsApi = agent.modules.didComm.connections
    const record = await connectionsApi.findById(connectionId)
    return record ? mapConnection(record) : null
  } catch (err) {
    logger.error('Failed to get DIDComm connection', { connectionId, error: (err as Error).message })
    throw err
  }
}

/**
 * Send a basic message over DIDComm
 */
export async function sendBasicMessage(
  connectionId: string,
  content: string,
): Promise<{ messageId: string }> {
  const agent = requireAgent()

  try {
    const basicMessagesApi = agent.modules.didComm.basicMessages
    const record = await basicMessagesApi.sendMessage(connectionId, content)

    logger.info('DIDComm message sent', { connectionId, messageId: record.id })

    return { messageId: record.id }
  } catch (err) {
    logger.error('Failed to send DIDComm message', { connectionId, error: (err as Error).message })
    throw err
  }
}

/**
 * Get basic messages for a connection
 */
export async function getBasicMessages(connectionId: string): Promise<DIDCommMessage[]> {
  const agent = requireAgent()

  try {
    const basicMessagesApi = agent.modules.didComm.basicMessages
    const records = await basicMessagesApi.findAllByQuery({ connectionId })

    return records.map((record: any) => ({
      id: record.id,
      connectionId: record.connectionId,
      content: record.content,
      sentTime: record.sentTime || record.createdAt?.toISOString() || new Date().toISOString(),
      role: record.role as 'sender' | 'receiver',
    }))
  } catch (err) {
    logger.error('Failed to get DIDComm messages', { connectionId, error: (err as Error).message })
    throw err
  }
}

// --- Internal helpers ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function requireAgent(): any {
  if (!isDidCommEnabled()) {
    throw new Error('DIDComm is not enabled')
  }

  const agent = getCredoAgent()
  if (!agent) {
    throw new Error('Credo agent not available')
  }

  if (!agent.modules.didComm) {
    throw new Error('DIDComm module not loaded in Credo agent')
  }

  return agent
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapConnection(record: any): DIDCommConnection {
  return {
    id: record.id,
    state: record.state,
    role: record.role,
    theirDid: record.theirDid,
    theirLabel: record.theirLabel,
    createdAt: record.createdAt?.toISOString() || new Date().toISOString(),
    updatedAt: record.updatedAt?.toISOString() || new Date().toISOString(),
  }
}
