import { Router, Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import {
  issueAgentIdentityCredential,
  issueDelegationCredential,
  issueCapabilityCredential,
  getIssuerDid,
  exchangePreAuthorizedCode,
  claimCredential,
} from '../../agents/issuer.agent'
import {
  AgentIdentityCredentialSubject,
  DelegationCredentialSubject,
  CapabilityCredentialSubject,
} from '../../config/credentials.config'
import { logger } from '../../utils/logger'
import { validateBody } from '../middleware/validation.middleware'
import { asyncHandler } from '../middleware/error.middleware'
import {
  agentIdentityCredentialSchema,
  delegationCredentialSchema,
  capabilityCredentialSchema,
} from '../schemas/validation.schemas'
import { credentialIssuanceRateLimiter } from '../middleware/rateLimit.middleware'

export const issuerRoutes = Router()

/**
 * @swagger
 * /issuer/did:
 *   get:
 *     summary: Get issuer DID
 *     tags: [Issuer]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Issuer DID
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DIDResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
issuerRoutes.get('/did', (req: Request, res: Response) => {
  try {
    const did = getIssuerDid()
    res.json({ did })
  } catch (error) {
    res.status(500).json({ error: (error as Error).message })
  }
})

/**
 * @swagger
 * /issuer/credentials/agent-identity:
 *   post:
 *     summary: Issue an Agent Identity Credential
 *     description: Creates a verifiable credential asserting the identity and properties of an AI agent
 *     tags: [Issuer]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AgentIdentityCredentialRequest'
 *     responses:
 *       200:
 *         description: Credential offer created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CredentialOfferResponse'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 */
issuerRoutes.post(
  '/credentials/agent-identity',
  credentialIssuanceRateLimiter,
  validateBody(agentIdentityCredentialSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const {
      holderDid,
      agentId,
      agentType,
      agentName,
      agentVersion,
      capabilities,
      ownerDid,
      ownerName,
      trustLevel,
      validUntil,
    } = req.body

    const subject: AgentIdentityCredentialSubject = {
      agent_id: agentId || uuidv4(),
      agent_type: agentType,
      agent_name: agentName || `Agent-${agentId}`,
      agent_version: agentVersion || '1.0.0',
      capabilities: capabilities || [],
      owner_did: ownerDid,
      owner_name: ownerName || 'Unknown',
      created_at: new Date().toISOString(),
      valid_until: validUntil || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      trust_level: trustLevel || 'basic',
    }

    const format = req.body.format as 'jwt_vc_json' | 'vc+sd-jwt' | undefined
    const result = await issueAgentIdentityCredential(holderDid, subject, { format })

    res.json({
      success: true,
      credentialOfferId: result.credentialOfferId,
      credentialOfferUri: result.credentialOfferUri,
      format: format || 'jwt_vc_json',
    })
  })
)

/**
 * @swagger
 * /issuer/credentials/delegation:
 *   post:
 *     summary: Issue a Delegation Credential
 *     description: Creates a verifiable credential representing delegated authority from one entity to another
 *     tags: [Issuer]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DelegationCredentialRequest'
 *     responses:
 *       200:
 *         description: Credential offer created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CredentialOfferResponse'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 */
issuerRoutes.post(
  '/credentials/delegation',
  credentialIssuanceRateLimiter,
  validateBody(delegationCredentialSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const {
      holderDid,
      delegatorDid,
      delegatorName,
      delegateDid,
      delegateName,
      scope,
      constraints,
      purpose,
      validFrom,
      validUntil,
      revocable,
    } = req.body

    const subject: DelegationCredentialSubject = {
      delegation_id: uuidv4(),
      delegator_did: delegatorDid,
      delegator_name: delegatorName || 'Unknown User',
      delegate_did: delegateDid,
      delegate_name: delegateName || 'AI Agent',
      scope: scope,
      constraints: constraints || {},
      purpose: purpose || 'General delegation',
      created_at: new Date().toISOString(),
      valid_from: validFrom || new Date().toISOString(),
      valid_until: validUntil || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      revocable: revocable !== false,
    }

    const delegFormat = req.body.format as 'jwt_vc_json' | 'vc+sd-jwt' | undefined
    const result = await issueDelegationCredential(holderDid, subject, { format: delegFormat })

    res.json({
      success: true,
      credentialOfferId: result.credentialOfferId,
      credentialOfferUri: result.credentialOfferUri,
      format: delegFormat || 'jwt_vc_json',
    })
  })
)

/**
 * @swagger
 * /issuer/credentials/capability:
 *   post:
 *     summary: Issue a Capability Credential
 *     description: Creates a verifiable credential granting specific capabilities to perform actions on resources
 *     tags: [Issuer]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CapabilityCredentialRequest'
 *     responses:
 *       200:
 *         description: Credential offer created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CredentialOfferResponse'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/RateLimitExceeded'
 */
issuerRoutes.post(
  '/credentials/capability',
  credentialIssuanceRateLimiter,
  validateBody(capabilityCredentialSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const {
      holderDid,
      capabilityType,
      resource,
      actions,
      conditions,
      grantedBy,
      validUntil,
    } = req.body

    const subject: CapabilityCredentialSubject = {
      capability_id: uuidv4(),
      holder_did: holderDid,
      capability_type: capabilityType,
      resource: resource,
      actions: actions,
      conditions: conditions || {},
      granted_by: grantedBy || getIssuerDid(),
      granted_at: new Date().toISOString(),
      valid_until: validUntil || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }

    const capFormat = req.body.format as 'jwt_vc_json' | 'vc+sd-jwt' | undefined
    const result = await issueCapabilityCredential(holderDid, subject, { format: capFormat })

    res.json({
      success: true,
      credentialOfferId: result.credentialOfferId,
      credentialOfferUri: result.credentialOfferUri,
      format: capFormat || 'jwt_vc_json',
    })
  })
)

/**
 * @swagger
 * /issuer/token:
 *   post:
 *     summary: Exchange pre-authorized code for access token
 *     description: OpenID4VCI token endpoint for pre-authorized code flow
 *     tags: [Issuer]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               grant_type:
 *                 type: string
 *                 example: urn:ietf:params:oauth:grant-type:pre-authorized_code
 *               pre-authorized_code:
 *                 type: string
 *     responses:
 *       200:
 *         description: Access token
 *       400:
 *         description: Invalid grant
 */
issuerRoutes.post(
  '/token',
  asyncHandler(async (req: Request, res: Response) => {
    const preAuthorizedCode = req.body['pre-authorized_code']

    if (!preAuthorizedCode) {
      res.status(400).json({ error: 'invalid_request', error_description: 'Missing pre-authorized_code' })
      return
    }

    const tokenResponse = await exchangePreAuthorizedCode(preAuthorizedCode)

    if (!tokenResponse) {
      res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid pre-authorized code' })
      return
    }

    res.json(tokenResponse)
  })
)

/**
 * @swagger
 * /issuer/credential:
 *   post:
 *     summary: Claim credential with access token
 *     description: OpenID4VCI credential endpoint
 *     tags: [Issuer]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               format:
 *                 type: string
 *                 example: jwt_vc_json
 *               proof:
 *                 type: object
 *     responses:
 *       200:
 *         description: Issued credential
 *       400:
 *         description: Invalid request
 */
issuerRoutes.post(
  '/credential',
  asyncHandler(async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'invalid_token', error_description: 'Missing access token' })
      return
    }

    const accessToken = authHeader.substring(7)
    const { proof } = req.body

    // Proof'tan holder DID'i çıkar (basitleştirilmiş)
    let holderDid = 'did:key:unknown'
    if (proof?.jwt) {
      try {
        const parts = proof.jwt.split('.')
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
        holderDid = payload.iss || holderDid
      } catch {
        // Ignore parse errors
      }
    }

    const result = await claimCredential(accessToken, holderDid)

    if (!result) {
      res.status(400).json({ error: 'invalid_request', error_description: 'Invalid access token or expired offer' })
      return
    }

    res.json(result)
  })
)
