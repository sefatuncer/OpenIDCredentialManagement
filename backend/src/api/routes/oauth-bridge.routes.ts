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
 * @swagger
 * /api/v1/oauth/token-exchange:
 *   post:
 *     summary: Exchange a Verifiable Credential for an OAuth access token (RFC 8693)
 *     tags: [OAuth Bridge]
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
 *               - subject_token
 *             properties:
 *               subject_token:
 *                 type: string
 *                 description: JWT or SD-JWT Verifiable Credential
 *               scope:
 *                 type: string
 *                 description: Requested OAuth scope
 *     responses:
 *       200:
 *         description: OAuth token response
 *       400:
 *         description: Invalid grant or token exchange failed
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
 * @swagger
 * /api/v1/oauth/introspect:
 *   post:
 *     summary: Introspect a bridge token to check validity and claims
 *     tags: [OAuth Bridge]
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
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 description: Bridge token to introspect
 *     responses:
 *       200:
 *         description: Token introspection result (active true/false)
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
 * @swagger
 * /api/v1/oauth/scope-mappings:
 *   get:
 *     summary: List available credential-to-OAuth scope mappings
 *     tags: [OAuth Bridge]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Map of credential types to OAuth scopes
 */
oauthBridgeRoutes.get(
  '/scope-mappings',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(getScopeMappings())
  })
)

/**
 * @swagger
 * /api/v1/oauth/.well-known/oauth-bridge:
 *   get:
 *     summary: OAuth bridge metadata discovery endpoint
 *     tags: [OAuth Bridge]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Bridge metadata (grant types, token types, endpoints)
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
