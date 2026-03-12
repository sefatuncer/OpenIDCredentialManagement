import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { generateToken } from '../middleware/auth.middleware'
import { validateBody } from '../middleware/validation.middleware'
import { asyncHandler } from '../middleware/error.middleware'
import { authRateLimiter } from '../middleware/rateLimit.middleware'
import { logger } from '../../utils/logger'
import * as clientCredentialsRepo from '../../database/repositories/clientCredentials.repository'
import { keycloakAuthRoutes } from './keycloak-auth.routes'

export const authRoutes = Router()

const tokenRequestSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  clientSecret: z.string().min(1, 'Client secret is required'),
  grantType: z.literal('client_credentials').optional().default('client_credentials'),
})

// Fallback to environment variables if database is not available or empty
// This allows the system to bootstrap before database clients are created
async function verifyClientCredentials(
  clientId: string,
  clientSecret: string
): Promise<{ permissions: string[] } | null> {
  try {
    // First try database
    const dbClient = await clientCredentialsRepo.verifyClientCredentials(clientId, clientSecret)
    if (dbClient) {
      return { permissions: dbClient.permissions }
    }
  } catch (error) {
    // Database may not be available, fall back to env vars
    logger.debug('Database client verification failed, trying environment variables', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }

  // Fallback to environment variables for bootstrap
  const envClients: Record<string, string | undefined> = {
    'web-wallet': process.env.WEB_WALLET_SECRET,
    'mobile-wallet': process.env.MOBILE_WALLET_SECRET,
    'agent-api': process.env.AGENT_API_SECRET,
    'issuer-client': process.env.ISSUER_CLIENT_SECRET,
    'verifier-client': process.env.VERIFIER_CLIENT_SECRET,
  }

  const envSecret = envClients[clientId]
  if (envSecret && envSecret === clientSecret) {
    return { permissions: ['*'] }
  }

  return null
}

/**
 * @swagger
 * /auth/token:
 *   post:
 *     summary: Generate access token
 *     description: Exchange client credentials for a JWT access token
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - clientId
 *               - clientSecret
 *             properties:
 *               clientId:
 *                 type: string
 *                 example: demo-client
 *               clientSecret:
 *                 type: string
 *                 example: demo-secret-12345
 *               grantType:
 *                 type: string
 *                 enum: [client_credentials]
 *                 default: client_credentials
 *     responses:
 *       200:
 *         description: Token generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 access_token:
 *                   type: string
 *                   description: JWT access token
 *                 token_type:
 *                   type: string
 *                   example: Bearer
 *                 expires_in:
 *                   type: integer
 *                   description: Token validity in seconds
 *                   example: 86400
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         description: Invalid client credentials
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 */
authRoutes.post(
  '/token',
  authRateLimiter,
  validateBody(tokenRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { clientId, clientSecret } = req.body

    const client = await verifyClientCredentials(clientId, clientSecret)
    if (!client) {
      logger.warn('Invalid client credentials attempt', { clientId })
      res.status(401).json({
        type: 'https://api.example.com/problems/invalid-credentials',
        title: 'Invalid Credentials',
        status: 401,
        detail: 'Invalid client ID or secret',
      })
      return
    }

    const token = generateToken({
      sub: clientId,
      permissions: client.permissions,
    })

    res.json({
      access_token: token,
      token_type: 'Bearer',
      expires_in: 86400, // 24 hours
    })
  })
)

/**
 * @swagger
 * /auth/introspect:
 *   post:
 *     summary: Introspect token
 *     description: Check if a token is valid and get its claims
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
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
 *                 description: The token to introspect
 *     responses:
 *       200:
 *         description: Token introspection result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 active:
 *                   type: boolean
 *                 sub:
 *                   type: string
 *                 permissions:
 *                   type: array
 *                   items:
 *                     type: string
 *                 exp:
 *                   type: integer
 *                 iat:
 *                   type: integer
 */
authRoutes.post(
  '/introspect',
  asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.body

    if (!token) {
      res.json({ active: false })
      return
    }

    try {
      const jwt = await import('jsonwebtoken')
      const secret = process.env.JWT_SECRET
      if (!secret) {
        res.json({ active: false, error: 'JWT_SECRET not configured' })
        return
      }
      const decoded = jwt.default.verify(token, secret) as any

      res.json({
        active: true,
        sub: decoded.sub,
        permissions: decoded.permissions,
        exp: decoded.exp,
        iat: decoded.iat,
      })
    } catch {
      res.json({ active: false })
    }
  })
)

// Mount Keycloak SSO routes under /keycloak/*
authRoutes.use('/keycloak', keycloakAuthRoutes)
