/**
 * Webhook Management Routes
 *
 * CRUD + test + delivery history for webhook subscriptions
 */

import { Router, Request, Response } from 'express'
import { asyncHandler } from '../middleware/error.middleware'
import { strictRateLimiter } from '../middleware/rateLimit.middleware'
import {
  webhookCreateSchema,
  webhookUpdateSchema,
} from '../schemas/validation.schemas'
import {
  createSubscription,
  updateSubscription,
  deleteSubscription,
  listSubscriptions,
  getSubscription,
  testSubscription,
  getDeliveries,
} from '../../services/webhook.service'

export const webhookRoutes = Router()

/**
 * @swagger
 * /api/v1/webhooks:
 *   get:
 *     summary: List all webhook subscriptions
 *     tags: [Webhooks]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of webhook subscriptions (secrets masked)
 */
webhookRoutes.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const subscriptions = await listSubscriptions()
    // Mask secrets in list view
    const masked = subscriptions.map((s) => ({
      ...s,
      secret: s.secret.substring(0, 8) + '...',
    }))
    res.json({ success: true, webhooks: masked })
  }),
)

/**
 * @swagger
 * /api/v1/webhooks/{id}:
 *   get:
 *     summary: Get webhook subscription detail
 *     tags: [Webhooks]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Webhook subscription ID
 *     responses:
 *       200:
 *         description: Webhook detail (secret masked)
 *       404:
 *         description: Webhook not found
 */
webhookRoutes.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const webhook = await getSubscription(req.params.id)
    if (!webhook) {
      return res.status(404).json({ success: false, error: 'Webhook not found' })
    }
    res.json({
      success: true,
      webhook: { ...webhook, secret: webhook.secret.substring(0, 8) + '...' },
    })
  }),
)

/**
 * @swagger
 * /api/v1/webhooks:
 *   post:
 *     summary: Create a webhook subscription
 *     tags: [Webhooks]
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
 *               - url
 *               - events
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *                 description: Webhook delivery URL (HTTPS required in production)
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Event types to subscribe to
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Webhook created (full secret returned only on creation)
 *       400:
 *         description: Validation error or max subscriptions reached
 */
webhookRoutes.post(
  '/',
  strictRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const result = webhookCreateSchema.safeParse(req.body)
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: result.error.errors,
      })
    }

    try {
      const subscription = await createSubscription(
        result.data.url,
        result.data.events,
        {
          name: result.data.name,
          description: result.data.description,
        },
      )
      // Return full secret only on creation
      res.status(201).json({ success: true, webhook: subscription })
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to create webhook'
      res.status(400).json({ success: false, error: msg })
    }
  }),
)

/**
 * @swagger
 * /api/v1/webhooks/{id}:
 *   put:
 *     summary: Update a webhook subscription
 *     tags: [Webhooks]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Webhook subscription ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *               enabled:
 *                 type: boolean
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Webhook updated (secret masked)
 *       400:
 *         description: Validation error
 *       404:
 *         description: Webhook not found
 */
webhookRoutes.put(
  '/:id',
  strictRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const result = webhookUpdateSchema.safeParse(req.body)
    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: result.error.errors,
      })
    }

    try {
      const { name, description, ...rest } = result.data
      const updated = await updateSubscription(req.params.id, {
        ...rest,
        metadata: name || description ? { name, description } : undefined,
      })

      if (!updated) {
        return res.status(404).json({ success: false, error: 'Webhook not found' })
      }

      res.json({
        success: true,
        webhook: { ...updated, secret: updated.secret.substring(0, 8) + '...' },
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to update webhook'
      res.status(400).json({ success: false, error: msg })
    }
  }),
)

/**
 * @swagger
 * /api/v1/webhooks/{id}:
 *   delete:
 *     summary: Delete a webhook subscription
 *     tags: [Webhooks]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Webhook subscription ID
 *     responses:
 *       200:
 *         description: Webhook deleted
 *       404:
 *         description: Webhook not found
 */
webhookRoutes.delete(
  '/:id',
  strictRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const deleted = await deleteSubscription(req.params.id)
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Webhook not found' })
    }
    res.json({ success: true, message: 'Webhook deleted' })
  }),
)

/**
 * @swagger
 * /api/v1/webhooks/{id}/test:
 *   post:
 *     summary: Send a test event to a webhook endpoint
 *     tags: [Webhooks]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Webhook subscription ID
 *     responses:
 *       200:
 *         description: Test delivery result (success, status, latency)
 *       404:
 *         description: Webhook not found
 */
webhookRoutes.post(
  '/:id/test',
  strictRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const testResult = await testSubscription(req.params.id)
      res.json({
        success: testResult.success,
        responseStatus: testResult.responseStatus,
        latencyMs: testResult.latencyMs,
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Test failed'
      res.status(404).json({ success: false, error: msg })
    }
  }),
)

/**
 * @swagger
 * /api/v1/webhooks/{id}/deliveries:
 *   get:
 *     summary: Get delivery history for a webhook
 *     tags: [Webhooks]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Webhook subscription ID
 *     responses:
 *       200:
 *         description: List of delivery attempts
 *       404:
 *         description: Webhook not found
 */
webhookRoutes.get(
  '/:id/deliveries',
  asyncHandler(async (req: Request, res: Response) => {
    const webhook = await getSubscription(req.params.id)
    if (!webhook) {
      return res.status(404).json({ success: false, error: 'Webhook not found' })
    }

    const deliveries = await getDeliveries(req.params.id)
    res.json({ success: true, deliveries })
  }),
)
