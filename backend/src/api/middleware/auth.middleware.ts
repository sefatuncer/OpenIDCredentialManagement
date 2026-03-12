import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '../../utils/logger'
import { isKeycloakConfigured, isKeycloakToken, validateKeycloakToken } from '../../services/keycloak.service'

export interface AuthenticatedRequest extends Request {
  user?: {
    sub: string
    role?: string
    permissions?: string[]
  }
  apiKeyId?: string
  authMethod?: 'keycloak' | 'jwt' | 'apikey'
}

export interface AuthConfig {
  jwtSecret: string
  apiKeys: Map<string, { id: string; name: string; permissions: string[] }>
}

// Production environment variable validation
const defaultJwtSecret = process.env.JWT_SECRET
const defaultApiKey = process.env.API_KEY

if (!defaultJwtSecret) {
  const error = 'FATAL: JWT_SECRET environment variable is required. Server cannot start without it.'
  logger.error(error)
  throw new Error(error)
}

if (!defaultApiKey) {
  const error = 'FATAL: API_KEY environment variable is required. Server cannot start without it.'
  logger.error(error)
  throw new Error(error)
}

const defaultConfig: AuthConfig = {
  jwtSecret: defaultJwtSecret,
  apiKeys: new Map([
    [
      defaultApiKey,
      { id: 'default', name: 'Development Key', permissions: ['*'] },
    ],
  ]),
}

function createUnauthorizedResponse(
  req: Request,
  message: string,
  requestId: string
) {
  return {
    type: 'https://api.example.com/problems/unauthorized',
    title: 'Unauthorized',
    status: 401,
    detail: message,
    instance: req.originalUrl,
    requestId,
  }
}

export function authenticateJwt(config: AuthConfig = defaultConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = (req as any).requestId || uuidv4()
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json(
        createUnauthorizedResponse(
          req,
          'Missing or invalid Authorization header',
          requestId
        )
      )
      return
    }

    const token = authHeader.substring(7)

    try {
      const decoded = jwt.verify(token, config.jwtSecret) as {
        sub: string
        role?: string
        permissions?: string[]
      }
      ;(req as AuthenticatedRequest).user = decoded
      next()
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        res.status(401).json(
          createUnauthorizedResponse(req, 'Token has expired', requestId)
        )
        return
      }
      if (error instanceof jwt.JsonWebTokenError) {
        res.status(401).json(
          createUnauthorizedResponse(req, 'Invalid token', requestId)
        )
        return
      }
      next(error)
    }
  }
}

export function authenticateApiKey(config: AuthConfig = defaultConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = (req as any).requestId || uuidv4()
    const apiKey = req.headers['x-api-key'] as string

    if (!apiKey) {
      res.status(401).json(
        createUnauthorizedResponse(req, 'Missing X-API-Key header', requestId)
      )
      return
    }

    const keyInfo = config.apiKeys.get(apiKey)
    if (!keyInfo) {
      res.status(401).json(
        createUnauthorizedResponse(req, 'Invalid API key', requestId)
      )
      return
    }

    ;(req as AuthenticatedRequest).apiKeyId = keyInfo.id
    ;(req as AuthenticatedRequest).user = {
      sub: keyInfo.id,
      permissions: keyInfo.permissions,
    }
    next()
  }
}

export function authenticateAny(config: AuthConfig = defaultConfig) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = (req as any).requestId || uuidv4()
    const authHeader = req.headers.authorization
    const apiKey = req.headers['x-api-key'] as string

    // Try Keycloak JWT first (if configured and token issuer matches)
    if (authHeader && authHeader.startsWith('Bearer ') && isKeycloakConfigured()) {
      const token = authHeader.substring(7)
      if (isKeycloakToken(token)) {
        try {
          const kcUser = await validateKeycloakToken(token)
          if (kcUser) {
            ;(req as AuthenticatedRequest).user = {
              sub: kcUser.sub,
              role: kcUser.roles.find((r) => ['issuer', 'verifier', 'holder', 'admin'].includes(r)),
              permissions: kcUser.permissions,
            }
            ;(req as AuthenticatedRequest).authMethod = 'keycloak'
            next()
            return
          }
        } catch (error) {
          logger.debug('Keycloak token validation failed, falling back', {
            error: error instanceof Error ? error.message : 'Unknown error',
            requestId,
          })
        }
      }
    }

    // Try local JWT
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      try {
        const decoded = jwt.verify(token, config.jwtSecret) as {
          sub: string
          role?: string
          permissions?: string[]
        }
        ;(req as AuthenticatedRequest).user = decoded
        ;(req as AuthenticatedRequest).authMethod = 'jwt'
        next()
        return
      } catch (error) {
        logger.debug('JWT verification failed, falling back to API key authentication', {
          error: error instanceof Error ? error.message : 'Unknown error',
          requestId
        })
      }
    }

    // Try API key
    if (apiKey) {
      const keyInfo = config.apiKeys.get(apiKey)
      if (keyInfo) {
        ;(req as AuthenticatedRequest).apiKeyId = keyInfo.id
        ;(req as AuthenticatedRequest).user = {
          sub: keyInfo.id,
          permissions: keyInfo.permissions,
        }
        ;(req as AuthenticatedRequest).authMethod = 'apikey'
        next()
        return
      }
    }

    res.status(401).json(
      createUnauthorizedResponse(
        req,
        'Missing or invalid authentication credentials',
        requestId
      )
    )
  }
}

export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = (req as any).requestId || uuidv4()
    const user = (req as AuthenticatedRequest).user

    if (!user) {
      res.status(401).json(
        createUnauthorizedResponse(req, 'Not authenticated', requestId)
      )
      return
    }

    const permissions = user.permissions || []
    if (permissions.includes('*') || permissions.includes(permission)) {
      next()
      return
    }

    res.status(403).json({
      type: 'https://api.example.com/problems/forbidden',
      title: 'Forbidden',
      status: 403,
      detail: `Missing required permission: ${permission}`,
      instance: req.originalUrl,
      requestId,
    })
  }
}

export function generateToken(
  payload: { sub: string; role?: string; permissions?: string[] },
  config: AuthConfig = defaultConfig,
  expiresIn: string = '24h'
): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn } as jwt.SignOptions)
}
