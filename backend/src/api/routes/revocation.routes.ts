import { Router, Request, Response } from 'express'
import { z } from 'zod'
import {
  revokeCredential,
  unrevokeCredential,
  getCredentialStatus,
  getStatusList,
  getStatusListCredential,
  checkStatusListEntry,
  getRevocationStats,
  isCredentialRevoked,
  getAllStatusLists,
} from '../../services/revocation.service'
import { validateBody, validateParams } from '../middleware/validation.middleware'
import { asyncHandler } from '../middleware/error.middleware'
import { strictRateLimiter } from '../middleware/rateLimit.middleware'
import { logger } from '../../utils/logger'

export const revocationRoutes = Router()

/**
 * @swagger
 * /revocation/agent:
 *   post:
 *     summary: Revoke all credentials for an agent
 *     description: Revokes all credentials issued to a specific agent by their DID
 *     tags: [Revocation]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - agentDid
 *             properties:
 *               agentDid:
 *                 type: string
 *                 description: DID of the agent whose credentials should be revoked
 *                 example: "did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH"
 *               reason:
 *                 type: string
 *                 description: Reason for revocation
 *                 example: "unauthorized_behavior"
 *               revokedBy:
 *                 type: string
 *                 description: Email or ID of the admin revoking the credentials
 *                 example: "admin@system.com"
 *     responses:
 *       200:
 *         description: Credentials revoked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 revokedCount:
 *                   type: integer
 *                 agentDid:
 *                   type: string
 *       404:
 *         description: Agent not found
 */
revocationRoutes.post(
  '/agent',
  strictRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { agentDid, reason, revokedBy } = req.body

    if (!agentDid) {
      res.status(400).json({
        type: 'https://api.example.com/problems/validation-error',
        title: 'Validation Error',
        status: 400,
        detail: 'agentDid is required',
      })
      return
    }

    // Import agent service dynamically to avoid circular deps
    const agentService = await import('../../services/agent.service')
    const agent = await agentService.getAgentByDid(agentDid)

    if (!agent) {
      res.status(404).json({
        type: 'https://api.example.com/problems/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Agent ${agentDid} not found`,
      })
      return
    }

    // Get all credentials for this agent and revoke them
    const { query } = await import('../../database/connection')
    const credentials = await query(
      `SELECT id, type FROM agent_credentials WHERE agent_id = $1`,
      [agent.id]
    )

    let revokedCount = 0
    for (const cred of credentials.rows) {
      const success = await revokeCredential(cred.id, reason || 'Agent credential revoked')
      if (success) revokedCount++
    }

    // Also suspend the agent
    await agentService.updateAgent(agentDid, { status: 'revoked' })

    // Log the revocation
    await agentService.logAgentActivity(
      agent.id,
      'all_credentials_revoked',
      'success',
      undefined,
      { reason, revokedBy, revokedCount }
    )

    logger.info('Agent credentials revoked', {
      agentDid,
      revokedCount,
      reason,
      revokedBy,
    })

    res.json({
      success: true,
      message: `All credentials for agent have been revoked`,
      agentDid,
      revokedCount,
      agentStatus: 'revoked',
      revokedAt: new Date().toISOString(),
      revokedBy,
    })
  })
)

// Validation schemas
const revokeCredentialSchema = z.object({
  credentialId: z.string().min(1, 'Credential ID is required'),
  reason: z.string().optional(),
})

const credentialIdParamSchema = z.object({
  credentialId: z.string().min(1),
})

const statusListIdParamSchema = z.object({
  statusListId: z.string().min(1),
})

const checkStatusSchema = z.object({
  statusListId: z.string().min(1),
  statusListIndex: z.number().int().min(0),
})

/**
 * @swagger
 * /revocation/revoke:
 *   post:
 *     summary: Revoke a credential
 *     description: Marks a credential as revoked in the status list
 *     tags: [Revocation]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - credentialId
 *             properties:
 *               credentialId:
 *                 type: string
 *                 description: ID of the credential to revoke
 *               reason:
 *                 type: string
 *                 description: Reason for revocation
 *     responses:
 *       200:
 *         description: Credential revoked successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         description: Credential not found
 */
revocationRoutes.post(
  '/revoke',
  strictRateLimiter,
  validateBody(revokeCredentialSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { credentialId, reason } = req.body

    const success = await revokeCredential(credentialId, reason)

    if (!success) {
      res.status(404).json({
        type: 'https://api.example.com/problems/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Credential ${credentialId} not found`,
      })
      return
    }

    res.json({
      success: true,
      message: 'Credential revoked successfully',
      credentialId,
      revokedAt: new Date().toISOString(),
    })
  })
)

/**
 * @swagger
 * /revocation/unrevoke:
 *   post:
 *     summary: Unrevoke (reinstate) a credential
 *     description: Removes the revocation status from a credential
 *     tags: [Revocation]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - credentialId
 *             properties:
 *               credentialId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Credential unrevoked successfully
 *       404:
 *         description: Credential not found
 */
revocationRoutes.post(
  '/unrevoke',
  strictRateLimiter,
  validateBody(z.object({ credentialId: z.string().min(1) })),
  asyncHandler(async (req: Request, res: Response) => {
    const { credentialId } = req.body

    const success = await unrevokeCredential(credentialId)

    if (!success) {
      res.status(404).json({
        type: 'https://api.example.com/problems/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Credential ${credentialId} not found`,
      })
      return
    }

    res.json({
      success: true,
      message: 'Credential unrevoked successfully',
      credentialId,
    })
  })
)

/**
 * @swagger
 * /revocation/status/{credentialId}:
 *   get:
 *     summary: Get credential revocation status
 *     description: Returns the revocation status of a specific credential
 *     tags: [Revocation]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: credentialId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Credential status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 credentialId:
 *                   type: string
 *                 revoked:
 *                   type: boolean
 *                 revokedAt:
 *                   type: string
 *                   format: date-time
 *                 reason:
 *                   type: string
 *       404:
 *         description: Credential not found
 */
revocationRoutes.get(
  '/status/:credentialId',
  asyncHandler(async (req: Request, res: Response) => {
    const { credentialId } = req.params

    const status = await getCredentialStatus(credentialId)

    if (!status) {
      res.status(404).json({
        type: 'https://api.example.com/problems/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Credential ${credentialId} not found in revocation registry`,
      })
      return
    }

    res.json({
      credentialId: status.credentialId,
      revoked: status.revoked,
      revokedAt: status.revokedAt?.toISOString(),
      reason: status.reason,
      statusListId: status.statusListId,
      statusListIndex: status.statusListIndex,
    })
  })
)

/**
 * @swagger
 * /revocation/check:
 *   post:
 *     summary: Check revocation by status list entry
 *     description: Checks if a credential is revoked using status list ID and index
 *     tags: [Revocation]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - statusListId
 *               - statusListIndex
 *             properties:
 *               statusListId:
 *                 type: string
 *               statusListIndex:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Revocation check result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 revoked:
 *                   type: boolean
 */
revocationRoutes.post(
  '/check',
  validateBody(checkStatusSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { statusListId, statusListIndex } = req.body

    const revoked = await checkStatusListEntry(statusListId, statusListIndex)

    res.json({
      revoked,
      statusListId,
      statusListIndex,
      checkedAt: new Date().toISOString(),
    })
  })
)

/**
 * @swagger
 * /revocation/list/{statusListId}:
 *   get:
 *     summary: Get status list credential
 *     description: Returns the status list credential for verification
 *     tags: [Revocation]
 *     parameters:
 *       - in: path
 *         name: statusListId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Status list credential
 *       404:
 *         description: Status list not found
 */
revocationRoutes.get(
  '/list/:statusListId',
  asyncHandler(async (req: Request, res: Response) => {
    const { statusListId } = req.params

    const statusList = await getStatusList(statusListId)

    if (!statusList) {
      res.status(404).json({
        type: 'https://api.example.com/problems/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Status list ${statusListId} not found`,
      })
      return
    }

    const credential = await getStatusListCredential(statusListId, statusList.issuer)
    res.json(credential)
  })
)

/**
 * @swagger
 * /revocation/stats:
 *   get:
 *     summary: Get revocation statistics
 *     description: Returns statistics about revoked credentials
 *     tags: [Revocation]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: issuerId
 *         schema:
 *           type: string
 *         description: Filter by issuer DID
 *     responses:
 *       200:
 *         description: Revocation statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalLists:
 *                   type: integer
 *                 totalCredentials:
 *                   type: integer
 *                 revokedCredentials:
 *                   type: integer
 *                 activeCredentials:
 *                   type: integer
 */
revocationRoutes.get(
  '/stats',
  asyncHandler(async (req: Request, res: Response) => {
    const issuerId = req.query.issuerId as string | undefined
    const stats = await getRevocationStats(issuerId)
    res.json(stats)
  })
)

/**
 * @swagger
 * /revocation/verify/{credentialId}:
 *   get:
 *     summary: Quick revocation check
 *     description: Simple endpoint to check if a credential is revoked
 *     tags: [Revocation]
 *     parameters:
 *       - in: path
 *         name: credentialId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Revocation status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid:
 *                   type: boolean
 *                   description: True if credential is NOT revoked
 *                 revoked:
 *                   type: boolean
 */
revocationRoutes.get(
  '/verify/:credentialId',
  asyncHandler(async (req: Request, res: Response) => {
    const { credentialId } = req.params
    const revoked = await isCredentialRevoked(credentialId)

    res.json({
      valid: !revoked,
      revoked,
      credentialId,
      checkedAt: new Date().toISOString(),
    })
  })
)

/**
 * @swagger
 * /revocation/status-list:
 *   get:
 *     summary: Get all status lists
 *     description: Returns all status lists in the system
 *     tags: [Revocation]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of status lists
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusLists:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       issuer:
 *                         type: string
 *                       size:
 *                         type: integer
 *                       usedCount:
 *                         type: integer
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                 count:
 *                   type: integer
 */
revocationRoutes.get(
  '/status-list',
  asyncHandler(async (req: Request, res: Response) => {
    const lists = await getAllStatusLists()

    const statusLists = lists.map((list) => ({
      id: list.id,
      issuer: list.issuer,
      size: list.size,
      usedCount: list.usedIndices.length,
      createdAt: list.createdAt.toISOString(),
      updatedAt: list.updatedAt.toISOString(),
    }))

    res.json({
      statusLists,
      count: statusLists.length,
    })
  })
)
