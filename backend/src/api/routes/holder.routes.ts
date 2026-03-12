import { Router, Request, Response } from 'express'
import {
  receiveCredentialOffer,
  presentCredential,
  getStoredCredentials,
  deleteCredential,
  getHolderDid,
} from '../../agents/holder.agent'
import { logger } from '../../utils/logger'
import { validateBody } from '../middleware/validation.middleware'
import { asyncHandler } from '../middleware/error.middleware'
import {
  credentialReceiveSchema,
  credentialPresentSchema,
} from '../schemas/validation.schemas'
import { defaultRateLimiter } from '../middleware/rateLimit.middleware'
import { registerPushToken } from '../../services/push-notification.service'
import { z } from 'zod'

export const holderRoutes = Router()

/**
 * @swagger
 * /holder/did:
 *   get:
 *     summary: Get holder DID
 *     tags: [Holder]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Holder DID
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DIDResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
holderRoutes.get('/did', (req: Request, res: Response) => {
  try {
    const did = getHolderDid()
    res.json({ did })
  } catch (error) {
    res.status(500).json({ error: (error as Error).message })
  }
})

/**
 * @swagger
 * /holder/credentials/receive:
 *   post:
 *     summary: Receive a credential offer
 *     description: Accepts and stores a credential from a credential offer URI (OpenID4VCI)
 *     tags: [Holder]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CredentialReceiveRequest'
 *     responses:
 *       200:
 *         description: Credential received successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 credentialRecordId:
 *                   type: string
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 */
holderRoutes.post(
  '/credentials/receive',
  defaultRateLimiter,
  validateBody(credentialReceiveSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { credentialOfferUri } = req.body
    const result = await receiveCredentialOffer(credentialOfferUri)
    res.json({ success: true, credentialRecordId: result.credentialRecordId })
  })
)

/**
 * @swagger
 * /holder/credentials/present:
 *   post:
 *     summary: Present a credential
 *     description: Creates and submits a verifiable presentation in response to a verification request (OpenID4VP)
 *     tags: [Holder]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CredentialPresentRequest'
 *     responses:
 *       200:
 *         description: Presentation submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 presentationSubmitted:
 *                   type: boolean
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 */
holderRoutes.post(
  '/credentials/present',
  defaultRateLimiter,
  validateBody(credentialPresentSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { verificationRequestUri } = req.body
    const result = await presentCredential(verificationRequestUri)
    res.json({ success: true, presentationSubmitted: result.presentationSubmitted })
  })
)

/**
 * @swagger
 * /holder/credentials:
 *   get:
 *     summary: Get all stored credentials
 *     description: Returns all credentials stored in the holder's wallet
 *     tags: [Holder]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of stored credentials
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 credentials:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/StoredCredential'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
holderRoutes.get(
  '/credentials',
  asyncHandler(async (req: Request, res: Response) => {
    const credentials = await getStoredCredentials()
    res.json({ credentials })
  })
)

/**
 * @swagger
 * /holder/credentials/{credentialId}:
 *   delete:
 *     summary: Delete a credential
 *     description: Removes a credential from the holder's wallet
 *     tags: [Holder]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: credentialId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the credential to delete
 *     responses:
 *       200:
 *         description: Credential deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Credential not found
 */
holderRoutes.delete(
  '/credentials/:credentialId',
  asyncHandler(async (req: Request, res: Response) => {
    const { credentialId } = req.params
    await deleteCredential(credentialId)
    res.json({ success: true })
  })
)

// --- Push Token Registration (Mobile Wallet) ---

const pushTokenSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['ios', 'android', 'web']),
})

holderRoutes.post(
  '/push-token',
  defaultRateLimiter,
  validateBody(pushTokenSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { token, platform } = req.body
    // Use authenticated user ID or fallback to token hash as holder ID
    const holderId = ((req as unknown as Record<string, unknown>).userId as string) ||
      `holder_${Buffer.from(token).toString('base64url').slice(0, 16)}`
    await registerPushToken(holderId, token, platform)
    res.json({ success: true, message: 'Push token registered' })
  })
)
