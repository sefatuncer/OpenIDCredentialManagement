import express, { Express, Request, Response, NextFunction } from 'express'
import path from 'path'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import bodyParser from 'body-parser'
import { logger } from '../utils/logger'
import { issuerRoutes } from './routes/issuer.routes'
import { verifierRoutes } from './routes/verifier.routes'
import { holderRoutes } from './routes/holder.routes'
import { healthRoutes } from './routes/health.routes'
import { authRoutes } from './routes/auth.routes'
import { revocationRoutes } from './routes/revocation.routes'
import { trustRoutes } from './routes/trust.routes'
import { auditRoutes } from './routes/audit.routes'
import { metricsRoutes } from './routes/metrics.routes'
import { openid4vciRoutes } from './routes/openid4vci.routes'
import { openid4vpRoutes } from './routes/openid4vp.routes'
import { didRoutes } from './routes/did.routes'
import { backupRoutes } from './routes/backup.routes'
import { sdjwtRoutes } from './routes/sdjwt.routes'
import { agentRoutes } from './routes/agent.routes'
import { walletRoutes } from './routes/wallet.routes'
import { delegationRoutes } from './routes/delegation.routes'
import { agentTrustRoutes } from './routes/agentTrust.routes'
import { schemaRoutes } from './routes/schema.routes'
import { oauthBridgeRoutes } from './routes/oauth-bridge.routes'
import { webhookRoutes } from './routes/webhook.routes'
import { tenantRoutes } from './routes/tenant.routes'
import { fabricRoutes } from './routes/fabric.routes'
import { didcommRoutes } from './routes/didcomm.routes'
import { policyRoutes } from './routes/policy.routes'
import simulationRoutes from './routes/simulation.routes'
import {
  requestIdMiddleware,
  errorMiddleware,
  notFoundMiddleware,
} from './middleware/error.middleware'
import { authenticateAny } from './middleware/auth.middleware'
import { optionalTenant } from './middleware/tenant.middleware'
import { defaultRateLimiter, directPostRateLimiter } from './middleware/rateLimit.middleware'
import { requestLoggerMiddleware } from './middleware/requestLogger.middleware'
import { setupSwagger } from './swagger'

const API_VERSION = 'v1'
const API_BASE_PATH = `/api/${API_VERSION}`

// Helper function to map error codes to HTTP status codes
function getErrorStatusCode(error: string): number {
  switch (error) {
    case 'validation_error':
    case 'invalid_proof_type':
    case 'invalid_signature':
    case 'signature_expired':
    case 'invalid_credential_format':
    case 'credential_parse_error':
    case 'capability_not_allowed':
      return 400
    case 'insufficient_trust':
    case 'untrusted_issuer':
    case 'invalid_partner_key':
    case 'invalid_partner_secret':
    case 'organization_inactive':
      return 401
    case 'credential_expired':
      return 403
    case 'organization_limit_exceeded':
      return 429
    default:
      return 400
  }
}

export function createServer(): Express {
  const app = express()

  // Trust proxy for accurate IP detection behind reverse proxy (rate limiting, logging)
  app.set('trust proxy', process.env.TRUST_PROXY || 1)

  // Response compression (gzip/deflate)
  app.use(compression({
    threshold: 1024, // Only compress responses > 1KB
    filter: (req, res) => {
      // Skip compression for SSE/WebSocket upgrade requests
      if (req.headers['accept'] === 'text/event-stream') return false
      return compression.filter(req, res)
    },
  }))

  // Basic security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  }))

  // CORS configuration - production-ready
  const corsAllowedOrigins = process.env.CORS_ALLOWED_ORIGINS
  if (!corsAllowedOrigins && process.env.NODE_ENV === 'production') {
    logger.warn('SECURITY WARNING: CORS_ALLOWED_ORIGINS not set in production. Defaulting to same-origin only.')
  }

  const allowedOrigins = corsAllowedOrigins
    ? corsAllowedOrigins.split(',').map(origin => origin.trim())
    : (process.env.NODE_ENV === 'production' ? [] : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:5174', 'http://62.244.233.69:3000', 'http://62.244.233.69:5173', 'http://62.244.233.69:5174'])

  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) {
        callback(null, true)
        return
      }

      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        callback(null, true)
      } else {
        logger.warn('CORS blocked request from origin', { origin, allowedOrigins })
        callback(new Error('Not allowed by CORS'))
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID', 'X-Tenant-ID', 'X-Tenant-Slug'],
    maxAge: 86400, // 24 hours preflight cache
  }))

  // Body parsing
  app.use(bodyParser.json({ limit: '1mb' }))
  app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }))

  // Request ID middleware - adds unique ID to each request
  app.use(requestIdMiddleware)

  // Request logging middleware with metrics and audit integration
  app.use(requestLoggerMiddleware({
    excludePaths: ['/health', '/health/ready', '/health/live', '/metrics'],
    logBody: process.env.LOG_REQUEST_BODY === 'true',
    logResponseBody: process.env.LOG_RESPONSE_BODY === 'true',
    enableAuditLog: process.env.ENABLE_AUDIT_LOG !== 'false',
    slowRequestThreshold: parseInt(process.env.SLOW_REQUEST_THRESHOLD || '3000', 10),
  }))

  // Health check routes (no auth required)
  app.use('/health', healthRoutes)

  // Prometheus metrics endpoint (no auth required)
  app.use('/metrics', metricsRoutes)

  // OpenID4VCI well-known endpoints (no auth required)
  // These are standard OpenID4VCI discovery endpoints
  app.use('/', openid4vciRoutes)

  // Setup Swagger documentation (no auth required)
  setupSwagger(app, API_BASE_PATH)

  // Auth routes (no auth required - this is where you get tokens)
  app.use(`${API_BASE_PATH}/auth`, authRoutes)

  // OpenID4VCI token and credential endpoints (no auth required - part of credential issuance flow)
  // These endpoints use pre-authorized codes or access tokens from the issuer
  // Delegates to openid4vci.service (Credo-TS PRIMARY)
  app.post(`${API_BASE_PATH}/issuer/token`, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { exchangePreAuthorizedCode } = await import('../services/openid4vci.service')
      const preAuthorizedCode = req.body['pre-authorized_code']
      const txCodeValue = req.body.tx_code || req.body.user_pin

      if (!preAuthorizedCode) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'Missing pre-authorized_code' })
      }

      const tokenResponse = await exchangePreAuthorizedCode(preAuthorizedCode, txCodeValue)

      if ('error' in tokenResponse) {
        return res.status(400).json(tokenResponse)
      }

      res.json(tokenResponse)
    } catch (error) {
      next(error)
    }
  })

  app.post(`${API_BASE_PATH}/issuer/credential`, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { issueCredential } = await import('../services/openid4vci.service')
      const authHeader = req.headers.authorization

      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'invalid_token', error_description: 'Missing access token' })
      }

      const accessToken = authHeader.substring(7)
      const result = await issueCredential(accessToken, req.body)

      if ('error' in result) {
        const statusCode = result.error === 'invalid_token' ? 401 : 400
        return res.status(statusCode).json(result)
      }

      res.json(result)
    } catch (error) {
      next(error)
    }
  })

  // Simulation routes (no auth required - for monitoring dashboard)
  app.use(`${API_BASE_PATH}/simulation`, simulationRoutes)

  // Agent registration route (no auth required - onboarding endpoint)
  // This allows external agents to register before getting credentials
  app.post(`${API_BASE_PATH}/agents/register`, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { validateBody } = await import('./middleware/validation.middleware')
      const { z } = await import('zod')
      const agentService = await import('../services/agent.service')

      // Validation schema
      const schema = z.object({
        did: z.string().regex(/^did:(key|web|peer):[a-zA-Z0-9._%-]+$/, 'Invalid DID format').optional(),
        name: z.string().min(1).max(255),
        type: z.enum(['autonomous', 'semi-autonomous', 'assistant', 'service', 'orchestrator']),
        owner: z.object({
          did: z.string().optional(),
          name: z.string().optional(),
          type: z.enum(['human', 'organization', 'agent']).optional(),
        }).optional(),
        capabilities: z.array(z.string()).optional(),
        metadata: z.record(z.unknown()).optional(),
      })

      // Validate request body
      const result = schema.safeParse(req.body)
      if (!result.success) {
        return res.status(400).json({
          type: 'https://api.example.com/problems/validation-error',
          title: 'Validation Error',
          status: 400,
          detail: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
        })
      }

      // Register agent
      const agent = await agentService.registerAgent(result.data)

      // Generate client credentials for the agent
      const clientId = `agent_${agent.id.substring(0, 8)}`
      const clientSecret = `secret_${Buffer.from(agent.id + Date.now()).toString('base64url').substring(0, 32)}`

      // TODO: Store client credentials in database for production

      logger.info('Agent registered via public endpoint', { did: agent.did })

      res.status(201).json({
        success: true,
        agent: {
          id: agent.id,
          did: agent.did,
          name: agent.name,
          type: agent.type,
          status: agent.status,
          trustLevel: agent.trustLevel,
        },
        credentials: {
          clientId,
          clientSecret,
          note: 'Use these credentials to obtain access tokens via POST /api/v1/auth/token',
        },
      })
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'DID already registered') {
          return res.status(409).json({
            type: 'https://api.example.com/problems/conflict',
            title: 'Conflict',
            status: 409,
            detail: 'This DID is already registered in the system',
          })
        }
        if (error.message.includes('Invalid DID format')) {
          return res.status(400).json({
            type: 'https://api.example.com/problems/invalid-did',
            title: 'Invalid DID',
            status: 400,
            detail: error.message,
          })
        }
      }
      next(error)
    }
  })

  // Agent credential request endpoint (no auth required - federated trust model)
  // External agents submit proof (organization approval, existing credential, or partner key)
  // to request credentials. Described in AGENT_ONBOARDING.md
  app.post(`${API_BASE_PATH}/credentials/request`, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { z } = await import('zod')
      const credentialRequestService = await import('../services/agentCredentialRequest.service')

      // Validation schema matching AGENT_ONBOARDING.md spec
      const schema = z.object({
        agent: z.object({
          name: z.string().min(1).max(255),
          type: z.enum(['autonomous', 'semi-autonomous', 'assistant', 'service', 'orchestrator']),
          requestedCapabilities: z.array(z.string()).min(1),
        }),
        proof: z.discriminatedUnion('type', [
          z.object({
            type: z.literal('organization_approval'),
            organizationDid: z.string().regex(/^did:(key|web|peer):[a-zA-Z0-9._%-]+$/),
            organizationName: z.string(),
            approval: z.object({
              signedBy: z.string(),
              signature: z.string(),
              timestamp: z.string(),
              nonce: z.string(),
            }),
          }),
          z.object({
            type: z.literal('existing_credential'),
            credential: z.string(),
            issuer: z.string(),
          }),
          z.object({
            type: z.literal('partner_key'),
            apiKey: z.string(),
            apiSecret: z.string(),
          }),
        ]),
      })

      // Validate request body
      const parseResult = schema.safeParse(req.body)
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          error: 'validation_error',
          message: 'Invalid request format',
          details: {
            errors: parseResult.error.errors.map(e => ({
              path: e.path.join('.'),
              message: e.message,
            })),
          },
        })
      }

      // Process credential request
      const result = await credentialRequestService.processCredentialRequest(parseResult.data)

      if (!result.success) {
        const statusCode = getErrorStatusCode(result.error || 'unknown')
        return res.status(statusCode).json(result)
      }

      logger.info('Agent credential issued via request endpoint', {
        agentDid: result.agent?.did,
        trustLevel: result.trustLevel,
      })

      res.status(201).json(result)
    } catch (error) {
      next(error)
    }
  })

  // OpenID4VP direct_post endpoint (no auth required - spec requirement)
  // This must be before authentication middleware
  // Wallets submit presentations here without authentication
  app.post('/direct_post', directPostRateLimiter, bodyParser.urlencoded({ extended: true }), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { handleDirectPost } = await import('../services/openid4vp.service')
      const { vp_token, presentation_submission, state } = req.body

      if (!vp_token || !state) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'vp_token and state are required',
        })
      }

      let submission
      try {
        submission = typeof presentation_submission === 'string'
          ? JSON.parse(presentation_submission)
          : presentation_submission || { id: 'submission', definition_id: 'unknown', descriptor_map: [] }
      } catch {
        submission = { id: 'submission', definition_id: 'unknown', descriptor_map: [] }
      }

      const result = await handleDirectPost(vp_token, submission, state)

      if (result.error) {
        return res.status(400).json(result)
      }

      if (result.redirect_uri) {
        return res.redirect(result.redirect_uri)
      }

      res.json({ status: 'received', message: 'Presentation received and processed' })
    } catch (error) {
      next(error)
    }
  })

  // OAuth 2.0 Bridge — RFC 8693 Token Exchange (no auth required — VC itself is authentication)
  app.use(`${API_BASE_PATH}/oauth`, oauthBridgeRoutes)

  // Apply global rate limiting to API routes
  app.use(API_BASE_PATH, defaultRateLimiter)

  // Apply authentication to all API routes
  // Comment out the next line to disable authentication for development
  app.use(API_BASE_PATH, authenticateAny())

  // Optional tenant context (attaches tenant if multi-tenant enabled and header present)
  app.use(API_BASE_PATH, optionalTenant())

  // API v1 Routes
  app.use(`${API_BASE_PATH}/issuer`, issuerRoutes)
  app.use(`${API_BASE_PATH}/verifier`, verifierRoutes)
  app.use(`${API_BASE_PATH}/holder`, holderRoutes)
  app.use(`${API_BASE_PATH}/revocation`, revocationRoutes)
  app.use(`${API_BASE_PATH}/trust`, trustRoutes)
  app.use(`${API_BASE_PATH}/audit`, auditRoutes)
  app.use(`${API_BASE_PATH}/openid4vci`, openid4vciRoutes)
  app.use(`${API_BASE_PATH}/openid4vp`, openid4vpRoutes)
  app.use(`${API_BASE_PATH}/did`, didRoutes)
  app.use(`${API_BASE_PATH}/backup`, backupRoutes)
  app.use(`${API_BASE_PATH}/sdjwt`, sdjwtRoutes)

  // AI Agent Identity routes
  app.use(`${API_BASE_PATH}/agents`, agentRoutes)
  app.use(`${API_BASE_PATH}/wallet`, walletRoutes)
  app.use(`${API_BASE_PATH}/delegations`, delegationRoutes)
  app.use(`${API_BASE_PATH}/agent-trust`, agentTrustRoutes)
  app.use(`${API_BASE_PATH}/schemas`, schemaRoutes)
  app.use(`${API_BASE_PATH}/webhooks`, webhookRoutes)
  app.use(`${API_BASE_PATH}/tenants`, tenantRoutes)
  app.use(`${API_BASE_PATH}/fabric`, fabricRoutes)
  app.use(`${API_BASE_PATH}/didcomm`, didcommRoutes)
  app.use(`${API_BASE_PATH}/policies`, policyRoutes)

  // Legacy routes (for backward compatibility) - redirects to v1
  app.use('/api/issuer', (req: Request, res: Response) => {
    res.redirect(301, `${API_BASE_PATH}/issuer${req.path}`)
  })
  app.use('/api/verifier', (req: Request, res: Response) => {
    res.redirect(301, `${API_BASE_PATH}/verifier${req.path}`)
  })
  app.use('/api/holder', (req: Request, res: Response) => {
    res.redirect(301, `${API_BASE_PATH}/holder${req.path}`)
  })

  // Serve static files for admin dashboard (no auth required)
  // The dashboard is accessible at the root URL
  const publicPath = path.join(__dirname, '..', 'public')
  app.use(express.static(publicPath))

  // Serve index.html for root path (dashboard)
  app.get('/', (req: Request, res: Response) => {
    res.sendFile(path.join(publicPath, 'index.html'))
  })

  // NOTE: Error/404 handlers are added AFTER Credo init via finalizeServer()
  // This allows Credo to register its OpenID4VC routes before the catch-all handlers

  return app
}

/**
 * Finalize server by adding error/404 handlers.
 * Must be called AFTER any dynamic route registration (e.g., Credo OpenID4VC).
 */
export function finalizeServer(app: Express): void {
  // Error handling middleware
  app.use(errorMiddleware)

  // 404 handler
  app.use(notFoundMiddleware)
}

export { API_VERSION, API_BASE_PATH }
