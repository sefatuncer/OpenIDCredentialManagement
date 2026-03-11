import { Request, Response, NextFunction } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '../../utils/logger'

/**
 * RFC 7807 Problem Details for HTTP APIs
 * https://tools.ietf.org/html/rfc7807
 */
export interface ProblemDetails {
  type: string
  title: string
  status: number
  detail?: string
  instance?: string
  requestId?: string
  [key: string]: any
}

export interface ApiError extends Error {
  statusCode?: number
  code?: string
  type?: string
}

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = (req.headers['x-request-id'] as string) || uuidv4()
  ;(req as any).requestId = requestId
  res.setHeader('X-Request-ID', requestId)
  next()
}

export function errorMiddleware(
  err: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = (req as any).requestId || uuidv4()
  const statusCode = err.statusCode || 500
  const isProduction = process.env.NODE_ENV === 'production'

  // Map common error codes to problem types
  const problemType = getProblemType(statusCode, err.code)

  const problemDetails: ProblemDetails = {
    type: err.type || problemType.type,
    title: problemType.title,
    status: statusCode,
    detail: isProduction && statusCode === 500 ? 'An internal error occurred' : err.message,
    instance: req.originalUrl,
    requestId,
  }

  // Add error code if present
  if (err.code) {
    problemDetails.code = err.code
  }

  // Add stack trace in development
  if (!isProduction && err.stack) {
    problemDetails.stack = err.stack.split('\n')
  }

  logger.error('API Error', {
    requestId,
    statusCode,
    message: err.message,
    code: err.code,
    path: req.path,
    method: req.method,
    stack: err.stack,
  })

  res.status(statusCode).json(problemDetails)
}

export function notFoundMiddleware(req: Request, res: Response): void {
  // Skip if response already sent (e.g., by Credo OpenID4VC routes)
  if (res.headersSent) return;
  const requestId = (req as any).requestId || uuidv4()

  const problemDetails: ProblemDetails = {
    type: 'https://api.example.com/problems/not-found',
    title: 'Not Found',
    status: 404,
    detail: `The requested resource '${req.path}' was not found`,
    instance: req.originalUrl,
    requestId,
  }

  res.status(404).json(problemDetails)
}

export function createApiError(
  message: string,
  statusCode: number,
  code?: string,
  type?: string
): ApiError {
  const error: ApiError = new Error(message)
  error.statusCode = statusCode
  error.code = code
  error.type = type
  return error
}

function getProblemType(
  statusCode: number,
  code?: string
): { type: string; title: string } {
  const baseUrl = 'https://api.example.com/problems'

  const typeMap: Record<number, { type: string; title: string }> = {
    400: { type: `${baseUrl}/bad-request`, title: 'Bad Request' },
    401: { type: `${baseUrl}/unauthorized`, title: 'Unauthorized' },
    403: { type: `${baseUrl}/forbidden`, title: 'Forbidden' },
    404: { type: `${baseUrl}/not-found`, title: 'Not Found' },
    405: { type: `${baseUrl}/method-not-allowed`, title: 'Method Not Allowed' },
    409: { type: `${baseUrl}/conflict`, title: 'Conflict' },
    422: { type: `${baseUrl}/unprocessable-entity`, title: 'Unprocessable Entity' },
    429: { type: `${baseUrl}/rate-limit-exceeded`, title: 'Too Many Requests' },
    500: { type: `${baseUrl}/internal-error`, title: 'Internal Server Error' },
    502: { type: `${baseUrl}/bad-gateway`, title: 'Bad Gateway' },
    503: { type: `${baseUrl}/service-unavailable`, title: 'Service Unavailable' },
  }

  return typeMap[statusCode] || { type: `${baseUrl}/error`, title: 'Error' }
}

// Async handler wrapper to catch promise rejections
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}
