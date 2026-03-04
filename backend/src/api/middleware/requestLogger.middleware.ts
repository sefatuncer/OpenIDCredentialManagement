import { Request, Response, NextFunction } from 'express'
import { logger } from '../../utils/logger'
import { recordHttpRequest } from '../../services/metrics.service'
import { logApiRequest } from '../../services/audit.service'

export interface RequestLogOptions {
  /**
   * Skip logging for certain paths
   */
  excludePaths?: string[]

  /**
   * Log request body (careful with sensitive data)
   */
  logBody?: boolean

  /**
   * Log response body (careful with large responses)
   */
  logResponseBody?: boolean

  /**
   * Maximum body length to log
   */
  maxBodyLength?: number

  /**
   * Enable audit logging for requests
   */
  enableAuditLog?: boolean

  /**
   * Slow request threshold in ms
   */
  slowRequestThreshold?: number
}

const defaultOptions: RequestLogOptions = {
  excludePaths: ['/health', '/health/ready', '/health/live', '/metrics'],
  logBody: false,
  logResponseBody: false,
  maxBodyLength: 1000,
  enableAuditLog: true,
  slowRequestThreshold: 3000,
}

/**
 * Sanitize sensitive fields from objects
 */
function sanitizeData(data: any, maxLength: number): any {
  if (!data) return undefined

  const sensitiveFields = [
    'password',
    'secret',
    'token',
    'apiKey',
    'api_key',
    'authorization',
    'credential',
    'private',
    'key',
  ]

  const sanitized = { ...data }

  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]'
    }
  }

  const str = JSON.stringify(sanitized)
  if (str.length > maxLength) {
    return '[Data truncated - too large]'
  }

  return sanitized
}

/**
 * Extract client information from request
 */
function getClientInfo(req: Request): {
  ip: string
  userAgent: string
  referer: string | undefined
} {
  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown'

  return {
    ip,
    userAgent: req.headers['user-agent'] || 'unknown',
    referer: req.headers['referer'] as string | undefined,
  }
}

/**
 * API Request Logging Middleware
 *
 * Logs all API requests with timing, status, and optional body logging.
 * Integrates with Prometheus metrics and audit logging.
 */
export function requestLoggerMiddleware(options: RequestLogOptions = {}) {
  const opts = { ...defaultOptions, ...options }

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip excluded paths
    if (opts.excludePaths?.some((path) => req.path.startsWith(path))) {
      return next()
    }

    const startTime = Date.now()
    const requestId = (req as any).requestId || generateRequestId()
    const clientInfo = getClientInfo(req)

    // Attach request ID if not present
    if (!(req as any).requestId) {
      ;(req as any).requestId = requestId
    }

    // Log request start
    const requestLog: any = {
      requestId,
      method: req.method,
      path: req.path,
      query: Object.keys(req.query).length > 0 ? req.query : undefined,
      clientIp: clientInfo.ip,
      userAgent: clientInfo.userAgent,
    }

    if (opts.logBody && req.body && Object.keys(req.body).length > 0) {
      requestLog.body = sanitizeData(req.body, opts.maxBodyLength!)
    }

    logger.debug('Request started', requestLog)

    // Capture response
    const originalSend = res.send
    let responseBody: any

    res.send = function (body: any) {
      responseBody = body
      return originalSend.call(this, body)
    }

    // Log response when finished
    res.on('finish', () => {
      const duration = Date.now() - startTime
      const statusCode = res.statusCode
      const isError = statusCode >= 400
      const isSlow = duration > opts.slowRequestThreshold!

      const responseLog: any = {
        requestId,
        method: req.method,
        path: req.path,
        statusCode,
        duration: `${duration}ms`,
        contentLength: res.get('content-length'),
      }

      // Add response body for errors if enabled
      if (opts.logResponseBody && isError && responseBody) {
        try {
          const parsed =
            typeof responseBody === 'string'
              ? JSON.parse(responseBody)
              : responseBody
          responseLog.responseBody = sanitizeData(parsed, opts.maxBodyLength!)
        } catch {
          // Response is not JSON
        }
      }

      // Log with appropriate level
      if (isError) {
        logger.warn('Request completed with error', responseLog)
      } else if (isSlow) {
        logger.warn('Slow request detected', responseLog)
      } else {
        logger.info('Request completed', responseLog)
      }

      // Record metrics
      recordHttpRequest(req.method, req.path, statusCode, duration / 1000)

      // Audit log for important operations
      if (opts.enableAuditLog && shouldAuditLog(req)) {
        try {
          logApiRequest(
            req.method,
            req.path,
            statusCode,
            duration,
            (req as any).user?.sub,
            clientInfo.ip,
            clientInfo.userAgent,
            requestId,
            isError ? 'Request failed' : undefined
          )
        } catch (err: any) {
          logger.error('Failed to write audit log', { error: err })
        }
      }
    })

    next()
  }
}

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Determine if request should be audit logged
 */
function shouldAuditLog(req: Request): boolean {
  // Log all mutations
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return true
  }

  // Log sensitive endpoints
  const sensitiveEndpoints = [
    '/auth',
    '/credentials',
    '/revocation',
    '/trust',
    '/issuer',
    '/verifier',
  ]

  return sensitiveEndpoints.some((endpoint) => req.path.includes(endpoint))
}

/**
 * Simple request logger for development
 */
export function simpleRequestLogger(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const start = Date.now()

  res.on('finish', () => {
    const duration = Date.now() - start
    console.log(
      `${req.method} ${req.path} ${res.statusCode} - ${duration}ms`
    )
  })

  next()
}

/**
 * Morgan-style format string logger
 */
export function formatRequestLog(
  req: Request,
  res: Response,
  duration: number
): string {
  const clientInfo = getClientInfo(req)
  return `${clientInfo.ip} - ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms - ${clientInfo.userAgent}`
}
