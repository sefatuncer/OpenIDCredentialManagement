import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit'
import { Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'

export interface RateLimitConfig {
  windowMs: number
  max: number
  message?: string
}

function createRateLimitResponse(req: Request, requestId: string) {
  return {
    type: 'https://api.example.com/problems/rate-limit-exceeded',
    title: 'Too Many Requests',
    status: 429,
    detail: 'Rate limit exceeded. Please try again later.',
    instance: req.originalUrl,
    requestId,
  }
}

export function createRateLimiter(config: RateLimitConfig): RateLimitRequestHandler {
  return rateLimit({
    windowMs: config.windowMs,
    max: config.max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
      const requestId = (req as any).requestId || uuidv4()
      res.status(429).json(createRateLimitResponse(req, requestId))
    },
    keyGenerator: (req: Request) => {
      // Use API key if present, otherwise IP
      const apiKey = req.headers['x-api-key'] as string
      return apiKey || req.ip || 'unknown'
    },
  })
}

// Default rate limiters for different endpoint types
export const defaultRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
})

export const strictRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute
})

export const credentialIssuanceRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 credential issuances per minute
})

export const verificationRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 50, // 50 verifications per minute
})

export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 auth attempts per 15 minutes
})
