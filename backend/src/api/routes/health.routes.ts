import { Router, Request, Response } from 'express'
import { getStorageStatus, isCacheAvailable } from '../../core/storage'
import { getEnabledFeatures, getAllFeatureFlags, isFeatureEnabled } from '../../core/feature-flags'
import { isDidCommEnabled } from '../../services/didcomm.service'
import { pluginRegistry } from '../../core/plugin-registry'
import { eventBus } from '../../core/event-bus'
import { isDatabaseConnected } from '../../database/connection'
import { getFeatureSummary } from '../../config/features.config'

export const healthRoutes = Router()

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check
 *     description: Returns the health status of the API
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: API is healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 */
healthRoutes.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
  })
})

/**
 * @swagger
 * /health/ready:
 *   get:
 *     summary: Readiness check
 *     description: Returns whether the API is ready to accept requests
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: API is ready
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ready:
 *                   type: boolean
 *                   example: true
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
healthRoutes.get('/ready', (req: Request, res: Response) => {
  res.json({
    ready: true,
    timestamp: new Date().toISOString(),
  })
})

/**
 * @swagger
 * /health/live:
 *   get:
 *     summary: Liveness check
 *     description: Returns whether the API is alive (for Kubernetes probes)
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: API is alive
 */
healthRoutes.get('/live', (req: Request, res: Response) => {
  res.json({
    alive: true,
    timestamp: new Date().toISOString(),
  })
})

/**
 * @swagger
 * /health/detailed:
 *   get:
 *     summary: Detailed health check
 *     description: Returns detailed health status including storage, features, and plugins
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: Detailed health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                 uptime:
 *                   type: number
 *                 storage:
 *                   type: object
 *                 features:
 *                   type: object
 *                 plugins:
 *                   type: object
 */
healthRoutes.get('/detailed', async (req: Request, res: Response) => {
  try {
    // Get storage status
    const storageStatus = getStorageStatus()

    // Check database connection
    let databaseConnected = false
    try {
      databaseConnected = await isDatabaseConnected()
    } catch {
      databaseConnected = false
    }

    // Get feature summary
    const featureSummary = getFeatureSummary()

    // Get plugin status
    const pluginStats = pluginRegistry.getStats()
    const pluginList = pluginRegistry.list()

    // Get event bus stats
    const eventStats = {
      subscriptions: eventBus.getSubscriptionCount(),
      recentEvents: eventBus.getHistory({ limit: 5 }).map((e) => ({
        type: e.type,
        timestamp: e.timestamp,
      })),
    }

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',

      storage: {
        ...storageStatus,
        databaseConnected,
        cacheAvailable: isCacheAvailable(),
      },

      features: {
        preset: featureSummary.preset,
        enabled: featureSummary.total.enabled,
        disabled: featureSummary.total.disabled,
        byCategory: featureSummary.categories,
      },

      plugins: {
        total: pluginList.length,
        ...pluginStats,
        list: pluginList.map((p) => ({
          name: p.name,
          version: p.version,
          state: p.state,
        })),
      },

      didcomm: {
        featureEnabled: isFeatureEnabled('module.didcomm'),
        moduleLoaded: isDidCommEnabled(),
      },

      events: eventStats,

      memory: {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        unit: 'MB',
      },
    })
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    })
  }
})

/**
 * @swagger
 * /health/features:
 *   get:
 *     summary: Feature flags status
 *     description: Returns the current status of all feature flags
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: Feature flags status
 */
healthRoutes.get('/features', (req: Request, res: Response) => {
  const allFlags = getAllFeatureFlags()
  const enabledFlags = getEnabledFeatures()

  res.json({
    timestamp: new Date().toISOString(),
    enabled: enabledFlags,
    all: Object.entries(allFlags).reduce(
      (acc, [name, { enabled, definition }]) => {
        acc[name] = {
          enabled,
          category: definition.category,
          description: definition.description,
        }
        return acc
      },
      {} as Record<string, { enabled: boolean; category: string; description: string }>
    ),
  })
})

/**
 * @swagger
 * /health/storage:
 *   get:
 *     summary: Storage status
 *     description: Returns the current storage backend status
 *     tags: [Health]
 *     security: []
 *     responses:
 *       200:
 *         description: Storage status
 */
healthRoutes.get('/storage', async (req: Request, res: Response) => {
  try {
    const storageStatus = getStorageStatus()

    let databaseConnected = false
    try {
      databaseConnected = await isDatabaseConnected()
    } catch {
      databaseConnected = false
    }

    res.json({
      timestamp: new Date().toISOString(),
      ...storageStatus,
      databaseConnected,
      cacheAvailable: isCacheAvailable(),
    })
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    })
  }
})
