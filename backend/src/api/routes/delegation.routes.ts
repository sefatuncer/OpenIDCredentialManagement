/**
 * Delegation Routes
 * API endpoints for delegation management between agents
 */

import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { validateBody } from '../middleware/validation.middleware'
import { asyncHandler } from '../middleware/error.middleware'
import * as delegationService from '../../services/delegation.service'
import { subDelegationSchema } from '../schemas/validation.schemas'
import { logger } from '../../utils/logger'

export const delegationRoutes = Router()

// Validation schemas
const createDelegationSchema = z.object({
  delegatorDid: z.string().min(1),
  delegateeToDid: z.string().min(1),
  scope: z.object({
    actions: z.array(z.string()).min(1),
    resources: z.array(z.string()).min(1),
    constraints: z.record(z.unknown()).optional(),
  }),
  duration: z.string().regex(/^P\d+[DWMY]$/, 'Duration must be ISO 8601 format (e.g., P30D)'),
  revocable: z.boolean().default(true),
  requireApproval: z.boolean().optional(),
})

const revokeDelegationSchema = z.object({
  revokedBy: z.string().min(1),
  reason: z.string().optional(),
  cascade: z.boolean().optional().default(false),
})

const verifyDelegationSchema = z.object({
  action: z.string().min(1),
  resource: z.string().optional(),
})

/**
 * @swagger
 * /delegations:
 *   post:
 *     summary: Create a new delegation
 *     tags: [Delegations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [delegatorDid, delegateeToDid, scope, duration]
 *             properties:
 *               delegatorDid:
 *                 type: string
 *                 description: DID of the delegating agent
 *               delegateeToDid:
 *                 type: string
 *                 description: DID of the agent receiving delegation
 *               scope:
 *                 type: object
 *                 properties:
 *                   actions:
 *                     type: array
 *                     items: { type: string }
 *                     example: ["read", "write"]
 *                   resources:
 *                     type: array
 *                     items: { type: string }
 *                     example: ["/data/*", "/reports/*"]
 *                   constraints:
 *                     type: object
 *               duration:
 *                 type: string
 *                 example: "P30D"
 *                 description: ISO 8601 duration
 *               revocable:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201:
 *         description: Delegation created
 *       400:
 *         description: Validation error
 *       404:
 *         description: Delegator agent not found
 */
delegationRoutes.post(
  '/',
  validateBody(createDelegationSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { delegatorDid, ...input } = req.body

    try {
      const delegation = await delegationService.createDelegation(delegatorDid, input)

      logger.info('Delegation created via API', {
        id: delegation.id,
        delegator: delegatorDid,
        delegatee: input.delegateeToDid,
      })

      res.status(201).json({
        success: true,
        delegation,
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'Delegator agent not found') {
        res.status(404).json({ error: 'not_found', message: 'Delegator agent not found' })
        return
      }
      throw error
    }
  })
)

/**
 * @swagger
 * /delegations/{id}:
 *   get:
 *     summary: Get delegation by ID
 *     tags: [Delegations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Delegation details
 *       404:
 *         description: Delegation not found
 */
delegationRoutes.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params
    const delegation = await delegationService.getDelegationById(id)

    if (!delegation) {
      res.status(404).json({ error: 'not_found', message: 'Delegation not found' })
      return
    }

    res.json(delegation)
  })
)

/**
 * @swagger
 * /delegations/agent/{did}:
 *   get:
 *     summary: Get all delegations for an agent
 *     tags: [Delegations]
 *     parameters:
 *       - in: path
 *         name: did
 *         required: true
 *         schema:
 *           type: string
 *         description: Agent DID
 *     responses:
 *       200:
 *         description: Agent delegations (given and received)
 */
delegationRoutes.get(
  '/agent/:did',
  asyncHandler(async (req: Request, res: Response) => {
    const { did } = req.params
    const delegations = await delegationService.getDelegations(decodeURIComponent(did))

    res.json(delegations)
  })
)

/**
 * @swagger
 * /delegations/{id}/revoke:
 *   post:
 *     summary: Revoke a delegation
 *     tags: [Delegations]
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
 *             required: [revokedBy]
 *             properties:
 *               revokedBy:
 *                 type: string
 *                 description: DID of the agent revoking the delegation
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Delegation revoked
 *       400:
 *         description: Cannot revoke (not revocable or not authorized)
 *       404:
 *         description: Delegation not found
 */
delegationRoutes.post(
  '/:id/revoke',
  validateBody(revokeDelegationSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params
    const { revokedBy, reason, cascade } = req.body

    try {
      const revoked = await delegationService.revokeDelegation(id, revokedBy, reason, cascade)

      if (!revoked) {
        res.status(400).json({
          error: 'revoke_failed',
          message: 'Cannot revoke delegation. Either not found or not authorized.',
        })
        return
      }

      logger.info('Delegation revoked via API', { id, revokedBy })

      res.json({
        success: true,
        message: 'Delegation revoked successfully',
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'This delegation is not revocable') {
        res.status(400).json({ error: 'not_revocable', message: error.message })
        return
      }
      throw error
    }
  })
)

/**
 * @swagger
 * /delegations/{id}/verify:
 *   post:
 *     summary: Verify a delegation for a specific action
 *     tags: [Delegations]
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
 *             required: [action]
 *             properties:
 *               action:
 *                 type: string
 *                 example: "read"
 *               resource:
 *                 type: string
 *                 example: "/data/reports"
 *     responses:
 *       200:
 *         description: Verification result
 */
delegationRoutes.post(
  '/:id/verify',
  validateBody(verifyDelegationSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params
    const { action, resource } = req.body

    const result = await delegationService.verifyDelegation(id, action, resource)

    res.json(result)
  }),
)

/**
 * POST /delegations/:id/sub-delegate — Create a sub-delegation (chain A→B→C)
 * Scope must be a subset of parent (attenuation rule).
 */
delegationRoutes.post(
  '/:id/sub-delegate',
  validateBody(subDelegationSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params
    const { delegatorDid, delegateeDid, ...rest } = req.body

    try {
      const delegation = await delegationService.createSubDelegation(id, delegatorDid, {
        delegateeDid,
        ...rest,
      })
      logger.info('Sub-delegation created via API', { parentId: id, childId: delegation.id })
      res.status(201).json({ success: true, delegation })
    } catch (error) {
      if (error instanceof Error) {
        const clientErrors = [
          'Parent delegation not found',
          'Only the delegatee of the parent can sub-delegate',
          'Parent delegation has been revoked',
          'Parent delegation has expired',
        ]
        if (clientErrors.some((m) => error.message.includes(m)) || error.message.includes('not in parent scope') || error.message.includes('Maximum delegation depth')) {
          res.status(400).json({ error: 'sub_delegation_error', message: error.message })
          return
        }
      }
      throw error
    }
  }),
)

/**
 * GET /delegations/:id/chain — Get the full delegation chain
 */
delegationRoutes.get(
  '/:id/chain',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params
    const chain = await delegationService.getDelegationChain(id)

    if (chain.length === 0) {
      res.status(404).json({ error: 'not_found', message: 'Delegation not found' })
      return
    }

    res.json({ chain, depth: chain.length })
  }),
)
