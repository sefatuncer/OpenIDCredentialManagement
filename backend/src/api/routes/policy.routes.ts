/**
 * Policy Authorization Routes
 *
 * CRUD endpoints for managing authorization policies.
 * Feature-flag gated: security.policy-engine
 */

import { Router, Request, Response } from 'express'
import { isFeatureEnabled } from '../../core/feature-flags'
import { asyncHandler } from '../middleware/error.middleware'
import { requirePermission } from '../middleware/auth.middleware'
import {
  listPolicies,
  getPolicy,
  createPolicy,
  updatePolicy,
  deletePolicy,
} from '../../services/policy.service'

export const policyRoutes = Router()

/**
 * Check if policy engine is enabled
 */
function requirePolicyEngine(_req: Request, res: Response, next: () => void): void {
  if (!isFeatureEnabled('security.policy-engine')) {
    res.status(404).json({ error: 'Policy engine is not enabled' })
    return
  }
  next()
}

policyRoutes.use(requirePolicyEngine)

/**
 * @swagger
 * /api/v1/policies:
 *   get:
 *     summary: List all authorization policies
 *     tags: [Policies]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of policies
 *       404:
 *         description: Policy engine not enabled
 */
policyRoutes.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const policies = await listPolicies()
    res.json({ policies })
  }),
)

/**
 * @swagger
 * /api/v1/policies/{id}:
 *   get:
 *     summary: Get policy by ID
 *     tags: [Policies]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Policy ID
 *     responses:
 *       200:
 *         description: Policy detail
 *       404:
 *         description: Policy not found
 */
policyRoutes.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const policy = await getPolicy(req.params.id)
    if (!policy) {
      res.status(404).json({ error: 'Policy not found' })
      return
    }
    res.json(policy)
  }),
)

/**
 * @swagger
 * /api/v1/policies:
 *   post:
 *     summary: Create a custom authorization policy (admin only)
 *     tags: [Policies]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - effect
 *               - actions
 *               - resources
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               effect:
 *                 type: string
 *                 enum: [allow, deny]
 *               principals:
 *                 type: object
 *                 properties:
 *                   roles:
 *                     type: array
 *                     items:
 *                       type: string
 *                   dids:
 *                     type: array
 *                     items:
 *                       type: string
 *               actions:
 *                 type: array
 *                 items:
 *                   type: string
 *               resources:
 *                 type: array
 *                 items:
 *                   type: string
 *               conditions:
 *                 type: object
 *               priority:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Policy created
 *       400:
 *         description: Validation error
 */
policyRoutes.post(
  '/',
  requirePermission('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const { name, description, effect, principals, actions, resources, conditions, priority } = req.body as {
      name?: string
      description?: string
      effect?: string
      principals?: { roles?: string[]; dids?: string[] }
      actions?: string[]
      resources?: string[]
      conditions?: Record<string, unknown>
      priority?: number
    }

    if (!name || !effect || !actions?.length || !resources?.length) {
      res.status(400).json({ error: 'name, effect, actions, and resources are required' })
      return
    }

    if (effect !== 'allow' && effect !== 'deny') {
      res.status(400).json({ error: 'effect must be "allow" or "deny"' })
      return
    }

    const policy = await createPolicy({
      name,
      description: description || '',
      effect,
      principals: principals || { roles: [] },
      actions,
      resources,
      conditions,
      priority: priority || 50,
    })
    res.status(201).json(policy)
  }),
)

/**
 * @swagger
 * /api/v1/policies/{id}:
 *   put:
 *     summary: Update a custom policy (admin only)
 *     tags: [Policies]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Policy ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               effect:
 *                 type: string
 *                 enum: [allow, deny]
 *               actions:
 *                 type: array
 *                 items:
 *                   type: string
 *               resources:
 *                 type: array
 *                 items:
 *                   type: string
 *               priority:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Policy updated
 *       400:
 *         description: Cannot modify built-in policy
 *       404:
 *         description: Policy not found
 */
policyRoutes.put(
  '/:id',
  requirePermission('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const policy = await updatePolicy(req.params.id, req.body)
      if (!policy) {
        res.status(404).json({ error: 'Policy not found' })
        return
      }
      res.json(policy)
    } catch (err) {
      if ((err as Error).message.includes('built-in')) {
        res.status(400).json({ error: (err as Error).message })
        return
      }
      throw err
    }
  }),
)

/**
 * @swagger
 * /api/v1/policies/{id}:
 *   delete:
 *     summary: Delete a custom policy (admin only)
 *     tags: [Policies]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Policy ID
 *     responses:
 *       200:
 *         description: Policy deleted
 *       400:
 *         description: Cannot delete built-in policy
 *       404:
 *         description: Policy not found
 */
policyRoutes.delete(
  '/:id',
  requirePermission('admin'),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const deleted = await deletePolicy(req.params.id)
      if (!deleted) {
        res.status(404).json({ error: 'Policy not found' })
        return
      }
      res.json({ success: true })
    } catch (err) {
      if ((err as Error).message.includes('built-in')) {
        res.status(400).json({ error: (err as Error).message })
        return
      }
      throw err
    }
  }),
)
