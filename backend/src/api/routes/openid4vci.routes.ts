import { Router, Request, Response } from 'express'
import { logger } from '../../utils/logger'
import { asyncHandler } from '../middleware/error.middleware'
import {
  authRateLimiter,
  credentialIssuanceRateLimiter,
  defaultRateLimiter,
} from '../middleware/rateLimit.middleware'
import {
  getIssuerMetadata,
  getAuthorizationServerMetadata,
  createCredentialOffer,
  getCredentialOffer,
  exchangePreAuthorizedCode,
  issueCredential,
  issueBatchCredentials,
  getDeferredCredential,
  listCredentialOffers,
} from '../../services/openid4vci.service'
import { isUsingCredo, getCredoIssuerMetadata } from '../../services/credo.service'

export const openid4vciRoutes = Router()

/**
 * @swagger
 * /.well-known/openid-credential-issuer:
 *   get:
 *     summary: Get OpenID4VCI Issuer Metadata
 *     description: Returns the credential issuer metadata as per OpenID4VCI specification
 *     tags: [OpenID4VCI]
 *     responses:
 *       200:
 *         description: Issuer metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 credential_issuer:
 *                   type: string
 *                 credential_endpoint:
 *                   type: string
 *                 credential_configurations_supported:
 *                   type: object
 */
openid4vciRoutes.get(
  '/.well-known/openid-credential-issuer',
  asyncHandler(async (req: Request, res: Response) => {
    // Credo metadata takes priority when Credo is active
    if (isUsingCredo()) {
      const credoMetadata = await getCredoIssuerMetadata()
      if (credoMetadata) {
        return res.json(credoMetadata)
      }
    }
    // Jose fallback
    const metadata = getIssuerMetadata()
    res.json(metadata)
  })
)

/**
 * @swagger
 * /.well-known/oauth-authorization-server:
 *   get:
 *     summary: Get OAuth Authorization Server Metadata
 *     description: Returns the authorization server metadata
 *     tags: [OpenID4VCI]
 *     responses:
 *       200:
 *         description: Authorization server metadata
 */
openid4vciRoutes.get(
  '/.well-known/oauth-authorization-server',
  (req: Request, res: Response) => {
    const metadata = getAuthorizationServerMetadata()
    res.json(metadata)
  }
)

/**
 * @swagger
 * /credential-offer:
 *   post:
 *     summary: Create a credential offer
 *     description: Creates a new credential offer for the specified credential types
 *     tags: [OpenID4VCI]
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
 *               - credentialTypes
 *             properties:
 *               credentialTypes:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["AIAgentIdentityCredential"]
 *               txCode:
 *                 type: object
 *                 description: Transaction code configuration (replaces deprecated userPinRequired)
 *                 properties:
 *                   input_mode:
 *                     type: string
 *                     enum: [numeric, text]
 *                   length:
 *                     type: integer
 *                   description:
 *                     type: string
 *               expiresInSeconds:
 *                 type: integer
 *                 default: 300
 *     responses:
 *       200:
 *         description: Credential offer created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 offerId:
 *                   type: string
 *                 credentialOffer:
 *                   type: object
 *                 credentialOfferUri:
 *                   type: string
 */
openid4vciRoutes.post(
  '/credential-offer',
  asyncHandler(async (req: Request, res: Response) => {
    const { credentialTypes, txCode, userPinRequired, expiresInSeconds } = req.body

    if (!credentialTypes || !Array.isArray(credentialTypes) || credentialTypes.length === 0) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'credentialTypes array is required',
      })
    }

    const result = await createCredentialOffer(credentialTypes, {
      txCode,
      userPinRequired, // deprecated, mapped to txCode in service
      expiresInSeconds,
    })

    res.json(result)
  })
)

/**
 * @swagger
 * /credential-offer/{offerId}:
 *   get:
 *     summary: Get a credential offer by ID
 *     description: Retrieves an existing credential offer
 *     tags: [OpenID4VCI]
 *     parameters:
 *       - in: path
 *         name: offerId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Credential offer
 *       404:
 *         description: Offer not found
 */
openid4vciRoutes.get(
  '/credential-offer/:offerId',
  asyncHandler(async (req: Request, res: Response) => {
    const { offerId } = req.params
    const offer = await getCredentialOffer(offerId)

    if (!offer) {
      return res.status(404).json({
        error: 'not_found',
        error_description: 'Credential offer not found',
      })
    }

    if (offer.expired) {
      return res.status(410).json({
        error: 'expired',
        error_description: 'Credential offer has expired',
      })
    }

    res.json(offer)
  })
)

/**
 * @swagger
 * /credential-offers:
 *   get:
 *     summary: List all credential offers
 *     description: Lists all credential offers (admin endpoint)
 *     tags: [OpenID4VCI]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: List of credential offers
 */
openid4vciRoutes.get(
  '/credential-offers',
  asyncHandler(async (req: Request, res: Response) => {
    const offers = await listCredentialOffers()
    res.json({ offers })
  })
)

/**
 * @swagger
 * /token:
 *   post:
 *     summary: Token endpoint
 *     description: Exchange pre-authorized code for access token
 *     tags: [OpenID4VCI]
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required:
 *               - grant_type
 *               - pre-authorized_code
 *             properties:
 *               grant_type:
 *                 type: string
 *                 enum: [urn:ietf:params:oauth:grant-type:pre-authorized_code]
 *               pre-authorized_code:
 *                 type: string
 *               tx_code:
 *                 type: string
 *                 description: Transaction code value (replaces deprecated user_pin)
 *     responses:
 *       200:
 *         description: Access token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 access_token:
 *                   type: string
 *                 token_type:
 *                   type: string
 *                 expires_in:
 *                   type: integer
 *                 c_nonce:
 *                   type: string
 *       400:
 *         description: Invalid request
 */
openid4vciRoutes.post(
  '/token',
  authRateLimiter, // Rate limit: 10 requests per 15 minutes
  asyncHandler(async (req: Request, res: Response) => {
    const grantType = req.body.grant_type || req.body['grant_type']
    const preAuthorizedCode =
      req.body['pre-authorized_code'] || req.body.pre_authorized_code
    const txCodeValue = req.body.tx_code || req.body.user_pin // backward compat

    logger.debug('Token request received', { grantType, hasCode: !!preAuthorizedCode })

    if (grantType !== 'urn:ietf:params:oauth:grant-type:pre-authorized_code') {
      return res.status(400).json({
        error: 'unsupported_grant_type',
        error_description: 'Only pre-authorized_code grant type is supported',
      })
    }

    if (!preAuthorizedCode) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'pre-authorized_code is required',
      })
    }

    const result = await exchangePreAuthorizedCode(preAuthorizedCode, txCodeValue)

    if ('error' in result) {
      return res.status(400).json(result)
    }

    res.json(result)
  })
)

/**
 * @swagger
 * /credential:
 *   post:
 *     summary: Credential endpoint
 *     description: Request a credential using an access token
 *     tags: [OpenID4VCI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - format
 *             properties:
 *               format:
 *                 type: string
 *                 example: jwt_vc_json
 *               credential_configuration_id:
 *                 type: string
 *                 description: Credential configuration identifier (preferred over credential_definition)
 *                 example: AIAgentIdentityCredential
 *               credential_definition:
 *                 type: object
 *                 properties:
 *                   type:
 *                     type: array
 *                     items:
 *                       type: string
 *               proof:
 *                 type: object
 *                 properties:
 *                   proof_type:
 *                     type: string
 *                   jwt:
 *                     type: string
 *     responses:
 *       200:
 *         description: Credential issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 format:
 *                   type: string
 *                 credential:
 *                   type: string
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Invalid token
 */
openid4vciRoutes.post(
  '/credential',
  credentialIssuanceRateLimiter, // Rate limit: 30 requests per minute
  asyncHandler(async (req: Request, res: Response) => {
    // Extract bearer token
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'invalid_token',
        error_description: 'Bearer token required',
      })
    }

    const accessToken = authHeader.substring(7)
    const result = await issueCredential(accessToken, req.body)

    if ('error' in result) {
      const statusCode = result.error === 'invalid_token' ? 401 : 400
      return res.status(statusCode).json(result)
    }

    res.json(result)
  })
)

/**
 * @swagger
 * /batch-credential:
 *   post:
 *     summary: Batch credential endpoint
 *     description: Request multiple credentials in a single request
 *     tags: [OpenID4VCI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - credential_requests
 *             properties:
 *               credential_requests:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Batch credential response
 */
openid4vciRoutes.post(
  '/batch-credential',
  asyncHandler(async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'invalid_token',
        error_description: 'Bearer token required',
      })
    }

    const accessToken = authHeader.substring(7)
    const { credential_requests } = req.body

    if (!Array.isArray(credential_requests)) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'credential_requests array is required',
      })
    }

    const result = await issueBatchCredentials(accessToken, credential_requests)
    res.json(result)
  })
)

/**
 * @swagger
 * /deferred-credential:
 *   post:
 *     summary: Deferred credential endpoint
 *     description: Retrieve a previously deferred credential
 *     tags: [OpenID4VCI]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - acceptance_token
 *             properties:
 *               acceptance_token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Credential ready
 *       202:
 *         description: Credential still pending
 *       400:
 *         description: Invalid request
 */
openid4vciRoutes.post(
  '/deferred-credential',
  asyncHandler(async (req: Request, res: Response) => {
    const { acceptance_token } = req.body

    if (!acceptance_token) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'acceptance_token is required',
      })
    }

    const result = await getDeferredCredential(acceptance_token)

    if ('error' in result) {
      if (result.error === 'issuance_pending') {
        return res.status(202).json(result)
      }
      return res.status(400).json(result)
    }

    res.json(result)
  })
)
