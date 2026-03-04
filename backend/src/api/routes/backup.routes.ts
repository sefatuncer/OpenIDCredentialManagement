/**
 * Backup and Restore API Routes
 */

import { Router, Request, Response, NextFunction } from 'express'
import { backupService } from '../../services/backup.service'
import { asyncHandler } from '../middleware/error.middleware'
import { z } from 'zod'

const router = Router()

// Validation schemas
const createBackupSchema = z.object({
  type: z.enum(['full', 'credentials', 'wallet', 'config']).optional().default('full'),
  encrypt: z.boolean().optional().default(false),
  includeAuditLogs: z.boolean().optional().default(true),
})

const restoreSchema = z.object({
  backupId: z.string().min(1),
  components: z.array(z.string()).optional(),
  dryRun: z.boolean().optional().default(false),
})

/**
 * @swagger
 * /api/v1/backup:
 *   post:
 *     summary: Create a new backup
 *     tags: [Backup]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [full, credentials, wallet, config]
 *                 default: full
 *               encrypt:
 *                 type: boolean
 *                 default: false
 *               includeAuditLogs:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Backup created successfully
 *       500:
 *         description: Backup failed
 */
// Handler function for creating backup
const createBackupHandler = asyncHandler(async (req: Request, res: Response) => {
  const options = createBackupSchema.parse(req.body)

  let result

  if (options.type === 'credentials') {
    result = await backupService.createCredentialsBackup({ encrypt: options.encrypt })
  } else {
    result = await backupService.createFullBackup({
      encrypt: options.encrypt,
      includeAuditLogs: options.includeAuditLogs,
    })
  }

  res.json({
    success: true,
    backupId: result.backupId,
    metadata: result.metadata,
  })
})

router.post('/', createBackupHandler)

/**
 * @swagger
 * /api/v1/backup/create:
 *   post:
 *     summary: Create a new backup (alias)
 *     tags: [Backup]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [full, credentials, wallet, config]
 *                 default: full
 *               encrypt:
 *                 type: boolean
 *                 default: false
 *               includeAuditLogs:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: Backup created successfully
 *       500:
 *         description: Backup failed
 */
router.post('/create', createBackupHandler)

/**
 * @swagger
 * /api/v1/backup:
 *   get:
 *     summary: List all backups
 *     tags: [Backup]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of available backups
 */
// Handler function for listing backups
const listBackupsHandler = asyncHandler(async (req: Request, res: Response) => {
  const backups = await backupService.listBackups()

  res.json({
    backups,
    count: backups.length,
  })
})

router.get('/', listBackupsHandler)

/**
 * @swagger
 * /api/v1/backup/list:
 *   get:
 *     summary: List all backups (alias)
 *     tags: [Backup]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of available backups
 */
router.get('/list', listBackupsHandler)

/**
 * @swagger
 * /api/v1/backup/{backupId}:
 *   get:
 *     summary: Get backup details and verify integrity
 *     tags: [Backup]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: backupId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Backup details
 *       404:
 *         description: Backup not found
 */
router.get(
  '/:backupId',
  asyncHandler(async (req: Request, res: Response) => {
    const { backupId } = req.params

    const verification = await backupService.verifyBackup(backupId)

    if (!verification.valid && verification.error === 'Backup not found') {
      return res.status(404).json({
        error: 'not_found',
        message: 'Backup not found',
      })
    }

    res.json({
      backupId,
      valid: verification.valid,
      error: verification.error,
      metadata: verification.metadata,
    })
  })
)

/**
 * @swagger
 * /api/v1/backup/{backupId}:
 *   delete:
 *     summary: Delete a backup
 *     tags: [Backup]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: backupId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Backup deleted
 *       404:
 *         description: Backup not found
 */
router.delete(
  '/:backupId',
  asyncHandler(async (req: Request, res: Response) => {
    const { backupId } = req.params

    const deleted = await backupService.deleteBackup(backupId)

    if (!deleted) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Backup not found',
      })
    }

    res.json({
      success: true,
      message: 'Backup deleted',
    })
  })
)

/**
 * @swagger
 * /api/v1/backup/restore:
 *   post:
 *     summary: Restore from backup
 *     tags: [Backup]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - backupId
 *             properties:
 *               backupId:
 *                 type: string
 *               components:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Specific components to restore
 *               dryRun:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: Restore completed
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Restore failed
 */
router.post(
  '/restore',
  asyncHandler(async (req: Request, res: Response) => {
    const options = restoreSchema.parse(req.body)

    const result = await backupService.restore(options.backupId, {
      components: options.components,
      dryRun: options.dryRun,
    })

    res.json(result)
  })
)

/**
 * @swagger
 * /api/v1/backup/{backupId}/verify:
 *   post:
 *     summary: Verify backup integrity
 *     tags: [Backup]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: backupId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Verification result
 */
router.post(
  '/:backupId/verify',
  asyncHandler(async (req: Request, res: Response) => {
    const { backupId } = req.params

    const result = await backupService.verifyBackup(backupId)

    res.json(result)
  })
)

export const backupRoutes = router
