/**
 * Keycloak SSO Auth Routes
 * GET  /keycloak/config   — public OIDC config for frontend
 * POST /keycloak/callback  — authorization code → local JWT exchange
 */

import { Router, Request, Response } from 'express'
import { generateToken } from '../middleware/auth.middleware'
import { validateBody } from '../middleware/validation.middleware'
import { asyncHandler } from '../middleware/error.middleware'
import { authRateLimiter } from '../middleware/rateLimit.middleware'
import { logger } from '../../utils/logger'
import {
  getKeycloakConfig,
  isKeycloakConfigured,
  exchangeAuthorizationCode,
  validateKeycloakToken,
} from '../../services/keycloak.service'
import { keycloakCallbackSchema } from '../schemas/validation.schemas'

export const keycloakAuthRoutes = Router()

/**
 * @swagger
 * /auth/keycloak/config:
 *   get:
 *     summary: Get Keycloak OIDC configuration
 *     description: Returns realm URL and client ID for frontend OIDC init
 *     tags: [Auth]
 *     security: []
 *     responses:
 *       200:
 *         description: Keycloak configuration
 *       503:
 *         description: Keycloak SSO not configured
 */
keycloakAuthRoutes.get(
  '/config',
  asyncHandler(async (_req: Request, res: Response) => {
    if (!isKeycloakConfigured()) {
      res.status(503).json({
        error: 'keycloak_not_configured',
        detail: 'Keycloak SSO is not configured on this server',
      })
      return
    }

    const cfg = getKeycloakConfig()
    res.json({
      enabled: true,
      realmUrl: cfg!.realmUrl,
      clientId: cfg!.frontendClientId,
    })
  })
)

/**
 * @swagger
 * /auth/keycloak/callback:
 *   post:
 *     summary: Exchange Keycloak authorization code for local session
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, redirectUri, codeVerifier]
 *             properties:
 *               code:
 *                 type: string
 *               redirectUri:
 *                 type: string
 *               codeVerifier:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token exchange successful
 *       401:
 *         description: Invalid authorization code
 */
keycloakAuthRoutes.post(
  '/callback',
  authRateLimiter,
  validateBody(keycloakCallbackSchema),
  asyncHandler(async (req: Request, res: Response) => {
    if (!isKeycloakConfigured()) {
      res.status(503).json({ error: 'keycloak_not_configured' })
      return
    }

    const { code, redirectUri, codeVerifier } = req.body

    const tokens = await exchangeAuthorizationCode(code, redirectUri, codeVerifier)
    if (!tokens) {
      logger.warn('Keycloak callback: code exchange failed')
      res.status(401).json({
        error: 'invalid_code',
        detail: 'Failed to exchange authorization code',
      })
      return
    }

    // Validate the access token to get user info
    const kcUser = await validateKeycloakToken(tokens.accessToken)
    if (!kcUser) {
      res.status(401).json({ error: 'invalid_token', detail: 'Access token validation failed' })
      return
    }

    // Map Keycloak role to system role
    const role = kcUser.roles.find((r) => ['issuer', 'verifier'].includes(r)) || 'verifier'

    // Issue local JWT with Keycloak user info (for consistent downstream auth)
    const localToken = generateToken({
      sub: kcUser.sub,
      role,
      permissions: kcUser.permissions,
    })

    res.json({
      access_token: localToken,
      token_type: 'Bearer',
      expires_in: 3600,
      role,
      sub: kcUser.sub,
      username: kcUser.username,
      email: kcUser.email,
    })
  })
)
