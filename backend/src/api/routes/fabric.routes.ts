/**
 * Fabric Anchor API Routes
 *
 * Provides endpoints to query and verify HLF anchor records.
 * Feature-flag gated: module.hlf-anchoring
 */

import { Router, Request, Response } from 'express'
import { isFeatureEnabled } from '../../core/feature-flags'
import { asyncHandler } from '../middleware/error.middleware'
import {
  getAnchorStatus,
  listAnchors,
  verifyAnchor,
  isConnected,
} from '../../services/fabricAnchor.service'

export const fabricRoutes = Router()

/**
 * Check if HLF anchoring is enabled
 */
function requireHlf(_req: Request, res: Response, next: () => void): void {
  if (!isFeatureEnabled('module.hlf-anchoring')) {
    res.status(404).json({ error: 'HLF anchoring is not enabled' })
    return
  }
  next()
}

fabricRoutes.use(requireHlf)

/**
 * @swagger
 * /api/v1/fabric/status:
 *   get:
 *     summary: Get HLF connection status
 *     tags: [Fabric]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: HLF anchoring status
 *       404:
 *         description: HLF anchoring not enabled
 */
fabricRoutes.get(
  '/status',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({
      enabled: true,
      connected: isConnected(),
    })
  }),
)

/**
 * @swagger
 * /api/v1/fabric/anchors:
 *   get:
 *     summary: List recent anchor records
 *     tags: [Fabric]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Max records to return (1-100)
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Pagination offset
 *     responses:
 *       200:
 *         description: List of anchor records
 *       404:
 *         description: HLF anchoring not enabled
 */
fabricRoutes.get(
  '/anchors',
  asyncHandler(async (req: Request, res: Response) => {
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 50), 100)
    const offset = Math.max(0, parseInt(req.query.offset as string) || 0)

    const result = await listAnchors(limit, offset)
    res.json(result)
  }),
)

/**
 * @swagger
 * /api/v1/fabric/anchors/{referenceId}:
 *   get:
 *     summary: Get anchor status for a credential or delegation
 *     tags: [Fabric]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: referenceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Credential or delegation reference ID
 *     responses:
 *       200:
 *         description: Anchor records for the reference
 *       404:
 *         description: No anchor records found
 */
fabricRoutes.get(
  '/anchors/:referenceId',
  asyncHandler(async (req: Request, res: Response) => {
    const records = await getAnchorStatus(req.params.referenceId)
    if (records.length === 0) {
      res.status(404).json({ error: 'No anchor records found for this reference' })
      return
    }
    res.json({ referenceId: req.params.referenceId, records })
  }),
)

/**
 * @swagger
 * /api/v1/fabric/anchors/{referenceId}/verify:
 *   post:
 *     summary: Verify on-chain hash for an anchor record
 *     tags: [Fabric]
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: referenceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Reference ID to verify
 *     responses:
 *       200:
 *         description: Verification result
 *       404:
 *         description: HLF anchoring not enabled
 */
fabricRoutes.post(
  '/anchors/:referenceId/verify',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await verifyAnchor(req.params.referenceId)
    res.json(result)
  }),
)
