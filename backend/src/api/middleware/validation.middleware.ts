import { Request, Response, NextFunction } from 'express'
import { ZodSchema, ZodError } from 'zod'
import { v4 as uuidv4 } from 'uuid'

export interface ValidationError {
  type: string
  title: string
  status: number
  detail: string
  instance: string
  requestId: string
  errors: Array<{
    path: string
    message: string
  }>
}

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body)
      next()
    } catch (error) {
      if (error instanceof ZodError) {
        const requestId = (req as any).requestId || uuidv4()
        const validationError: ValidationError = {
          type: 'https://api.example.com/problems/validation-error',
          title: 'Validation Error',
          status: 400,
          detail: 'Request body validation failed',
          instance: req.originalUrl,
          requestId,
          errors: error.errors.map((err) => ({
            path: err.path.join('.'),
            message: err.message,
          })),
        }
        res.status(400).json(validationError)
        return
      }
      next(error)
    }
  }
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.query = schema.parse(req.query) as any
      next()
    } catch (error) {
      if (error instanceof ZodError) {
        const requestId = (req as any).requestId || uuidv4()
        const validationError: ValidationError = {
          type: 'https://api.example.com/problems/validation-error',
          title: 'Validation Error',
          status: 400,
          detail: 'Query parameters validation failed',
          instance: req.originalUrl,
          requestId,
          errors: error.errors.map((err) => ({
            path: err.path.join('.'),
            message: err.message,
          })),
        }
        res.status(400).json(validationError)
        return
      }
      next(error)
    }
  }
}

export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.params = schema.parse(req.params) as any
      next()
    } catch (error) {
      if (error instanceof ZodError) {
        const requestId = (req as any).requestId || uuidv4()
        const validationError: ValidationError = {
          type: 'https://api.example.com/problems/validation-error',
          title: 'Validation Error',
          status: 400,
          detail: 'Path parameters validation failed',
          instance: req.originalUrl,
          requestId,
          errors: error.errors.map((err) => ({
            path: err.path.join('.'),
            message: err.message,
          })),
        }
        res.status(400).json(validationError)
        return
      }
      next(error)
    }
  }
}
