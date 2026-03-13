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
 * @swagger
 * /api/v1/didcomm/invitations:
 *   post:
 *     summary: Create OOB invitation
 *     tags: [DIDComm]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       201:
 *         description: Out-of-band invitation created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 invitationUrl:
 *                   type: string
 *                 outOfBandId:
 *                   type: string
 *       404:
 *         description: DIDComm not enabled
 */
didcommRoutes.post(
  '/invitations',
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await createDidCommInvitation()
    res.status(201).json(result)
  }),
)

/**
 * @swagger
 * /api/v1/didcomm/invitations/receive:
 *   post:
 *     summary: Receive/accept an OOB invitation
 *     tags: [DIDComm]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [invitationUrl]
 *             properties:
 *               invitationUrl:
 *                 type: string
 *     responses:
 *       200:
 *         description: Invitation accepted, connection initiated
 *       400:
 *         description: Invalid invitation URL
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
 * @swagger
 * /api/v1/didcomm/connections:
 *   get:
 *     summary: List DIDComm connections
 *     tags: [DIDComm]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of connections
 */
didcommRoutes.get(
  '/connections',
  asyncHandler(async (_req: Request, res: Response) => {
    const connections = await getDidCommConnections()
    res.json({ connections })
  }),
)

/**
 * @swagger
 * /api/v1/didcomm/connections/{id}:
 *   get:
 *     summary: Get connection detail
 *     tags: [DIDComm]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Connection details
 *       404:
 *         description: Connection not found
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
 * @swagger
 * /api/v1/didcomm/connections/{id}/messages:
 *   post:
 *     summary: Send a basic message
 *     tags: [DIDComm]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       201:
 *         description: Message sent
 *       400:
 *         description: Missing content
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
 * @swagger
 * /api/v1/didcomm/connections/{id}/messages:
 *   get:
 *     summary: Get message history for a connection
 *     tags: [DIDComm]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Message history
 */
didcommRoutes.get(
  '/connections/:id/messages',
  asyncHandler(async (req: Request, res: Response) => {
    const messages = await getBasicMessages(req.params.id)
    res.json({ messages })
  }),
)
