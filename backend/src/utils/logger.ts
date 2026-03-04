import winston from 'winston'
import path from 'path'

// Determine if we're in production
const isProduction = process.env.NODE_ENV === 'production'

// JSON format for production (ELK/Datadog compatible)
const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
)

// Pretty format for development
const prettyFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, stack, correlationId, ...meta }) => {
    let log = `${timestamp} [${level}]`
    if (correlationId) {
      log += ` [${correlationId}]`
    }
    log += `: ${message}`
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`
    }
    if (stack) {
      log += `\n${stack}`
    }
    return log
  })
)

// Create transports array
const transports: winston.transport[] = [
  // Console transport
  new winston.transports.Console({
    format: isProduction ? jsonFormat : prettyFormat,
  }),
]

// File transports for production
if (isProduction) {
  const logDir = process.env.LOG_DIR || 'logs'

  // Error log file
  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      format: jsonFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 30,
      tailable: true,
    })
  )

  // Combined log file
  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      format: jsonFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 30,
      tailable: true,
    })
  )
} else {
  // Simple file logging for development
  transports.push(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
    })
  )
}

// Create logger instance
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: {
    service: process.env.SERVICE_NAME || 'ai-agent-identity',
  },
  transports,
})

// Add correlation ID to log context
export function withCorrelationId(correlationId: string): winston.Logger {
  return logger.child({ correlationId })
}

// Request logging middleware helper
export function logRequest(req: {
  method: string
  url: string
  correlationId?: string
  ip?: string
  userAgent?: string
}): void {
  logger.info('Incoming request', {
    method: req.method,
    url: req.url,
    correlationId: req.correlationId,
    ip: req.ip,
    userAgent: req.userAgent,
  })
}

// Response logging middleware helper
export function logResponse(res: {
  statusCode: number
  correlationId?: string
  duration?: number
}): void {
  const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'
  logger.log(level, 'Response sent', {
    statusCode: res.statusCode,
    correlationId: res.correlationId,
    durationMs: res.duration,
  })
}
