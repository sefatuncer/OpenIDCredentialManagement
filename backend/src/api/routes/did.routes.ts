import { Router, Request, Response } from 'express'
import { asyncHandler } from '../middleware/error.middleware'
import {
  resolveDID,
  dereferenceDIDURL,
  isValidDID,
  getSupportedMethods,
  getDIDCacheStats,
  clearDIDCache,
} from '../../services/didResolver.service'

export const didRoutes = Router()

/**
 * @swagger
 * /did/resolve/{did}:
 *   get:
 *     summary: Resolve a DID to its DID Document
 *     description: Universal DID resolver supporting did:key, did:web, and did:peer methods
 *     tags: [DID]
 *     parameters:
 *       - in: path
 *         name: did
 *         required: true
 *         schema:
 *           type: string
 *         description: The DID to resolve
 *         example: did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK
 *     responses:
 *       200:
 *         description: DID Resolution Result
 *         content:
 *           application/did+ld+json:
 *             schema:
 *               type: object
 *               properties:
 *                 didDocument:
 *                   type: object
 *                 didDocumentMetadata:
 *                   type: object
 *                 didResolutionMetadata:
 *                   type: object
 *       400:
 *         description: Invalid DID
 *       404:
 *         description: DID not found
 */
didRoutes.get(
  '/resolve/:did(*)',
  asyncHandler(async (req: Request, res: Response) => {
    const { did } = req.params

    if (!isValidDID(did)) {
      return res.status(400).json({
        didDocument: null,
        didDocumentMetadata: {},
        didResolutionMetadata: {
          error: 'invalidDid',
          message: 'Invalid DID format',
        },
      })
    }

    const result = await resolveDID(did)

    // Set appropriate content type
    res.setHeader('Content-Type', 'application/did+ld+json')

    if (!result.didDocument) {
      return res.status(404).json(result)
    }

    res.json(result)
  })
)

/**
 * @swagger
 * /did/dereference:
 *   get:
 *     summary: Dereference a DID URL
 *     description: Dereference a DID URL to get a specific element from the DID Document
 *     tags: [DID]
 *     parameters:
 *       - in: query
 *         name: didUrl
 *         required: true
 *         schema:
 *           type: string
 *         description: The DID URL to dereference
 *         example: did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK#z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK
 *     responses:
 *       200:
 *         description: Dereferenced content
 *       400:
 *         description: Invalid DID URL
 *       404:
 *         description: Content not found
 */
didRoutes.get(
  '/dereference',
  asyncHandler(async (req: Request, res: Response) => {
    const { didUrl } = req.query

    if (!didUrl || typeof didUrl !== 'string') {
      return res.status(400).json({
        contentStream: null,
        contentMetadata: {},
        dereferencingMetadata: {
          error: 'invalidDidUrl',
          message: 'didUrl query parameter is required',
        },
      })
    }

    const result = await dereferenceDIDURL(didUrl)

    if (!result.contentStream) {
      return res.status(404).json(result)
    }

    res.json(result)
  })
)

/**
 * @swagger
 * /did/validate:
 *   post:
 *     summary: Validate a DID
 *     description: Check if a DID is valid and can be resolved
 *     tags: [DID]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - did
 *             properties:
 *               did:
 *                 type: string
 *     responses:
 *       200:
 *         description: Validation result
 */
didRoutes.post(
  '/validate',
  asyncHandler(async (req: Request, res: Response) => {
    const { did } = req.body

    if (!did) {
      return res.status(400).json({
        valid: false,
        error: 'DID is required',
      })
    }

    const isValid = isValidDID(did)

    if (!isValid) {
      return res.json({
        valid: false,
        error: 'Invalid DID format',
      })
    }

    // Try to resolve
    const result = await resolveDID(did)

    res.json({
      valid: true,
      resolvable: !!result.didDocument,
      method: did.split(':')[1],
      error: result.didResolutionMetadata.error,
    })
  })
)

/**
 * @swagger
 * /did/methods:
 *   get:
 *     summary: Get supported DID methods
 *     tags: [DID]
 *     responses:
 *       200:
 *         description: List of supported DID methods
 */
didRoutes.get('/methods', (req: Request, res: Response) => {
  const methods = getSupportedMethods()

  res.json({
    methods,
    details: {
      key: {
        description: 'Self-certifying DIDs using public keys',
        spec: 'https://w3c-ccg.github.io/did-method-key/',
        example: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      },
      web: {
        description: 'Web-based DIDs resolved via HTTPS',
        spec: 'https://w3c-ccg.github.io/did-method-web/',
        example: 'did:web:example.com',
      },
      peer: {
        description: 'Peer DIDs for private connections',
        spec: 'https://identity.foundation/peer-did-method-spec/',
        example: 'did:peer:0z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      },
    },
  })
})

/**
 * @swagger
 * /did/cache/stats:
 *   get:
 *     summary: Get DID cache statistics
 *     tags: [DID]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Cache statistics
 */
didRoutes.get('/cache/stats', (req: Request, res: Response) => {
  const stats = getDIDCacheStats()
  res.json(stats)
})

/**
 * @swagger
 * /did/cache/clear:
 *   post:
 *     summary: Clear DID cache
 *     tags: [DID]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Cache cleared
 */
didRoutes.post('/cache/clear', (req: Request, res: Response) => {
  clearDIDCache()
  res.json({ success: true, message: 'DID cache cleared' })
})

/**
 * @swagger
 * /did/document/{did}:
 *   get:
 *     summary: Get DID Document directly
 *     description: Shorthand for resolve that returns just the DID Document
 *     tags: [DID]
 *     parameters:
 *       - in: path
 *         name: did
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: DID Document
 *       404:
 *         description: DID not found
 */
didRoutes.get(
  '/document/:did(*)',
  asyncHandler(async (req: Request, res: Response) => {
    const { did } = req.params

    if (!isValidDID(did)) {
      return res.status(400).json({
        error: 'invalidDid',
        message: 'Invalid DID format',
      })
    }

    const result = await resolveDID(did)

    if (!result.didDocument) {
      return res.status(404).json({
        error: result.didResolutionMetadata.error,
        message: result.didResolutionMetadata.message,
      })
    }

    res.setHeader('Content-Type', 'application/did+ld+json')
    res.json(result.didDocument)
  })
)
