/**
 * DIDComm API Routes
 *
 * Agent-to-agent messaging: connections, invitations, basic messages.
 * Feature-flag gated: module.didcomm
 */

import { Router, Request, Response } from 'express'
import { isFeatureEnabled } from '../../core/feature-flags'
import { asyncHandler } from '../middleware/error.middleware'
import {
  createDidCommInvitation,
  receiveDidCommInvitation,
  getDidCommConnections,
  getDidCommConnection,
  sendBasicMessage,
  getBasicMessages,
} from '../../services/didcomm.service'

export const didcommRoutes = Router()

/**
 * Check if DIDComm is enabled
 */
function requireDidComm(_req: Request, res: Response, next: () => void): void {
  if (!isFeatureEnabled('module.didcomm')) {
    res.status(404).json({ error: 'DIDComm is not enabled' })
    return
  }
  next()
}

didcommRoutes.use(requireDidComm)

/**
 * POST /api/v1/didcomm/invitations — Create OOB invitation
 */
didcommRoutes.post(
  '/invitations',
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await createDidCommInvitation()
    res.status(201).json(result)
  }),
)

/**
 * POST /api/v1/didcomm/invitations/receive — Receive/accept invitation
 */
didcommRoutes.post(
  '/invitations/receive',
  asyncHandler(async (req: Request, res: Response) => {
    const { invitationUrl } = req.body as { invitationUrl?: string }
    if (!invitationUrl || typeof invitationUrl !== 'string') {
      res.status(400).json({ error: 'invitationUrl is required' })
      return
    }
    const result = await receiveDidCommInvitation(invitationUrl)
    res.json(result)
  }),
)

/**
 * GET /api/v1/didcomm/connections — List connections
 */
didcommRoutes.get(
  '/connections',
  asyncHandler(async (_req: Request, res: Response) => {
    const connections = await getDidCommConnections()
    res.json({ connections })
  }),
)

/**
 * GET /api/v1/didcomm/connections/:id — Connection detail
 */
didcommRoutes.get(
  '/connections/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const connection = await getDidCommConnection(req.params.id)
    if (!connection) {
      res.status(404).json({ error: 'Connection not found' })
      return
    }
    res.json(connection)
  }),
)

/**
 * POST /api/v1/didcomm/connections/:id/messages — Send basic message
 */
didcommRoutes.post(
  '/connections/:id/messages',
  asyncHandler(async (req: Request, res: Response) => {
    const { content } = req.body as { content?: string }
    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'content is required' })
      return
    }
    const result = await sendBasicMessage(req.params.id, content)
    res.status(201).json(result)
  }),
)

/**
 * GET /api/v1/didcomm/connections/:id/messages — Get message history
 */
didcommRoutes.get(
  '/connections/:id/messages',
  asyncHandler(async (req: Request, res: Response) => {
    const messages = await getBasicMessages(req.params.id)
    res.json({ messages })
  }),
)
