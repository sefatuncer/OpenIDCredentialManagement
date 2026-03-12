/**
 * Tenant Context Middleware
 *
 * Extracts tenant from request headers/subdomain/query and attaches to request.
 * Feature-flag gated: skips when module.multi-tenant is disabled.
 */

import { Request, Response, NextFunction } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { isFeatureEnabled } from '../../core/feature-flags'
import { extractTenantFromRequest } from '../../services/multiTenant.service'
import type { AuthenticatedRequest } from './auth.middleware'

/**
 * Require tenant context — returns 403 if tenant not found or suspended.
 * Use on routes that must be tenant-scoped.
 */
export function requireTenant() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!isFeatureEnabled('module.multi-tenant')) {
      next()
      return
    }

    const tenant = await extractTenantFromRequest(req)

    if (!tenant) {
      const requestId = (req as any).requestId || uuidv4()
      res.status(403).json({
        type: 'https://api.example.com/problems/tenant-required',
        title: 'Tenant Required',
        status: 403,
        detail: 'Multi-tenant mode is enabled. Provide X-Tenant-ID or X-Tenant-Slug header.',
        instance: req.originalUrl,
        requestId,
      })
      return
    }

    if (tenant.status !== 'active') {
      const requestId = (req as any).requestId || uuidv4()
      res.status(403).json({
        type: 'https://api.example.com/problems/tenant-suspended',
        title: 'Tenant Suspended',
        status: 403,
        detail: `Tenant "${tenant.name}" is ${tenant.status}`,
        instance: req.originalUrl,
        requestId,
      })
      return
    }

    ;(req as AuthenticatedRequest).tenantId = tenant.id
    ;(req as AuthenticatedRequest).tenant = tenant
    next()
  }
}

/**
 * Optional tenant context — attaches tenant if present, continues without if not.
 * Use on routes that work with or without tenant (backward compat).
 */
export function optionalTenant() {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!isFeatureEnabled('module.multi-tenant')) {
      next()
      return
    }

    try {
      const tenant = await extractTenantFromRequest(req)
      if (tenant && tenant.status === 'active') {
        ;(req as AuthenticatedRequest).tenantId = tenant.id
        ;(req as AuthenticatedRequest).tenant = tenant
      }
    } catch {
      // Non-fatal: continue without tenant context
    }

    next()
  }
}
