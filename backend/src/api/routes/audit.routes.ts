import { Router, Request, Response } from 'express'
import { z } from 'zod'
import {
  queryAuditLogs,
  getAuditLog,
  getAuditStats,
  exportAuditLogs,
  AuditQuery,
} from '../../services/audit.service'
import { validateQuery } from '../middleware/validation.middleware'
import { asyncHandler } from '../middleware/error.middleware'
import { requirePermission } from '../middleware/auth.middleware'

export const auditRoutes = Router()

// All audit routes require admin permission
auditRoutes.use(requirePermission('audit:read'))

// Query schema
const auditQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  eventType: z.string().optional(),
  actorDid: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  action: z.string().optional(),
  success: z.enum(['true', 'false']).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
  offset: z.string().regex(/^\d+$/).optional(),
})

/**
 * @swagger
 * /audit/logs:
 *   get:
 *     summary: Query audit logs
 *     description: Search and filter audit log entries
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter logs after this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter logs before this date
 *       - in: query
 *         name: eventType
 *         schema:
 *           type: string
 *         description: Filter by event type
 *       - in: query
 *         name: actorDid
 *         schema:
 *           type: string
 *         description: Filter by actor DID
 *       - in: query
 *         name: resourceType
 *         schema:
 *           type: string
 *         description: Filter by resource type
 *       - in: query
 *         name: success
 *         schema:
 *           type: boolean
 *         description: Filter by success status
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Maximum number of results
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of results to skip
 *     responses:
 *       200:
 *         description: Audit log entries
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 logs:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 *                 hasMore:
 *                   type: boolean
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
auditRoutes.get(
  '/logs',
  validateQuery(auditQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const query: AuditQuery = {
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      eventType: req.query.eventType as any,
      actorDid: req.query.actorDid as string,
      resourceType: req.query.resourceType as string,
      resourceId: req.query.resourceId as string,
      action: req.query.action as any,
      success: req.query.success === 'true' ? true : req.query.success === 'false' ? false : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 100,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
    }

    const result = await queryAuditLogs(query)
    res.json(result)
  })
)

/**
 * @swagger
 * /audit/logs/{id}:
 *   get:
 *     summary: Get audit log by ID
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Audit log entry
 *       404:
 *         description: Log not found
 */
auditRoutes.get(
  '/logs/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params
    const log = await getAuditLog(id)

    if (!log) {
      res.status(404).json({
        type: 'https://api.example.com/problems/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Audit log ${id} not found`,
      })
      return
    }

    res.json({ log })
  })
)

/**
 * @swagger
 * /audit/stats:
 *   get:
 *     summary: Get audit statistics
 *     description: Returns aggregated statistics about audit logs
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: since
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Calculate stats from this date
 *     responses:
 *       200:
 *         description: Audit statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalLogs:
 *                   type: integer
 *                 byEventType:
 *                   type: object
 *                 byAction:
 *                   type: object
 *                 successRate:
 *                   type: number
 *                 recentErrors:
 *                   type: array
 */
auditRoutes.get(
  '/stats',
  asyncHandler(async (req: Request, res: Response) => {
    const since = req.query.since ? new Date(req.query.since as string) : undefined
    const stats = await getAuditStats(since)
    res.json(stats)
  })
)

/**
 * @swagger
 * /audit/export:
 *   get:
 *     summary: Export audit logs
 *     description: Export audit logs for compliance or backup
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, csv]
 *           default: json
 *     responses:
 *       200:
 *         description: Exported audit logs
 */
auditRoutes.get(
  '/export',
  requirePermission('audit:export'),
  asyncHandler(async (req: Request, res: Response) => {
    const format = req.query.format || 'json'
    const logs = await exportAuditLogs()

    if (format === 'csv') {
      // Simple CSV export
      const headers = ['id', 'timestamp', 'eventType', 'actorDid', 'resourceType', 'resourceId', 'action', 'success']
      const csv = [
        headers.join(','),
        ...logs.map((log) =>
          headers.map((h) => {
            const value = (log as any)[h]
            if (value instanceof Date) return value.toISOString()
            if (typeof value === 'string' && value.includes(',')) return `"${value}"`
            return value ?? ''
          }).join(',')
        ),
      ].join('\n')

      res.setHeader('Content-Type', 'text/csv')
      res.setHeader('Content-Disposition', `attachment; filename=audit-logs-${new Date().toISOString().split('T')[0]}.csv`)
      res.send(csv)
    } else {
      res.json({
        exportedAt: new Date().toISOString(),
        totalLogs: logs.length,
        logs,
      })
    }
  })
)

/**
 * @swagger
 * /audit/events:
 *   get:
 *     summary: Get available event types
 *     description: Returns list of all possible audit event types
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of event types
 */
auditRoutes.get(
  '/events',
  asyncHandler(async (req: Request, res: Response) => {
    const eventTypes = [
      'credential.issued',
      'credential.received',
      'credential.presented',
      'credential.verified',
      'credential.revoked',
      'credential.unrevoked',
      'credential.deleted',
      'auth.login',
      'auth.logout',
      'auth.token_generated',
      'auth.token_introspected',
      'auth.failed',
      'trust.entity_added',
      'trust.entity_removed',
      'trust.entity_updated',
      'trust.policy_created',
      'trust.verification',
      'api.request',
      'api.error',
      'system.startup',
      'system.shutdown',
      'system.config_change',
    ]

    const actions = ['create', 'read', 'update', 'delete', 'verify', 'issue', 'revoke', 'login', 'logout', 'export', 'import']

    res.json({ eventTypes, actions })
  })
)
