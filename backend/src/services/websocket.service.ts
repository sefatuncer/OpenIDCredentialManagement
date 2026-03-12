/**
 * WebSocket Service for Real-time Events
 */

import { Server as HTTPServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { logger } from '../utils/logger'

export type EventType =
  | 'credential:issued'
  | 'credential:revoked'
  | 'credential:verified'
  | 'presentation:requested'
  | 'presentation:submitted'
  | 'trust:entity_added'
  | 'trust:entity_removed'
  | 'system:health'
  // Simulation events
  | 'simulation:started'
  | 'simulation:stopped'
  | 'simulation:paused'
  | 'simulation:resumed'
  | 'simulation:event'
  | 'simulation:network'
  | 'simulation:agent'
  // DIDComm events
  | 'didcomm:connection'
  | 'didcomm:message'

export interface WSMessage {
  type: EventType
  data: any
  timestamp: string
}

class WebSocketService {
  private wss: WebSocketServer | null = null
  private clients: Map<string, WebSocket> = new Map()

  initialize(server: HTTPServer): void {
    this.wss = new WebSocketServer({ server, path: '/ws' })

    this.wss.on('connection', (ws, req) => {
      const clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      this.clients.set(clientId, ws)

      logger.info(`WebSocket client connected: ${clientId}`)

      // Send welcome message
      this.send(ws, {
        type: 'system:health',
        data: { status: 'connected', clientId },
        timestamp: new Date().toISOString(),
      })

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString())
          this.handleMessage(clientId, data)
        } catch {
          // Ignore invalid messages
        }
      })

      ws.on('close', () => {
        this.clients.delete(clientId)
        logger.info(`WebSocket client disconnected: ${clientId}`)
      })

      ws.on('error', (error) => {
        logger.error(`WebSocket error for ${clientId}:`, error)
        this.clients.delete(clientId)
      })
    })

    logger.info('WebSocket server initialized on /ws')
  }

  private handleMessage(clientId: string, data: any): void {
    // Handle ping/pong
    if (data.type === 'ping') {
      const client = this.clients.get(clientId)
      if (client) {
        this.send(client, {
          type: 'system:health',
          data: { pong: true },
          timestamp: new Date().toISOString(),
        })
      }
    }
  }

  private send(ws: WebSocket, message: WSMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    }
  }

  broadcast(event: EventType, data: any): void {
    const message: WSMessage = {
      type: event,
      data,
      timestamp: new Date().toISOString(),
    }

    this.clients.forEach((ws) => {
      this.send(ws, message)
    })
  }

  // Event emitters
  emitCredentialIssued(credentialId: string, type: string): void {
    this.broadcast('credential:issued', { credentialId, type })
  }

  emitCredentialRevoked(credentialId: string, reason?: string): void {
    this.broadcast('credential:revoked', { credentialId, reason })
  }

  emitCredentialVerified(credentialId: string, result: boolean): void {
    this.broadcast('credential:verified', { credentialId, verified: result })
  }

  emitPresentationRequested(sessionId: string): void {
    this.broadcast('presentation:requested', { sessionId })
  }

  emitPresentationSubmitted(sessionId: string, verified: boolean): void {
    this.broadcast('presentation:submitted', { sessionId, verified })
  }

  emitTrustEntityAdded(did: string, name: string): void {
    this.broadcast('trust:entity_added', { did, name })
  }

  emitTrustEntityRemoved(did: string): void {
    this.broadcast('trust:entity_removed', { did })
  }

  getConnectedClients(): number {
    return this.clients.size
  }

  close(): void {
    this.clients.forEach((ws) => ws.close())
    this.clients.clear()
    this.wss?.close()
  }
}

export const wsService = new WebSocketService()
