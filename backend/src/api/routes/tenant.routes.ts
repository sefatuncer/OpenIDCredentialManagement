/**
 * Tenant Management Routes
 *
 * CRUD endpoints for multi-tenant administration.
 * All routes require admin role (except GET own tenant).
 */

import { Router, Request, Response } from 'express'
import { requirePermission, AuthenticatedRequest } from '../middleware/auth.middleware'
import { enforcePolicy } from '../middleware/policy.middleware'
import { validateBody } from '../middleware/validation.middleware'
import { asyncHandler } from '../middleware/error.middleware'
import { tenantCreateSchema, tenantUpdateSchema } from '../schemas/validation.schemas'
import {
  createTenant,
  getTenant,
  listTenants,
  updateTenant,
  suspendTenant,
  activateTenant,
  deleteTenant,
  getUsage,
  getStats,
} from '../../services/multiTenant.service'

export const tenantRoutes = Router()

/**
 * @swagger
 * /api/v1/tenants:
 *   get:
 *     summary: List all tenants (admin only)
 *     tags: [Tenants]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, suspended, pending]
 *         description: Filter by tenant status
 *     responses:
 *       200:
 *         description: List of tenants
 */
tenantRoutes.get(
  '/',
  requirePermission('tenants:read'),
  asyncHandler(async (req: Request, res: Response) => {
    const status = req.query.status as string | undefined
    const validStatuses = ['active', 'suspended', 'pending'] as const
    const filterStatus = status && validStatuses.includes(status as any)
      ? (status as 'active' | 'suspended' | 'pending')
      : undefined

    const tenants = await listTenants(filterStatus)
    res.json({ success: true, tenants, total: tenants.length })
  }),
)

/**
 * @swagger
 * /api/v1/tenants/stats:
 *   get:
 *     summary: Get aggregated tenant statistics (admin only)
 *     tags: [Tenants]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Tenant statistics
 */
tenantRoutes.get(
  '/stats',
  requirePermission('tenants:read'),
  asyncHandler(async (_req: Request, res: Response) => {
    const stats = await getStats()
    res.json({ success: true, ...stats })
  }),
)

/**
 * @swagger
 * /api/v1/tenants/{id}:
 *   get:
 *     summary: Get tenant by ID (admin or own tenant)
 *     tags: [Tenants]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant ID
 *     responses:
 *       200:
 *         description: Tenant detail
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Tenant not found
 */
tenantRoutes.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest
    const { id } = req.params

    // Allow access if admin or if requesting own tenant
    const isAdmin = authReq.user?.permissions?.includes('*') ||
      authReq.user?.permissions?.includes('tenants:read')
    const isOwnTenant = authReq.tenantId === id

    if (!isAdmin && !isOwnTenant) {
      res.status(403).json({ success: false, error: 'Forbidden' })
      return
    }

    const tenant = await getTenant(id)
    if (!tenant) {
      res.status(404).json({ success: false, error: 'Tenant not found' })
      return
    }

    res.json({ success: true, tenant })
  }),
)

/**
 * @swagger
 * /api/v1/tenants:
 *   post:
 *     summary: Create a new tenant (admin only)
 *     tags: [Tenants]
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
 *               - slug
 *             properties:
 *               name:
 *                 type: string
 *               slug:
 *                 type: string
 *               config:
 *                 type: object
 *     responses:
 *       201:
 *         description: Tenant created
 *       400:
 *         description: Validation error
 */
tenantRoutes.post(
  '/',
  enforcePolicy('tenant:manage', 'tenants'),
  requirePermission('tenants:write'),
  validateBody(tenantCreateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { name, slug, config } = req.body
    const tenant = await createTenant(name, slug, config)
    res.status(201).json({ success: true, tenant })
  }),
)

/**
 * @swagger
 * /api/v1/tenants/{id}:
 *   put:
 *     summary: Update tenant details (admin only)
 *     tags: [Tenants]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               config:
 *                 type: object
 *     responses:
 *       200:
 *         description: Tenant updated
 *       400:
 *         description: Validation error
 */
tenantRoutes.put(
  '/:id',
  requirePermission('tenants:write'),
  validateBody(tenantUpdateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params
    const tenant = await updateTenant(id, req.body)
    res.json({ success: true, tenant })
  }),
)

/**
 * @swagger
 * /api/v1/tenants/{id}/suspend:
 *   post:
 *     summary: Suspend a tenant (admin only)
 *     tags: [Tenants]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Suspension reason
 *     responses:
 *       200:
 *         description: Tenant suspended
 */
tenantRoutes.post(
  '/:id/suspend',
  requirePermission('tenants:write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 500) : undefined
    await suspendTenant(id, reason)
    res.json({ success: true, message: 'Tenant suspended' })
  }),
)

/**
 * @swagger
 * /api/v1/tenants/{id}/activate:
 *   post:
 *     summary: Activate a suspended tenant (admin only)
 *     tags: [Tenants]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant ID
 *     responses:
 *       200:
 *         description: Tenant activated
 */
tenantRoutes.post(
  '/:id/activate',
  requirePermission('tenants:write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params
    await activateTenant(id)
    res.json({ success: true, message: 'Tenant activated' })
  }),
)

/**
 * @swagger
 * /api/v1/tenants/{id}:
 *   delete:
 *     summary: Delete a tenant (admin only)
 *     tags: [Tenants]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant ID
 *     responses:
 *       200:
 *         description: Tenant deleted
 *       404:
 *         description: Tenant not found
 */
tenantRoutes.delete(
  '/:id',
  enforcePolicy('tenant:manage', 'tenants'),
  requirePermission('tenants:write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params
    const deleted = await deleteTenant(id)
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Tenant not found' })
      return
    }
    res.json({ success: true, message: 'Tenant deleted' })
  }),
)

/**
 * @swagger
 * /api/v1/tenants/{id}/usage:
 *   get:
 *     summary: Get tenant usage metrics (admin or own tenant)
 *     tags: [Tenants]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant ID
 *     responses:
 *       200:
 *         description: Tenant usage data
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Usage data not found
 */
tenantRoutes.get(
  '/:id/usage',
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest
    const { id } = req.params

    const isAdmin = authReq.user?.permissions?.includes('*') ||
      authReq.user?.permissions?.includes('tenants:read')
    const isOwnTenant = authReq.tenantId === id

    if (!isAdmin && !isOwnTenant) {
      res.status(403).json({ success: false, error: 'Forbidden' })
      return
    }

    const usage = await getUsage(id)
    if (!usage) {
      res.status(404).json({ success: false, error: 'Usage data not found' })
      return
    }

    res.json({ success: true, usage })
  }),
)
