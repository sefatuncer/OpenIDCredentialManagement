import { Router, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { asyncHandler } from '../middleware/error.middleware'
import { validateBody } from '../middleware/validation.middleware'
import { authRateLimiter } from '../middleware/rateLimit.middleware'
import { tokenExchangeSchema, bridgeIntrospectSchema } from '../schemas/validation.schemas'
import {
  exchangeVCForToken,
  getScopeMappings,
  OAuthBridgeError,
} from '../../services/oauth-bridge.service'
import { logger } from '../../utils/logger'

const JWT_SECRET = process.env.JWT_SECRET || ''

export const oauthBridgeRoutes = Router()

/**
 * POST /token-exchange — RFC 8693 Token Exchange (VC → OAuth token)
 */
oauthBridgeRoutes.post(
  '/token-exchange',
  authRateLimiter,
  validateBody(tokenExchangeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { subject_token, scope } = req.body

    try {
      const tokenResponse = await exchangeVCForToken(subject_token, scope)
      res.json(tokenResponse)
    } catch (error) {
      if (error instanceof OAuthBridgeError) {
        res.status(error.statusCode).json({
          error: error.errorCode,
          error_description: error.errorDescription,
        })
        return
      }
      logger.error('Token exchange failed', { error: (error as Error).message })
      res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Token exchange failed',
      })
    }
  })
)

/**
 * POST /introspect — Bridge token introspection
 */
oauthBridgeRoutes.post(
  '/introspect',
  authRateLimiter,
  validateBody(bridgeIntrospectSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.body

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as {
        sub?: string
        role?: string
        permissions?: string[]
        exp?: number
        iat?: number
      }

      res.json({
        active: true,
        sub: decoded.sub,
        scope: Array.isArray(decoded.permissions)
          ? decoded.permissions.join(' ')
          : undefined,
        exp: decoded.exp,
        iat: decoded.iat,
        source_credential_type: decoded.role === 'bridge' ? 'bridge_token' : undefined,
        issuer_did: decoded.sub,
      })
    } catch {
      res.json({ active: false })
    }
  })
)

/**
 * GET /scope-mappings — List available scope mappings
 */
oauthBridgeRoutes.get(
  '/scope-mappings',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(getScopeMappings())
  })
)

/**
 * GET /.well-known/oauth-bridge — Bridge metadata discovery
 */
oauthBridgeRoutes.get(
  '/.well-known/oauth-bridge',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({
      grant_types_supported: ['urn:ietf:params:oauth:grant-type:token-exchange'],
      subject_token_types_supported: [
        'urn:ietf:params:oauth:token-type:jwt',
        'urn:ietf:params:oauth:token-type:vc+jwt',
      ],
      issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      credential_types_supported: [
        'AIAgentIdentityCredential',
        'DelegationCredential',
        'CapabilityCredential',
      ],
      token_endpoint: '/api/v1/oauth/token-exchange',
      introspection_endpoint: '/api/v1/oauth/introspect',
      scope_mappings_endpoint: '/api/v1/oauth/scope-mappings',
    })
  })
)
