/**
 * Agent Routes
 * API endpoints for AI agent management
 */

import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { validateBody } from '../middleware/validation.middleware'
import { asyncHandler } from '../middleware/error.middleware'
import * as agentService from '../../services/agent.service'
import { logger } from '../../utils/logger'

export const agentRoutes = Router()

// Validation schemas
const createAgentSchema = z.object({
  did: z.string().regex(/^did:(key|web|peer):[a-zA-Z0-9._%-]+$/, 'Invalid DID format').optional(),
  name: z.string().min(1).max(255),
  type: z.enum(['autonomous', 'semi-autonomous', 'assistant', 'service', 'orchestrator']),
  owner: z.object({
    did: z.string().optional(),
    name: z.string().optional(),
    type: z.enum(['human', 'organization', 'agent']).optional(),
  }).optional(),
  capabilities: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
})

const updateAgentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  trustLevel: z.enum(['low', 'medium', 'high', 'verified']).optional(),
  metadata: z.record(z.unknown()).optional(),
})

/**
 * @swagger
 * /agents/register:
 *   post:
 *     summary: Register a new AI agent
 *     description: |
 *       Register a new AI agent in the system. Agent can provide their own DID
 *       (did:key, did:web, or did:peer) or system will generate one.
 *     tags: [Agents]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, type]
 *             properties:
 *               did:
 *                 type: string
 *                 description: Agent's DID (optional - system generates if not provided)
 *                 example: "did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH"
 *               name:
 *                 type: string
 *                 example: "Data Analysis Agent"
 *               type:
 *                 type: string
 *                 enum: [autonomous, semi-autonomous, assistant, service, orchestrator]
 *               owner:
 *                 type: object
 *                 properties:
 *                   did: { type: string }
 *                   name: { type: string }
 *                   type: { type: string, enum: [human, organization, agent] }
 *               capabilities:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["text-generation", "code-analysis"]
 *               metadata:
 *                 type: object
 *     responses:
 *       201:
 *         description: Agent registered successfully
 *       400:
 *         description: Validation error or invalid DID format
 *       409:
 *         description: DID already registered
 */
agentRoutes.post(
  '/register',
  validateBody(createAgentSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const agent = await agentService.registerAgent(req.body)

    logger.info('Agent registered via API', { did: agent.did })

    res.status(201).json({
      success: true,
      agent: {
        id: agent.id,
        did: agent.did,
        name: agent.name,
        type: agent.type,
        status: agent.status,
        trustLevel: agent.trustLevel,
        owner: agent.ownerDid ? {
          did: agent.ownerDid,
          name: agent.ownerName,
          type: agent.ownerType,
        } : null,
        metadata: agent.metadata,
        createdAt: agent.createdAt,
      },
    })
  })
)

/**
 * @swagger
 * /agents/{did}:
 *   get:
 *     summary: Get agent by DID
 *     tags: [Agents]
 *     parameters:
 *       - in: path
 *         name: did
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Agent details
 *       404:
 *         description: Agent not found
 */
agentRoutes.get(
  '/:did',
  asyncHandler(async (req: Request, res: Response) => {
    const { did } = req.params
    const agent = await agentService.getAgentByDid(decodeURIComponent(did))

    if (!agent) {
      res.status(404).json({ error: 'not_found', message: 'Agent not found' })
      return
    }

    res.json({
      id: agent.id,
      did: agent.did,
      name: agent.name,
      type: agent.type,
      status: agent.status,
      trustLevel: agent.trustLevel,
      owner: agent.ownerDid ? {
        did: agent.ownerDid,
        name: agent.ownerName,
        type: agent.ownerType,
      } : null,
      metadata: agent.metadata,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
    })
  })
)

/**
 * @swagger
 * /agents/{did}:
 *   patch:
 *     summary: Update agent
 *     tags: [Agents]
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
 *               name: { type: string }
 *               status: { type: string, enum: [active, suspended] }
 *               trustLevel: { type: string, enum: [low, medium, high, verified] }
 *               metadata: { type: object }
 *     responses:
 *       200:
 *         description: Agent updated
 *       404:
 *         description: Agent not found
 */
agentRoutes.patch(
  '/:did',
  validateBody(updateAgentSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { did } = req.params
    const agent = await agentService.updateAgent(decodeURIComponent(did), req.body)

    if (!agent) {
      res.status(404).json({ error: 'not_found', message: 'Agent not found' })
      return
    }

    res.json({ success: true, agent })
  })
)

/**
 * @swagger
 * /agents/{did}:
 *   delete:
 *     summary: Delete agent
 *     tags: [Agents]
 *     parameters:
 *       - in: path
 *         name: did
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Agent deleted
 *       404:
 *         description: Agent not found
 */
agentRoutes.delete(
  '/:did',
  asyncHandler(async (req: Request, res: Response) => {
    const { did } = req.params
    const deleted = await agentService.deleteAgent(decodeURIComponent(did))

    if (!deleted) {
      res.status(404).json({ error: 'not_found', message: 'Agent not found' })
      return
    }

    res.json({ success: true, message: 'Agent deleted successfully' })
  })
)

/**
 * @swagger
 * /agents:
 *   get:
 *     summary: List all agents
 *     tags: [Agents]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, suspended, revoked]
 *     responses:
 *       200:
 *         description: List of agents
 */
agentRoutes.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100)
    const offset = parseInt(req.query.offset as string) || 0
    const status = req.query.status as string | undefined

    const result = await agentService.listAgents(limit, offset, status)

    res.json({
      agents: result.agents,
      total: result.total,
      limit,
      offset,
    })
  })
)

/**
 * @swagger
 * /agents/{did}/activity:
 *   get:
 *     summary: Get agent activity log
 *     description: Returns the activity history for an agent
 *     tags: [Agents]
 *     parameters:
 *       - in: path
 *         name: did
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Agent activity log
 *       404:
 *         description: Agent not found
 */
agentRoutes.get(
  '/:did/activity',
  asyncHandler(async (req: Request, res: Response) => {
    const { did } = req.params
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100)

    const wallet = await agentService.getAgentWallet(decodeURIComponent(did))
    if (!wallet) {
      res.status(404).json({ error: 'not_found', message: 'Agent not found' })
      return
    }

    res.json({
      agent: did,
      activities: wallet.activityLog.slice(0, limit),
    })
  })
)

/**
 * @swagger
 * /agents/{did}/capabilities/revoke:
 *   post:
 *     summary: Revoke agent capabilities
 *     description: Remove specific capabilities from an agent
 *     tags: [Agents]
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
 *             required: [capabilities]
 *             properties:
 *               capabilities:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["code-execution", "network-access"]
 *               reason:
 *                 type: string
 *                 example: "security_concern"
 *     responses:
 *       200:
 *         description: Capabilities revoked
 *       404:
 *         description: Agent not found
 */
agentRoutes.post(
  '/:did/capabilities/revoke',
  asyncHandler(async (req: Request, res: Response) => {
    const { did } = req.params
    const { capabilities, reason } = req.body

    const agent = await agentService.getAgentByDid(decodeURIComponent(did))
    if (!agent) {
      res.status(404).json({ error: 'not_found', message: 'Agent not found' })
      return
    }

    // Get current capabilities from metadata
    const currentCaps = (agent.metadata?.capabilities as string[]) || []
    const newCaps = currentCaps.filter((c: string) => !capabilities.includes(c))

    // Update agent metadata
    await agentService.updateAgent(decodeURIComponent(did), {
      metadata: { ...agent.metadata, capabilities: newCaps },
    })

    // Log activity
    await agentService.logAgentActivity(
      agent.id,
      'capabilities_revoked',
      'success',
      undefined,
      { revokedCapabilities: capabilities, reason }
    )

    logger.info('Agent capabilities revoked', { did, capabilities, reason })

    res.json({
      success: true,
      message: 'Capabilities revoked successfully',
      revokedCapabilities: capabilities,
      remainingCapabilities: newCaps,
    })
  })
)

/**
 * @swagger
 * /agents/{did}/trust/downgrade:
 *   post:
 *     summary: Downgrade agent trust level
 *     description: Lower the trust level of an agent
 *     tags: [Agents]
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
 *             required: [newTrustLevel]
 *             properties:
 *               newTrustLevel:
 *                 type: string
 *                 enum: [low, medium, high, verified]
 *               reason:
 *                 type: string
 *                 example: "policy_violation"
 *     responses:
 *       200:
 *         description: Trust level updated
 *       400:
 *         description: Cannot upgrade trust level via this endpoint
 *       404:
 *         description: Agent not found
 */
agentRoutes.post(
  '/:did/trust/downgrade',
  asyncHandler(async (req: Request, res: Response) => {
    const { did } = req.params
    const { newTrustLevel, reason } = req.body

    const agent = await agentService.getAgentByDid(decodeURIComponent(did))
    if (!agent) {
      res.status(404).json({ error: 'not_found', message: 'Agent not found' })
      return
    }

    // Trust level hierarchy
    const levels = ['low', 'medium', 'high', 'verified']
    const currentIndex = levels.indexOf(agent.trustLevel)
    const newIndex = levels.indexOf(newTrustLevel)

    if (newIndex >= currentIndex) {
      res.status(400).json({
        error: 'invalid_operation',
        message: 'This endpoint can only downgrade trust level, not upgrade',
      })
      return
    }

    // Update trust level
    await agentService.updateAgent(decodeURIComponent(did), {
      trustLevel: newTrustLevel,
    })

    // Log activity
    await agentService.logAgentActivity(
      agent.id,
      'trust_downgraded',
      'success',
      undefined,
      { previousLevel: agent.trustLevel, newLevel: newTrustLevel, reason }
    )

    logger.info('Agent trust level downgraded', {
      did,
      from: agent.trustLevel,
      to: newTrustLevel,
      reason,
    })

    res.json({
      success: true,
      message: 'Trust level downgraded',
      previousTrustLevel: agent.trustLevel,
      newTrustLevel,
    })
  })
)

/**
 * @swagger
 * /agents/{did}/emergency-stop:
 *   post:
 *     summary: Emergency stop an agent
 *     description: Immediately suspend an agent and revoke all credentials
 *     tags: [Agents]
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
 *               reason:
 *                 type: string
 *                 example: "suspicious_behavior"
 *     responses:
 *       200:
 *         description: Agent stopped
 *       404:
 *         description: Agent not found
 */
agentRoutes.post(
  '/:did/emergency-stop',
  asyncHandler(async (req: Request, res: Response) => {
    const { did } = req.params
    const { reason } = req.body

    const agent = await agentService.getAgentByDid(decodeURIComponent(did))
    if (!agent) {
      res.status(404).json({ error: 'not_found', message: 'Agent not found' })
      return
    }

    // Suspend agent immediately
    await agentService.updateAgent(decodeURIComponent(did), {
      status: 'suspended',
      metadata: {
        ...agent.metadata,
        emergencyStop: true,
        emergencyStopAt: new Date().toISOString(),
        emergencyStopReason: reason || 'No reason provided',
        capabilities: [], // Remove all capabilities
      },
    })

    // Log activity
    await agentService.logAgentActivity(
      agent.id,
      'emergency_stop',
      'success',
      undefined,
      { reason, previousStatus: agent.status }
    )

    logger.warn('Agent emergency stopped', { did, reason })

    res.json({
      success: true,
      message: 'Agent has been emergency stopped',
      agent: {
        did,
        status: 'suspended',
        emergencyStop: true,
      },
    })
  })
)
