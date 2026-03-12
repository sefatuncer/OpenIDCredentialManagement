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
 * GET /api/v1/policies — List all policies
 */
policyRoutes.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const policies = await listPolicies()
    res.json({ policies })
  }),
)

/**
 * GET /api/v1/policies/:id — Get policy detail
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
 * POST /api/v1/policies — Create custom policy (admin only)
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
 * PUT /api/v1/policies/:id — Update custom policy (admin only)
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
 * DELETE /api/v1/policies/:id — Delete custom policy (admin only)
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
