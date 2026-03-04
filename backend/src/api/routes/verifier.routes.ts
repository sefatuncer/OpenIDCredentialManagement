import { Router, Request, Response } from 'express'
import {
  createVerificationRequest,
  verifyPresentation,
  getVerifierDid,
  agentIdentityPresentationDefinition,
  delegationPresentationDefinition,
  combinedPresentationDefinition,
} from '../../agents/verifier.agent'
import { logger } from '../../utils/logger'
import { asyncHandler } from '../middleware/error.middleware'
import { verificationRateLimiter } from '../middleware/rateLimit.middleware'

export const verifierRoutes = Router()

/**
 * @swagger
 * /verifier/did:
 *   get:
 *     summary: Get verifier DID
 *     tags: [Verifier]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Verifier DID
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DIDResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
verifierRoutes.get('/did', (req: Request, res: Response) => {
  try {
    const did = getVerifierDid()
    res.json({ did })
  } catch (error) {
    res.status(500).json({ error: (error as Error).message })
  }
})

/**
 * @swagger
 * /verifier/verify/agent-identity:
 *   post:
 *     summary: Create verification request for agent identity
 *     description: Initiates a verification flow for an Agent Identity Credential using OpenID4VP
 *     tags: [Verifier]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Verification request created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VerificationRequestResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 */
verifierRoutes.post(
  '/verify/agent-identity',
  verificationRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const result = await createVerificationRequest(agentIdentityPresentationDefinition)
    res.json({
      success: true,
      requestUri: result.requestUri,
      verificationSessionId: result.verificationSessionId,
    })
  })
)

/**
 * @swagger
 * /verifier/verify/delegation:
 *   post:
 *     summary: Create verification request for delegation
 *     description: Initiates a verification flow for a Delegation Credential using OpenID4VP
 *     tags: [Verifier]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Verification request created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VerificationRequestResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 */
verifierRoutes.post(
  '/verify/delegation',
  verificationRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const result = await createVerificationRequest(delegationPresentationDefinition)
    res.json({
      success: true,
      requestUri: result.requestUri,
      verificationSessionId: result.verificationSessionId,
    })
  })
)

/**
 * @swagger
 * /verifier/verify/combined:
 *   post:
 *     summary: Create verification request for combined credentials
 *     description: Initiates a verification flow requiring both Agent Identity and Delegation credentials
 *     tags: [Verifier]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Verification request created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VerificationRequestResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 */
verifierRoutes.post(
  '/verify/combined',
  verificationRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const result = await createVerificationRequest(combinedPresentationDefinition)
    res.json({
      success: true,
      requestUri: result.requestUri,
      verificationSessionId: result.verificationSessionId,
    })
  })
)

/**
 * @swagger
 * /verifier/verify/{sessionId}/result:
 *   get:
 *     summary: Get verification result
 *     description: Retrieves the result of a verification session
 *     tags: [Verifier]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Verification session ID
 *     responses:
 *       200:
 *         description: Verification result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 verified:
 *                   type: boolean
 *                 presentation:
 *                   type: object
 *                 error:
 *                   type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Session not found
 */
verifierRoutes.get(
  '/verify/:sessionId/result',
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params
    const result = await verifyPresentation(sessionId)
    res.json(result)
  })
)
