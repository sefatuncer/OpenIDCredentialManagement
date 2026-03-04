import { Router, Request, Response } from 'express'
import { getMetrics, getMetricsContentType } from '../../services/metrics.service'
import { asyncHandler } from '../middleware/error.middleware'

export const metricsRoutes = Router()

/**
 * @swagger
 * /metrics:
 *   get:
 *     summary: Get Prometheus metrics
 *     description: Returns application metrics in Prometheus format
 *     tags: [Monitoring]
 *     security: []
 *     responses:
 *       200:
 *         description: Prometheus metrics
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 */
metricsRoutes.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const metrics = await getMetrics()
    res.set('Content-Type', getMetricsContentType())
    res.send(metrics)
  })
)
