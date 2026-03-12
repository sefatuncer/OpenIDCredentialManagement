/**
 * Policy Enforcement Middleware
 *
 * Evaluates authorization policies against the authenticated user.
 * Feature-flag gated: security.policy-engine — pass-through when disabled.
 */

import { Request, Response, NextFunction } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { isFeatureEnabled } from '../../core/feature-flags'
import { evaluatePolicy } from '../../services/policy.service'
import { AuthenticatedRequest } from './auth.middleware'

/**
 * Enforce a policy check on the request.
 *
 * @param action - The action being performed (e.g., 'credential:issue')
 * @param resource - The resource being accessed (e.g., 'credentials')
 */
export function enforcePolicy(action: string, resource: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Pass-through when feature is disabled
    if (!isFeatureEnabled('security.policy-engine')) {
      next()
      return
    }

    const authReq = req as AuthenticatedRequest
    const user = authReq.user

    if (!user) {
      res.status(401).json({
        error: 'Not authenticated',
        requestId: (req as any).requestId || uuidv4(),
      })
      return
    }

    const decision = evaluatePolicy({
      principal: {
        sub: user.sub,
        role: user.role,
        permissions: user.permissions,
      },
      action,
      resource,
      metadata: {
        method: req.method,
        path: req.originalUrl,
        authMethod: authReq.authMethod,
      },
    })

    if (!decision.allowed) {
      res.status(403).json({
        error: 'Policy denied',
        detail: decision.reason,
        action,
        resource,
        requestId: (req as any).requestId || uuidv4(),
      })
      return
    }

    next()
  }
}
