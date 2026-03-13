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
 * @swagger
 * /api/v1/schemas:
 *   get:
 *     summary: List all active credential schemas
 *     tags: [Schemas]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of active schemas
 */
schemaRoutes.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const schemas = await schemaRegistry.getAllSchemas()
    res.json({ schemas })
  })
)

/**
 * @swagger
 * /api/v1/schemas/{id}:
 *   get:
 *     summary: Get a credential schema by ID
 *     tags: [Schemas]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Schema ID
 *     responses:
 *       200:
 *         description: Schema detail
 *       404:
 *         description: Schema not found
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
 * @swagger
 * /api/v1/schemas:
 *   post:
 *     summary: Register a new credential schema
 *     tags: [Schemas]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *               - name
 *               - version
 *             properties:
 *               id:
 *                 type: string
 *               name:
 *                 type: string
 *               version:
 *                 type: string
 *               description:
 *                 type: string
 *               properties:
 *                 type: object
 *     responses:
 *       201:
 *         description: Schema registered
 *       409:
 *         description: Schema already exists
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
 * @swagger
 * /api/v1/schemas/{id}:
 *   put:
 *     summary: Update an existing credential schema
 *     tags: [Schemas]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Schema ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               version:
 *                 type: string
 *               description:
 *                 type: string
 *               properties:
 *                 type: object
 *     responses:
 *       200:
 *         description: Schema updated
 *       404:
 *         description: Schema not found
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
 * @swagger
 * /api/v1/schemas/{id}:
 *   delete:
 *     summary: Deactivate a credential schema (soft delete)
 *     tags: [Schemas]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Schema ID
 *     responses:
 *       200:
 *         description: Schema deactivated
 *       404:
 *         description: Schema not found
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
