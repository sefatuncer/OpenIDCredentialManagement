/**
 * Agent Trust Routes
 * API endpoints for managing trust relationships between AI agents
 */

import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { validateBody } from '../middleware/validation.middleware'
import { asyncHandler } from '../middleware/error.middleware'
import { query, queryOne } from '../../database/connection'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '../../utils/logger'

export const agentTrustRoutes = Router()

// Validation schemas
const establishTrustSchema = z.object({
  agentDid: z.string().min(1),
  trustedDid: z.string().min(1),
  trustLevel: z.enum(['low', 'medium', 'high', 'verified']),
  mutual: z.boolean().default(false),
  expiresAt: z.string().datetime().optional(),
})

const updateTrustSchema = z.object({
  trustLevel: z.enum(['low', 'medium', 'high', 'verified']).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
})

/**
 * @swagger
 * /agent-trust:
 *   post:
 *     summary: Establish trust between agents
 *     tags: [Agent Trust]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [agentDid, trustedDid, trustLevel]
 *             properties:
 *               agentDid:
 *                 type: string
 *                 description: DID of the trusting agent
 *               trustedDid:
 *                 type: string
 *                 description: DID of the trusted agent
 *               trustLevel:
 *                 type: string
 *                 enum: [low, medium, high, verified]
 *               mutual:
 *                 type: boolean
 *                 default: false
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Trust relationship established
 *       400:
 *         description: Validation error or relationship already exists
 */
agentTrustRoutes.post(
  '/',
  validateBody(establishTrustSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { agentDid, trustedDid, trustLevel, mutual, expiresAt } = req.body

    // Check if relationship already exists
    const existing = await queryOne(
      `SELECT id FROM agent_trust_relationships WHERE agent_did = $1 AND trusted_did = $2`,
      [agentDid, trustedDid]
    )

    if (existing) {
      res.status(400).json({
        error: 'already_exists',
        message: 'Trust relationship already exists between these agents',
      })
      return
    }

    const id = uuidv4()
    const now = new Date()

    await query(
      `INSERT INTO agent_trust_relationships
       (id, agent_did, trusted_did, trust_level, mutual, established_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, agentDid, trustedDid, trustLevel, mutual, now, expiresAt ? new Date(expiresAt) : null]
    )

    // If mutual, create reverse relationship
    if (mutual) {
      const reverseId = uuidv4()
      await query(
        `INSERT INTO agent_trust_relationships
         (id, agent_did, trusted_did, trust_level, mutual, established_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (agent_did, trusted_did) DO NOTHING`,
        [reverseId, trustedDid, agentDid, trustLevel, true, now, expiresAt ? new Date(expiresAt) : null]
      )
    }

    logger.info('Trust relationship established', { agentDid, trustedDid, trustLevel, mutual })

    res.status(201).json({
      success: true,
      relationship: {
        id,
        agentDid,
        trustedDid,
        trustLevel,
        mutual,
        establishedAt: now,
        expiresAt: expiresAt || null,
      },
    })
  })
)

/**
 * @swagger
 * /agent-trust/{agentDid}:
 *   get:
 *     summary: Get trust relationships for an agent
 *     tags: [Agent Trust]
 *     parameters:
 *       - in: path
 *         name: agentDid
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Trust relationships
 */
agentTrustRoutes.get(
  '/:agentDid',
  asyncHandler(async (req: Request, res: Response) => {
    const { agentDid } = req.params
    const decodedDid = decodeURIComponent(agentDid)

    const trustedAgents = await query(
      `SELECT tr.*, a.name, a.type
       FROM agent_trust_relationships tr
       LEFT JOIN agents a ON tr.trusted_did = a.did
       WHERE tr.agent_did = $1
       ORDER BY tr.established_at DESC`,
      [decodedDid]
    )

    const trustedBy = await query(
      `SELECT tr.*, a.name, a.type
       FROM agent_trust_relationships tr
       LEFT JOIN agents a ON tr.agent_did = a.did
       WHERE tr.trusted_did = $1
       ORDER BY tr.established_at DESC`,
      [decodedDid]
    )

    res.json({
      agentDid: decodedDid,
      trustedAgents: trustedAgents.rows.map((r: any) => ({
        id: r.id,
        trustedDid: r.trusted_did,
        trustedName: r.name || 'Unknown',
        trustedType: r.type,
        trustLevel: r.trust_level,
        mutual: r.mutual,
        establishedAt: r.established_at,
        expiresAt: r.expires_at,
        lastInteractionAt: r.last_interaction_at,
      })),
      trustedBy: trustedBy.rows.map((r: any) => ({
        id: r.id,
        agentDid: r.agent_did,
        agentName: r.name || 'Unknown',
        agentType: r.type,
        trustLevel: r.trust_level,
        mutual: r.mutual,
        establishedAt: r.established_at,
        expiresAt: r.expires_at,
      })),
    })
  })
)

/**
 * @swagger
 * /agent-trust/{agentDid}/{trustedDid}:
 *   patch:
 *     summary: Update trust relationship
 *     tags: [Agent Trust]
 *     parameters:
 *       - in: path
 *         name: agentDid
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: trustedDid
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               trustLevel:
 *                 type: string
 *                 enum: [low, medium, high, verified]
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Trust relationship updated
 *       404:
 *         description: Trust relationship not found
 */
agentTrustRoutes.patch(
  '/:agentDid/:trustedDid',
  validateBody(updateTrustSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { agentDid, trustedDid } = req.params
    const { trustLevel, expiresAt } = req.body

    const setClauses: string[] = []
    const values: unknown[] = []
    let paramIndex = 1

    if (trustLevel !== undefined) {
      setClauses.push(`trust_level = $${paramIndex++}`)
      values.push(trustLevel)
    }

    if (expiresAt !== undefined) {
      setClauses.push(`expires_at = $${paramIndex++}`)
      values.push(expiresAt ? new Date(expiresAt) : null)
    }

    if (setClauses.length === 0) {
      res.status(400).json({ error: 'no_updates', message: 'No updates provided' })
      return
    }

    values.push(decodeURIComponent(agentDid))
    values.push(decodeURIComponent(trustedDid))

    const result = await query(
      `UPDATE agent_trust_relationships
       SET ${setClauses.join(', ')}
       WHERE agent_did = $${paramIndex} AND trusted_did = $${paramIndex + 1}
       RETURNING *`,
      values
    )

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'not_found', message: 'Trust relationship not found' })
      return
    }

    res.json({
      success: true,
      relationship: result.rows[0],
    })
  })
)

/**
 * @swagger
 * /agent-trust/{agentDid}/{trustedDid}:
 *   delete:
 *     summary: Remove trust relationship
 *     tags: [Agent Trust]
 *     parameters:
 *       - in: path
 *         name: agentDid
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: trustedDid
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Trust relationship removed
 *       404:
 *         description: Trust relationship not found
 */
agentTrustRoutes.delete(
  '/:agentDid/:trustedDid',
  asyncHandler(async (req: Request, res: Response) => {
    const { agentDid, trustedDid } = req.params
    const decodedAgentDid = decodeURIComponent(agentDid)
    const decodedTrustedDid = decodeURIComponent(trustedDid)

    const result = await query(
      `DELETE FROM agent_trust_relationships
       WHERE agent_did = $1 AND trusted_did = $2
       RETURNING id`,
      [decodedAgentDid, decodedTrustedDid]
    )

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'not_found', message: 'Trust relationship not found' })
      return
    }

    logger.info('Trust relationship removed', { agentDid: decodedAgentDid, trustedDid: decodedTrustedDid })

    res.json({
      success: true,
      message: 'Trust relationship removed',
    })
  })
)

/**
 * @swagger
 * /agent-trust/verify:
 *   post:
 *     summary: Verify trust between agents
 *     tags: [Agent Trust]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [agentDid, trustedDid]
 *             properties:
 *               agentDid:
 *                 type: string
 *               trustedDid:
 *                 type: string
 *               requiredLevel:
 *                 type: string
 *                 enum: [low, medium, high, verified]
 *     responses:
 *       200:
 *         description: Trust verification result
 */
agentTrustRoutes.post(
  '/verify',
  asyncHandler(async (req: Request, res: Response) => {
    const { agentDid, trustedDid, requiredLevel } = req.body

    const relationship = await queryOne(
      `SELECT * FROM agent_trust_relationships
       WHERE agent_did = $1 AND trusted_did = $2`,
      [agentDid, trustedDid]
    )

    if (!relationship) {
      res.json({
        trusted: false,
        reason: 'No trust relationship exists',
      })
      return
    }

    // Check expiration
    if (relationship.expires_at && new Date(relationship.expires_at) < new Date()) {
      res.json({
        trusted: false,
        reason: 'Trust relationship has expired',
      })
      return
    }

    // Check required level
    const trustLevels = ['low', 'medium', 'high', 'verified']
    const currentLevelIndex = trustLevels.indexOf(relationship.trust_level)
    const requiredLevelIndex = requiredLevel ? trustLevels.indexOf(requiredLevel) : 0

    if (currentLevelIndex < requiredLevelIndex) {
      res.json({
        trusted: false,
        reason: `Trust level ${relationship.trust_level} is below required level ${requiredLevel}`,
        currentLevel: relationship.trust_level,
        requiredLevel,
      })
      return
    }

    res.json({
      trusted: true,
      trustLevel: relationship.trust_level,
      mutual: relationship.mutual,
      establishedAt: relationship.established_at,
      expiresAt: relationship.expires_at,
    })
  })
)
