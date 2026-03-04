import { Router, Request, Response } from 'express'
import { z } from 'zod'
import {
  addTrustedEntity,
  removeTrustedEntity,
  updateTrustedEntity,
  getTrustedEntity,
  isEntityTrusted,
  isIssuerTrustedForCredential,
  getEntityTrustLevel,
  getTrustedIssuers,
  getTrustedVerifiers,
  addTrustPolicy,
  getTrustPolicy,
  validateAgainstTrustPolicy,
  getTrustRegistryStats,
  exportTrustRegistry,
  TrustLevel,
} from '../../services/trustRegistry.service'
import { validateBody } from '../middleware/validation.middleware'
import { asyncHandler } from '../middleware/error.middleware'
import { strictRateLimiter } from '../middleware/rateLimit.middleware'
import { requirePermission } from '../middleware/auth.middleware'

export const trustRoutes = Router()

// Validation schemas
const trustLevelSchema = z.enum(['untrusted', 'basic', 'standard', 'elevated', 'high'])
const entityTypeSchema = z.enum(['issuer', 'verifier', 'holder'])

const addEntitySchema = z.object({
  did: z.string().regex(/^did:[a-z0-9]+:.+$/i, 'Invalid DID format'),
  name: z.string().min(1, 'Name is required'),
  type: entityTypeSchema,
  trustLevel: trustLevelSchema,
  credentialTypes: z.array(z.string()).default(['*']),
  metadata: z.record(z.unknown()).optional().default({}),
  expiresAt: z.string().datetime().optional(),
  active: z.boolean().default(true),
})

const updateEntitySchema = z.object({
  name: z.string().min(1).optional(),
  trustLevel: trustLevelSchema.optional(),
  credentialTypes: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
  active: z.boolean().optional(),
})

const trustPolicySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().default(''),
  rules: z.array(
    z.object({
      credentialType: z.string().min(1),
      requiredTrustLevel: trustLevelSchema,
      requiredIssuerTypes: z.array(z.string()).optional(),
      maxCredentialAge: z.number().int().positive().optional(),
      requireRevocationCheck: z.boolean().default(true),
    })
  ),
  active: z.boolean().default(true),
})

const validateCredentialSchema = z.object({
  policyId: z.string().min(1),
  issuerDid: z.string().regex(/^did:[a-z0-9]+:.+$/i),
  credentialType: z.string().min(1),
  issuanceDate: z.string().datetime(),
})

/**
 * @swagger
 * /trust/entities:
 *   post:
 *     summary: Add a trusted entity
 *     description: Add a new issuer or verifier to the trust registry
 *     tags: [Trust Registry]
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
 *               - did
 *               - name
 *               - type
 *               - trustLevel
 *             properties:
 *               did:
 *                 type: string
 *                 example: did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK
 *               name:
 *                 type: string
 *                 example: Trusted Issuer Corp
 *               type:
 *                 type: string
 *                 enum: [issuer, verifier, holder]
 *               trustLevel:
 *                 type: string
 *                 enum: [basic, standard, elevated, high]
 *               credentialTypes:
 *                 type: array
 *                 items:
 *                   type: string
 *                 default: ['*']
 *               active:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201:
 *         description: Entity added successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
trustRoutes.post(
  '/entities',
  strictRateLimiter,
  requirePermission('trust:write'),
  validateBody(addEntitySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const entityData = req.body
    if (entityData.expiresAt) {
      entityData.expiresAt = new Date(entityData.expiresAt)
    }

    const entity = await addTrustedEntity(entityData)

    res.status(201).json({
      success: true,
      entity,
    })
  })
)

/**
 * @swagger
 * /trust/entities:
 *   get:
 *     summary: List trusted entities
 *     description: Get all trusted issuers and verifiers
 *     tags: [Trust Registry]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [issuer, verifier]
 *     responses:
 *       200:
 *         description: List of trusted entities
 */
trustRoutes.get(
  '/entities',
  asyncHandler(async (req: Request, res: Response) => {
    const type = req.query.type as string | undefined

    let entities
    if (type === 'issuer') {
      entities = await getTrustedIssuers()
    } else if (type === 'verifier') {
      entities = await getTrustedVerifiers()
    } else {
      const [issuers, verifiers] = await Promise.all([getTrustedIssuers(), getTrustedVerifiers()])
      entities = [...issuers, ...verifiers]
    }

    res.json({ entities })
  })
)

/**
 * @swagger
 * /trust/entities/{did}:
 *   get:
 *     summary: Get trusted entity by DID
 *     tags: [Trust Registry]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: did
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Entity details
 *       404:
 *         description: Entity not found
 */
trustRoutes.get(
  '/entities/:did',
  asyncHandler(async (req: Request, res: Response) => {
    const { did } = req.params
    const decodedDid = decodeURIComponent(did)

    const entity = await getTrustedEntity(decodedDid)

    if (!entity) {
      res.status(404).json({
        type: 'https://api.example.com/problems/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Entity ${decodedDid} not found in trust registry`,
      })
      return
    }

    res.json({ entity })
  })
)

/**
 * @swagger
 * /trust/entities/{did}:
 *   patch:
 *     summary: Update a trusted entity
 *     tags: [Trust Registry]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: did
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               trustLevel:
 *                 type: string
 *               active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Entity updated
 *       404:
 *         description: Entity not found
 */
trustRoutes.patch(
  '/entities/:did',
  strictRateLimiter,
  requirePermission('trust:write'),
  validateBody(updateEntitySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { did } = req.params
    const decodedDid = decodeURIComponent(did)
    const updates = req.body

    if (updates.expiresAt) {
      updates.expiresAt = new Date(updates.expiresAt)
    } else if (updates.expiresAt === null) {
      updates.expiresAt = undefined
    }

    const entity = await updateTrustedEntity(decodedDid, updates)

    if (!entity) {
      res.status(404).json({
        type: 'https://api.example.com/problems/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Entity ${decodedDid} not found`,
      })
      return
    }

    res.json({ success: true, entity })
  })
)

/**
 * @swagger
 * /trust/entities/{did}:
 *   delete:
 *     summary: Remove a trusted entity
 *     tags: [Trust Registry]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: did
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Entity removed
 *       404:
 *         description: Entity not found
 */
trustRoutes.delete(
  '/entities/:did',
  strictRateLimiter,
  requirePermission('trust:write'),
  asyncHandler(async (req: Request, res: Response) => {
    const { did } = req.params
    const decodedDid = decodeURIComponent(did)

    const removed = await removeTrustedEntity(decodedDid)

    if (!removed) {
      res.status(404).json({
        type: 'https://api.example.com/problems/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Entity ${decodedDid} not found`,
      })
      return
    }

    res.json({ success: true, message: 'Entity removed from trust registry' })
  })
)

/**
 * @swagger
 * /trust/verify/issuer:
 *   post:
 *     summary: Verify if issuer is trusted
 *     description: Check if an issuer is trusted for a specific credential type
 *     tags: [Trust Registry]
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
 *               - issuerDid
 *               - credentialType
 *             properties:
 *               issuerDid:
 *                 type: string
 *               credentialType:
 *                 type: string
 *     responses:
 *       200:
 *         description: Trust verification result
 */
trustRoutes.post(
  '/verify/issuer',
  asyncHandler(async (req: Request, res: Response) => {
    const { issuerDid, credentialType } = req.body

    const trusted = await isIssuerTrustedForCredential(issuerDid, credentialType)
    const trustLevel = await getEntityTrustLevel(issuerDid)

    res.json({
      trusted,
      trustLevel,
      issuerDid,
      credentialType,
      checkedAt: new Date().toISOString(),
    })
  })
)

/**
 * @swagger
 * /trust/check/{did}:
 *   get:
 *     summary: Check if a DID is trusted
 *     description: Quick check to verify if a DID is in the trust registry
 *     tags: [Trust Registry]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: did
 *         required: true
 *         schema:
 *           type: string
 *         description: DID to check (URL encoded)
 *     responses:
 *       200:
 *         description: Trust status of the DID
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 did:
 *                   type: string
 *                 trusted:
 *                   type: boolean
 *                 trustLevel:
 *                   type: string
 *                 entity:
 *                   type: object
 */
trustRoutes.get(
  '/check/:did',
  asyncHandler(async (req: Request, res: Response) => {
    const { did } = req.params
    const decodedDid = decodeURIComponent(did)

    const trusted = await isEntityTrusted(decodedDid)
    const trustLevel = await getEntityTrustLevel(decodedDid)
    const entity = await getTrustedEntity(decodedDid)

    res.json({
      did: decodedDid,
      trusted,
      trustLevel,
      entity: entity || null,
      checkedAt: new Date().toISOString(),
    })
  })
)

/**
 * @swagger
 * /trust/policies:
 *   post:
 *     summary: Create a trust policy
 *     tags: [Trust Registry]
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
 *               - id
 *               - name
 *               - rules
 *             properties:
 *               id:
 *                 type: string
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               rules:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     credentialType:
 *                       type: string
 *                     requiredTrustLevel:
 *                       type: string
 *                     maxCredentialAge:
 *                       type: integer
 *                     requireRevocationCheck:
 *                       type: boolean
 *     responses:
 *       201:
 *         description: Policy created
 */
trustRoutes.post(
  '/policies',
  strictRateLimiter,
  requirePermission('trust:write'),
  validateBody(trustPolicySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const policy = await addTrustPolicy(req.body)
    res.status(201).json({ success: true, policy })
  })
)

/**
 * @swagger
 * /trust/policies/{policyId}:
 *   get:
 *     summary: Get a trust policy
 *     tags: [Trust Registry]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: policyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Policy details
 *       404:
 *         description: Policy not found
 */
trustRoutes.get(
  '/policies/:policyId',
  asyncHandler(async (req: Request, res: Response) => {
    const { policyId } = req.params
    const policy = await getTrustPolicy(policyId)

    if (!policy) {
      res.status(404).json({
        type: 'https://api.example.com/problems/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Policy ${policyId} not found`,
      })
      return
    }

    res.json({ policy })
  })
)

/**
 * @swagger
 * /trust/validate:
 *   post:
 *     summary: Validate credential against trust policy
 *     tags: [Trust Registry]
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
 *               - policyId
 *               - issuerDid
 *               - credentialType
 *               - issuanceDate
 *             properties:
 *               policyId:
 *                 type: string
 *               issuerDid:
 *                 type: string
 *               credentialType:
 *                 type: string
 *               issuanceDate:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Validation result
 */
trustRoutes.post(
  '/validate',
  validateBody(validateCredentialSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { policyId, issuerDid, credentialType, issuanceDate } = req.body

    const result = await validateAgainstTrustPolicy(
      policyId,
      issuerDid,
      credentialType,
      new Date(issuanceDate)
    )

    res.json({
      ...result,
      policyId,
      issuerDid,
      credentialType,
      validatedAt: new Date().toISOString(),
    })
  })
)

/**
 * @swagger
 * /trust/stats:
 *   get:
 *     summary: Get trust registry statistics
 *     tags: [Trust Registry]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Registry statistics
 */
trustRoutes.get(
  '/stats',
  asyncHandler(async (req: Request, res: Response) => {
    const stats = await getTrustRegistryStats()
    res.json(stats)
  })
)

/**
 * @swagger
 * /trust/export:
 *   get:
 *     summary: Export trust registry
 *     description: Export all trusted entities and policies for backup
 *     tags: [Trust Registry]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Trust registry data
 */
trustRoutes.get(
  '/export',
  requirePermission('trust:admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const data = await exportTrustRegistry()
    res.json({
      exportedAt: new Date().toISOString(),
      ...data,
    })
  })
)
