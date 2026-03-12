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

// GET /webhooks — list all subscriptions
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

// GET /webhooks/:id — subscription detail
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

// POST /webhooks — create subscription
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

// PUT /webhooks/:id — update subscription
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

// DELETE /webhooks/:id — delete subscription
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

// POST /webhooks/:id/test — send test event
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

// GET /webhooks/:id/deliveries — delivery history
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
