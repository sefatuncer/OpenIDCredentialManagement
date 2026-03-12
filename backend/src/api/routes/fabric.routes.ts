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
 * GET /api/v1/fabric/status — HLF connection status
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
 * GET /api/v1/fabric/anchors — List recent anchor records
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
 * GET /api/v1/fabric/anchors/:referenceId — Get anchor status for a credential/delegation
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
 * POST /api/v1/fabric/anchors/:referenceId/verify — Verify on-chain hash
 */
fabricRoutes.post(
  '/anchors/:referenceId/verify',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await verifyAnchor(req.params.referenceId)
    res.json(result)
  }),
)
