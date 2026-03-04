/**
 * SD-JWT API Routes
 *
 * Endpoints for SD-JWT credential issuance and verification
 */

import { Router, Request, Response } from 'express'
import { sdjwtService } from '../../services/sdjwt.service'
import { asyncHandler } from '../middleware/error.middleware'
import { z } from 'zod'

const router = Router()

// Validation schemas
const createSDJWTSchema = z.object({
  subjectDid: z.string().min(1),
  claims: z.record(z.any()),
  selectiveDisclosureClaims: z.array(z.string()),
  expiresIn: z.number().optional(),
})

const createSDJWTVCSchema = z.object({
  subjectDid: z.string().min(1),
  credentialType: z.string().min(1),
  credentialSubject: z.record(z.any()),
  selectiveDisclosureClaims: z.array(z.string()),
  expiresIn: z.number().optional(),
  credentialId: z.string().optional(),
})

const createPresentationSchema = z.object({
  credential: z.string().min(1),
  claimsToDisclose: z.array(z.string()),
  audience: z.string().optional(),
  nonce: z.string().optional(),
})

const verifyPresentationSchema = z.object({
  presentation: z.string().min(1),
  expectedAudience: z.string().optional(),
  expectedNonce: z.string().optional(),
})

/**
 * @swagger
 * /api/v1/sdjwt/credential:
 *   post:
 *     summary: Create an SD-JWT credential
 *     tags: [SD-JWT]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - subjectDid
 *               - claims
 *               - selectiveDisclosureClaims
 *             properties:
 *               subjectDid:
 *                 type: string
 *                 description: DID of the credential subject
 *               claims:
 *                 type: object
 *                 description: Claims to include in the credential
 *               selectiveDisclosureClaims:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Claim names that should be selectively disclosable
 *               expiresIn:
 *                 type: number
 *                 description: Expiration time in seconds
 *     responses:
 *       200:
 *         description: SD-JWT credential created
 */
// Handler function for creating SD-JWT credential
const createCredentialHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = createSDJWTSchema.parse(req.body)

  // Get issuer DID from authenticated user or agent
  const issuerDid = (req as any).user?.did || 'did:key:issuer'

  const credential = await sdjwtService.createSDJWTCredential(
    issuerDid,
    data.subjectDid,
    data.claims,
    data.selectiveDisclosureClaims,
    { expiresIn: data.expiresIn }
  )

  res.json({
    jwt: credential.jwt,
    disclosures: credential.disclosures.map((d) => ({
      claimName: d.claimName,
      encoded: d.encoded,
    })),
    combined: credential.combined,
    selectableDisclosureClaims: sdjwtService.getSelectiveDisclosableClaims(credential),
  })
})

router.post('/credential', createCredentialHandler)

/**
 * @swagger
 * /api/v1/sdjwt/issue:
 *   post:
 *     summary: Issue an SD-JWT credential (alias for /credential)
 *     tags: [SD-JWT]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - subjectDid
 *               - claims
 *               - selectiveDisclosureClaims
 *             properties:
 *               subjectDid:
 *                 type: string
 *                 description: DID of the credential subject
 *               claims:
 *                 type: object
 *                 description: Claims to include in the credential
 *               selectiveDisclosureClaims:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Claim names that should be selectively disclosable
 *               expiresIn:
 *                 type: number
 *                 description: Expiration time in seconds
 *     responses:
 *       200:
 *         description: SD-JWT credential created
 */
router.post('/issue', createCredentialHandler)

/**
 * @swagger
 * /api/v1/sdjwt/vc:
 *   post:
 *     summary: Create an SD-JWT Verifiable Credential
 *     tags: [SD-JWT]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - subjectDid
 *               - credentialType
 *               - credentialSubject
 *               - selectiveDisclosureClaims
 *             properties:
 *               subjectDid:
 *                 type: string
 *               credentialType:
 *                 type: string
 *                 example: AIAgentIdentityCredential
 *               credentialSubject:
 *                 type: object
 *               selectiveDisclosureClaims:
 *                 type: array
 *                 items:
 *                   type: string
 *               expiresIn:
 *                 type: number
 *               credentialId:
 *                 type: string
 *     responses:
 *       200:
 *         description: SD-JWT VC created
 */
router.post(
  '/vc',
  asyncHandler(async (req: Request, res: Response) => {
    const data = createSDJWTVCSchema.parse(req.body)

    const issuerDid = (req as any).user?.did || 'did:key:issuer'

    const credential = await sdjwtService.createSDJWTVC(
      issuerDid,
      data.subjectDid,
      data.credentialType,
      data.credentialSubject,
      data.selectiveDisclosureClaims,
      {
        expiresIn: data.expiresIn,
        credentialId: data.credentialId,
      }
    )

    res.json({
      jwt: credential.jwt,
      disclosures: credential.disclosures.map((d) => ({
        claimName: d.claimName,
        encoded: d.encoded,
      })),
      combined: credential.combined,
      selectableDisclosureClaims: sdjwtService.getSelectiveDisclosableClaims(credential),
    })
  })
)

/**
 * @swagger
 * /api/v1/sdjwt/presentation:
 *   post:
 *     summary: Create an SD-JWT presentation with selective disclosure
 *     tags: [SD-JWT]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - credential
 *               - claimsToDisclose
 *             properties:
 *               credential:
 *                 type: string
 *                 description: The combined SD-JWT credential string
 *               claimsToDisclose:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: List of claim names to disclose
 *               audience:
 *                 type: string
 *                 description: Verifier audience for key binding
 *               nonce:
 *                 type: string
 *                 description: Nonce for key binding
 *     responses:
 *       200:
 *         description: SD-JWT presentation created
 */
router.post(
  '/presentation',
  asyncHandler(async (req: Request, res: Response) => {
    const data = createPresentationSchema.parse(req.body)

    // Parse the combined credential
    const parsed = sdjwtService.parseSDJWT(data.credential)

    // Create credential object for presentation
    const credential = {
      jwt: parsed.jwt,
      disclosures: parsed.disclosures,
      combined: data.credential,
    }

    const presentation = sdjwtService.createPresentation(credential, data.claimsToDisclose, {
      audience: data.audience,
      nonce: data.nonce,
    })

    res.json({
      combined: presentation.combined,
      disclosedClaims: presentation.disclosures.map((d) => d.claimName),
      hasKeyBinding: !!presentation.keyBindingJwt,
    })
  })
)

/**
 * @swagger
 * /api/v1/sdjwt/verify:
 *   post:
 *     summary: Verify an SD-JWT presentation
 *     tags: [SD-JWT]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - presentation
 *             properties:
 *               presentation:
 *                 type: string
 *                 description: The combined SD-JWT presentation string
 *               expectedAudience:
 *                 type: string
 *               expectedNonce:
 *                 type: string
 *     responses:
 *       200:
 *         description: Verification result
 */
router.post(
  '/verify',
  asyncHandler(async (req: Request, res: Response) => {
    const data = verifyPresentationSchema.parse(req.body)

    const result = await sdjwtService.verifyPresentation(data.presentation, {
      expectedAudience: data.expectedAudience,
      expectedNonce: data.expectedNonce,
    })

    res.json(result)
  })
)

/**
 * @swagger
 * /api/v1/sdjwt/parse:
 *   post:
 *     summary: Parse an SD-JWT to see its structure
 *     tags: [SD-JWT]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sdjwt
 *             properties:
 *               sdjwt:
 *                 type: string
 *     responses:
 *       200:
 *         description: Parsed SD-JWT structure
 */
router.post(
  '/parse',
  asyncHandler(async (req: Request, res: Response) => {
    const { sdjwt } = req.body

    if (!sdjwt || typeof sdjwt !== 'string') {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'sdjwt string is required',
      })
    }

    const parsed = sdjwtService.parseSDJWT(sdjwt)

    // Decode JWT header and payload for display
    const jwtParts = parsed.jwt.split('.')
    let header, payload

    try {
      header = JSON.parse(Buffer.from(jwtParts[0], 'base64url').toString())
      payload = JSON.parse(Buffer.from(jwtParts[1], 'base64url').toString())
    } catch {
      header = null
      payload = null
    }

    res.json({
      jwt: {
        header,
        payload,
        signature: jwtParts[2]?.substring(0, 20) + '...',
      },
      disclosures: parsed.disclosures.map((d) => ({
        claimName: d.claimName,
        claimValue: d.claimValue,
        salt: d.salt.substring(0, 8) + '...',
      })),
      hasKeyBinding: !!parsed.keyBindingJwt,
      totalParts: sdjwt.split('~').length,
    })
  })
)

/**
 * @swagger
 * /api/v1/sdjwt/info:
 *   get:
 *     summary: Get SD-JWT implementation info
 *     tags: [SD-JWT]
 *     responses:
 *       200:
 *         description: SD-JWT implementation details
 */
router.get('/info', (req: Request, res: Response) => {
  res.json({
    name: 'SD-JWT',
    version: '1.0',
    spec: 'draft-ietf-oauth-selective-disclosure-jwt',
    specUrl: 'https://datatracker.ietf.org/doc/draft-ietf-oauth-selective-disclosure-jwt/',
    features: {
      selectiveDisclosure: true,
      keyBinding: true,
      vcFormat: 'vc+sd-jwt',
      hashAlgorithm: 'sha-256',
    },
    supportedTypes: [
      'AIAgentIdentityCredential',
      'DelegationCredential',
      'CapabilityCredential',
    ],
    example: {
      createCredential: {
        subjectDid: 'did:key:z6Mk...',
        claims: {
          name: 'AI Agent 001',
          capabilities: ['text-generation'],
          trustLevel: 'high',
        },
        selectiveDisclosureClaims: ['capabilities', 'trustLevel'],
      },
      createPresentation: {
        credential: '<combined-sd-jwt>',
        claimsToDisclose: ['name'],
      },
    },
  })
})

export const sdjwtRoutes = router
