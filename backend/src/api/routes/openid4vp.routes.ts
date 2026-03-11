import { Router, Request, Response } from 'express'
import { logger } from '../../utils/logger'
import { asyncHandler } from '../middleware/error.middleware'
import {
  verificationRateLimiter,
  defaultRateLimiter,
} from '../middleware/rateLimit.middleware'
import {
  createAuthorizationRequest,
  getVerificationSession,
  handleDirectPost,
  getVerificationResult,
  listVerificationSessions,
  getAvailablePresentationDefinitions,
  PRESENTATION_DEFINITIONS,
  getVerifierClientMetadata,
} from '../../services/openid4vp.service'
import { getVerifierDid } from '../../agents/verifier.agent'

export const openid4vpRoutes = Router()

/**
 * @swagger
 * /verifier/presentation-definitions:
 *   get:
 *     summary: Get available presentation definitions
 *     description: Lists all predefined presentation definitions
 *     tags: [OpenID4VP]
 *     responses:
 *       200:
 *         description: List of presentation definitions
 */
openid4vpRoutes.get(
  '/presentation-definitions',
  (req: Request, res: Response) => {
    const definitions = getAvailablePresentationDefinitions()
    res.json({ definitions })
  }
)

/**
 * @swagger
 * /verifier/presentation-definitions/{id}:
 *   get:
 *     summary: Get a specific presentation definition
 *     tags: [OpenID4VP]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Presentation definition
 *       404:
 *         description: Not found
 */
openid4vpRoutes.get(
  '/presentation-definitions/:id',
  (req: Request, res: Response) => {
    const { id } = req.params
    const definition = PRESENTATION_DEFINITIONS[id]

    if (!definition) {
      return res.status(404).json({
        error: 'not_found',
        error_description: 'Presentation definition not found',
      })
    }

    res.json(definition)
  }
)

/**
 * @swagger
 * /verifier/authorization-request:
 *   post:
 *     summary: Create an authorization request
 *     description: Creates a new OpenID4VP authorization request for credential verification
 *     tags: [OpenID4VP]
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
 *               - presentationDefinitionId
 *             properties:
 *               presentationDefinitionId:
 *                 type: string
 *                 description: ID of the presentation definition to use
 *                 example: agent-identity
 *               customDefinition:
 *                 type: object
 *                 description: Optional custom presentation definition
 *               expiresInSeconds:
 *                 type: integer
 *                 default: 300
 *     responses:
 *       200:
 *         description: Authorization request created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sessionId:
 *                   type: string
 *                 authorizationRequest:
 *                   type: object
 *                   description: Contains client_id_scheme, response_type, response_mode, response_uri, etc.
 *                 authorizationRequestUri:
 *                   type: string
 *       400:
 *         description: Invalid request
 */
openid4vpRoutes.post(
  '/authorization-request',
  verificationRateLimiter, // Rate limit: 50 requests per minute
  asyncHandler(async (req: Request, res: Response) => {
    const { presentationDefinitionId, customDefinition, expiresInSeconds } = req.body

    if (!presentationDefinitionId && !customDefinition) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'presentationDefinitionId or customDefinition is required',
      })
    }

    try {
      const result = await createAuthorizationRequest(presentationDefinitionId, {
        customDefinition,
        expiresInSeconds,
      })

      res.json(result)
    } catch (error) {
      res.status(400).json({
        error: 'invalid_request',
        error_description: (error as Error).message,
      })
    }
  })
)

/**
 * @swagger
 * /verifier/sessions/{sessionId}:
 *   get:
 *     summary: Get verification session status
 *     tags: [OpenID4VP]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Session status
 *       404:
 *         description: Session not found
 */
openid4vpRoutes.get(
  '/sessions/:sessionId',
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params
    const result = await getVerificationSession(sessionId)

    if (!result) {
      return res.status(404).json({
        error: 'not_found',
        error_description: 'Verification session not found',
      })
    }

    const { session, expired } = result

    res.json({
      sessionId: session.id,
      status: session.status,
      presentationDefinitionId: session.presentationDefinition.id,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      expired,
    })
  })
)

/**
 * @swagger
 * /verifier/sessions/{sessionId}/result:
 *   get:
 *     summary: Get verification result
 *     tags: [OpenID4VP]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Verification result
 *       404:
 *         description: Session not found
 */
openid4vpRoutes.get(
  '/sessions/:sessionId/result',
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params
    const result = await getVerificationResult(sessionId)

    if (!result) {
      return res.status(404).json({
        error: 'not_found',
        error_description: 'Verification session not found',
      })
    }

    res.json(result)
  })
)

/**
 * @swagger
 * /verifier/sessions:
 *   get:
 *     summary: List all verification sessions
 *     description: Lists all verification sessions (admin endpoint)
 *     tags: [OpenID4VP]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of sessions
 */
openid4vpRoutes.get(
  '/sessions',
  asyncHandler(async (req: Request, res: Response) => {
    const sessions = await listVerificationSessions()
    res.json({ sessions })
  })
)

/**
 * @swagger
 * /direct_post:
 *   post:
 *     summary: Direct post endpoint for VP submission
 *     description: Receives VP token submissions from wallets (response_mode=direct_post)
 *     tags: [OpenID4VP]
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required:
 *               - vp_token
 *               - presentation_submission
 *               - state
 *             properties:
 *               vp_token:
 *                 type: string
 *               presentation_submission:
 *                 type: string
 *               state:
 *                 type: string
 *     responses:
 *       200:
 *         description: Presentation received and processed
 *       400:
 *         description: Invalid request
 */
openid4vpRoutes.post(
  '/direct_post',
  asyncHandler(async (req: Request, res: Response) => {
    const { vp_token, presentation_submission, state } = req.body

    logger.debug('Direct post received', {
      hasVpToken: !!vp_token,
      hasSubmission: !!presentation_submission,
      state,
    })

    if (!vp_token || !state) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'vp_token and state are required',
      })
    }

    // Parse presentation_submission if it's a string
    let submission
    try {
      submission =
        typeof presentation_submission === 'string'
          ? JSON.parse(presentation_submission)
          : presentation_submission
    } catch {
      submission = { id: 'submission', definition_id: 'unknown', descriptor_map: [] }
    }

    const result = await handleDirectPost(vp_token, submission, state)

    if (result.error) {
      return res.status(400).json(result)
    }

    // Success - return empty 200 or redirect
    if (result.redirect_uri) {
      return res.redirect(result.redirect_uri)
    }

    res.json({
      status: 'received',
      message: 'Presentation received and processed',
    })
  })
)

/**
 * @swagger
 * /verifier/client-metadata:
 *   get:
 *     summary: Get verifier client metadata
 *     description: Returns the verifier's client metadata for OpenID4VP
 *     tags: [OpenID4VP]
 *     responses:
 *       200:
 *         description: Client metadata
 */
openid4vpRoutes.get(
  '/client-metadata',
  (req: Request, res: Response) => {
    res.json(getVerifierClientMetadata())
  }
)

/**
 * @swagger
 * /verifier/did:
 *   get:
 *     summary: Get verifier DID
 *     tags: [OpenID4VP]
 *     responses:
 *       200:
 *         description: Verifier DID
 */
openid4vpRoutes.get(
  '/did',
  (req: Request, res: Response) => {
    try {
      const did = getVerifierDid()
      res.json({ did })
    } catch (error) {
      res.status(500).json({ error: (error as Error).message })
    }
  }
)
