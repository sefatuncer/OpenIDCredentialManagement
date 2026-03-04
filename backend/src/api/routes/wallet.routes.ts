/**
 * Wallet Routes
 * API endpoints for agent wallet management
 */

import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { validateBody } from '../middleware/validation.middleware'
import { asyncHandler } from '../middleware/error.middleware'
import * as agentService from '../../services/agent.service'
import { logger } from '../../utils/logger'

export const walletRoutes = Router()

// Validation schemas
const requestBasicCredentialSchema = z.object({
  securityDomain: z.string().optional(),
})

const requestRichCredentialSchema = z.object({
  roles: z.array(z.string()).min(1),
  capabilities: z.array(z.string()).min(1),
})

/**
 * @swagger
 * /wallet/{did}:
 *   get:
 *     summary: Get agent wallet
 *     tags: [Wallet]
 *     parameters:
 *       - in: path
 *         name: did
 *         required: true
 *         schema:
 *           type: string
 *         description: Agent DID
 *     responses:
 *       200:
 *         description: Agent wallet details
 *       404:
 *         description: Agent not found
 */
walletRoutes.get(
  '/:did',
  asyncHandler(async (req: Request, res: Response) => {
    const { did } = req.params
    const wallet = await agentService.getAgentWallet(decodeURIComponent(did))

    if (!wallet) {
      res.status(404).json({ error: 'not_found', message: 'Agent wallet not found' })
      return
    }

    res.json({
      identity: {
        id: wallet.identity.id,
        did: wallet.identity.did,
        name: wallet.identity.name,
        type: wallet.identity.type,
        status: wallet.identity.status,
        trustLevel: wallet.identity.trustLevel,
      },
      keys: wallet.keys,
      credentials: wallet.credentials,
      trustedAgents: wallet.trustedAgents,
      activityLog: wallet.activityLog,
    })
  })
)

/**
 * @swagger
 * /wallet/{did}/credentials/basic:
 *   post:
 *     summary: Request a Basic Agent Credential
 *     tags: [Wallet]
 *     parameters:
 *       - in: path
 *         name: did
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               securityDomain:
 *                 type: string
 *                 example: "enterprise-domain"
 *     responses:
 *       201:
 *         description: Basic credential issued
 *       404:
 *         description: Agent not found
 */
walletRoutes.post(
  '/:did/credentials/basic',
  validateBody(requestBasicCredentialSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { did } = req.params
    const { securityDomain } = req.body

    try {
      const credential = await agentService.requestBasicCredential(
        decodeURIComponent(did),
        securityDomain
      )

      logger.info('Basic credential issued via API', { did })

      res.status(201).json({
        success: true,
        credential,
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'Agent not found') {
        res.status(404).json({ error: 'not_found', message: 'Agent not found' })
        return
      }
      throw error
    }
  })
)

/**
 * @swagger
 * /wallet/{did}/credentials/rich:
 *   post:
 *     summary: Request a Rich Agent Credential
 *     tags: [Wallet]
 *     parameters:
 *       - in: path
 *         name: did
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roles, capabilities]
 *             properties:
 *               roles:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["data-analyst", "report-generator"]
 *               capabilities:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["read-data", "generate-reports"]
 *     responses:
 *       201:
 *         description: Rich credential issued
 *       404:
 *         description: Agent not found
 */
walletRoutes.post(
  '/:did/credentials/rich',
  validateBody(requestRichCredentialSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { did } = req.params
    const { roles, capabilities } = req.body

    try {
      const credential = await agentService.requestRichCredential(
        decodeURIComponent(did),
        roles,
        capabilities
      )

      logger.info('Rich credential issued via API', { did, roles })

      res.status(201).json({
        success: true,
        credential,
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'Agent not found') {
        res.status(404).json({ error: 'not_found', message: 'Agent not found' })
        return
      }
      throw error
    }
  })
)

/**
 * @swagger
 * /wallet/{did}/activity:
 *   get:
 *     summary: Get agent activity log
 *     tags: [Wallet]
 *     parameters:
 *       - in: path
 *         name: did
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Activity log
 *       404:
 *         description: Agent not found
 */
walletRoutes.get(
  '/:did/activity',
  asyncHandler(async (req: Request, res: Response) => {
    const { did } = req.params
    const wallet = await agentService.getAgentWallet(decodeURIComponent(did))

    if (!wallet) {
      res.status(404).json({ error: 'not_found', message: 'Agent not found' })
      return
    }

    res.json({
      activityLog: wallet.activityLog,
    })
  })
)
