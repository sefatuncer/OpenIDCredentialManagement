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

// List all tenants (admin only)
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

// Get tenant stats (admin only)
tenantRoutes.get(
  '/stats',
  requirePermission('tenants:read'),
  asyncHandler(async (_req: Request, res: Response) => {
    const stats = await getStats()
    res.json({ success: true, ...stats })
  }),
)

// Get tenant by ID (admin or own tenant)
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

// Create tenant (admin only)
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

// Update tenant (admin only)
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

// Suspend tenant (admin only)
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

// Activate tenant (admin only)
tenantRoutes.post(
  '/:id/activate',
  requirePermission('tenants:write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params
    await activateTenant(id)
    res.json({ success: true, message: 'Tenant activated' })
  }),
)

// Delete tenant (admin only)
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

// Get tenant usage (admin or own tenant)
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
