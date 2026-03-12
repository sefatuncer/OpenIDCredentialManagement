import { Router, Request, Response } from 'express'
import { schemaRegistry } from '../../services/schemaRegistry.service'
import { logger } from '../../utils/logger'
import { validateBody } from '../middleware/validation.middleware'
import { asyncHandler } from '../middleware/error.middleware'
import {
  credentialSchemaCreateSchema,
  credentialSchemaUpdateSchema,
} from '../schemas/validation.schemas'
import { credentialIssuanceRateLimiter } from '../middleware/rateLimit.middleware'

export const schemaRoutes = Router()

/**
 * GET /schemas — List all active schemas
 */
schemaRoutes.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const schemas = await schemaRegistry.getAllSchemas()
    res.json({ schemas })
  })
)

/**
 * GET /schemas/:id — Get schema by ID
 */
schemaRoutes.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const schemaId = req.params.id.slice(0, 100)
    const schema = await schemaRegistry.getSchema(schemaId)

    if (!schema) {
      res.status(404).json({ error: `Schema '${schemaId}' not found` })
      return
    }

    res.json({ schema })
  })
)

/**
 * POST /schemas — Register a new schema
 */
schemaRoutes.post(
  '/',
  credentialIssuanceRateLimiter,
  validateBody(credentialSchemaCreateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const schema = await schemaRegistry.registerSchema({
        ...req.body,
        properties: req.body.properties || {},
      })

      logger.info(`Schema registered via API: ${schema.id}`)
      res.status(201).json({ schema })
    } catch (error) {
      const message = (error as Error).message
      if (message.includes('already exists')) {
        res.status(409).json({ error: message })
        return
      }
      throw error
    }
  })
)

/**
 * PUT /schemas/:id — Update an existing schema
 */
schemaRoutes.put(
  '/:id',
  credentialIssuanceRateLimiter,
  validateBody(credentialSchemaUpdateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const schema = await schemaRegistry.updateSchema(req.params.id, req.body)
      logger.info(`Schema updated via API: ${req.params.id}`)
      res.json({ schema })
    } catch (error) {
      const message = (error as Error).message
      if (message.includes('not found')) {
        res.status(404).json({ error: message })
        return
      }
      throw error
    }
  })
)

/**
 * DELETE /schemas/:id — Deactivate schema (soft delete)
 */
schemaRoutes.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const deleteId = req.params.id.slice(0, 100)
    const success = await schemaRegistry.deactivateSchema(deleteId)

    if (!success) {
      res.status(404).json({ error: `Schema '${deleteId}' not found` })
      return
    }

    logger.info(`Schema deactivated via API: ${deleteId}`)
    res.json({ success: true })
  })
)
