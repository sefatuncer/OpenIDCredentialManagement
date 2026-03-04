/**
 * Backup and Restore Service
 *
 * Handles backup and restoration of:
 * - Wallet data
 * - Credentials
 * - Trust registry
 * - Audit logs
 * - Configuration
 */

import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { logger } from '../utils/logger'

export interface BackupMetadata {
  version: string
  timestamp: string
  type: 'full' | 'incremental' | 'credentials' | 'wallet' | 'config'
  components: string[]
  checksum: string
  encrypted: boolean
  size: number
}

export interface BackupResult {
  success: boolean
  backupId: string
  path: string
  metadata: BackupMetadata
}

export interface RestoreResult {
  success: boolean
  restoredComponents: string[]
  errors: string[]
  timestamp: string
}

interface BackupData {
  metadata: BackupMetadata
  data: {
    credentials?: any[]
    trustRegistry?: any[]
    auditLogs?: any[]
    walletData?: any
    config?: any
  }
}

const BACKUP_DIR = process.env.BACKUP_DIR || './data/backups'
const BACKUP_VERSION = '1.0.0'

class BackupService {
  private encryptionKey?: Buffer

  constructor() {
    // Initialize encryption key from environment if available
    const keyHex = process.env.BACKUP_ENCRYPTION_KEY
    if (keyHex) {
      this.encryptionKey = Buffer.from(keyHex, 'hex')
    }
  }

  /**
   * Create a full system backup
   */
  async createFullBackup(options: {
    encrypt?: boolean
    compress?: boolean
    includeAuditLogs?: boolean
  } = {}): Promise<BackupResult> {
    const backupId = this.generateBackupId()
    const timestamp = new Date().toISOString()

    logger.info(`Starting full backup: ${backupId}`)

    try {
      // Ensure backup directory exists
      await this.ensureBackupDir()

      // Collect all data
      const components: string[] = []
      const backupData: BackupData = {
        metadata: {} as BackupMetadata,
        data: {},
      }

      // Backup credentials
      const credentials = await this.backupCredentials()
      if (credentials.length > 0) {
        backupData.data.credentials = credentials
        components.push('credentials')
      }

      // Backup trust registry
      const trustRegistry = await this.backupTrustRegistry()
      if (trustRegistry.length > 0) {
        backupData.data.trustRegistry = trustRegistry
        components.push('trust-registry')
      }

      // Backup audit logs (optional, can be large)
      if (options.includeAuditLogs !== false) {
        const auditLogs = await this.backupAuditLogs()
        if (auditLogs.length > 0) {
          backupData.data.auditLogs = auditLogs
          components.push('audit-logs')
        }
      }

      // Backup wallet data
      const walletData = await this.backupWalletData()
      if (walletData) {
        backupData.data.walletData = walletData
        components.push('wallet')
      }

      // Backup configuration
      const config = await this.backupConfiguration()
      if (config) {
        backupData.data.config = config
        components.push('config')
      }

      // Calculate checksum
      const dataString = JSON.stringify(backupData.data)
      const checksum = this.calculateChecksum(dataString)

      // Set metadata
      backupData.metadata = {
        version: BACKUP_VERSION,
        timestamp,
        type: 'full',
        components,
        checksum,
        encrypted: options.encrypt === true,
        size: Buffer.byteLength(dataString, 'utf8'),
      }

      // Write backup file
      let finalData: string | Buffer = JSON.stringify(backupData, null, 2)

      if (options.encrypt && this.encryptionKey) {
        finalData = this.encrypt(finalData)
      }

      const backupPath = path.join(BACKUP_DIR, `${backupId}.backup`)
      await fs.promises.writeFile(backupPath, finalData)

      logger.info(`Full backup completed: ${backupId}, ${components.length} components`)

      return {
        success: true,
        backupId,
        path: backupPath,
        metadata: backupData.metadata,
      }
    } catch (error) {
      logger.error('Backup failed', error)
      throw error
    }
  }

  /**
   * Create credentials-only backup
   */
  async createCredentialsBackup(options: { encrypt?: boolean } = {}): Promise<BackupResult> {
    const backupId = this.generateBackupId('cred')
    const timestamp = new Date().toISOString()

    logger.info(`Starting credentials backup: ${backupId}`)

    try {
      await this.ensureBackupDir()

      const credentials = await this.backupCredentials()

      const backupData: BackupData = {
        metadata: {
          version: BACKUP_VERSION,
          timestamp,
          type: 'credentials',
          components: ['credentials'],
          checksum: '',
          encrypted: options.encrypt === true,
          size: 0,
        },
        data: { credentials },
      }

      const dataString = JSON.stringify(backupData.data)
      backupData.metadata.checksum = this.calculateChecksum(dataString)
      backupData.metadata.size = Buffer.byteLength(dataString, 'utf8')

      let finalData: string | Buffer = JSON.stringify(backupData, null, 2)

      if (options.encrypt && this.encryptionKey) {
        finalData = this.encrypt(finalData)
      }

      const backupPath = path.join(BACKUP_DIR, `${backupId}.backup`)
      await fs.promises.writeFile(backupPath, finalData)

      logger.info(`Credentials backup completed: ${backupId}`)

      return {
        success: true,
        backupId,
        path: backupPath,
        metadata: backupData.metadata,
      }
    } catch (error) {
      logger.error('Credentials backup failed', error)
      throw error
    }
  }

  /**
   * Restore from backup
   */
  async restore(backupIdOrPath: string, options: {
    components?: string[]
    dryRun?: boolean
  } = {}): Promise<RestoreResult> {
    logger.info(`Starting restore: ${backupIdOrPath}`)

    const errors: string[] = []
    const restoredComponents: string[] = []

    try {
      // Resolve backup path
      const backupPath = backupIdOrPath.endsWith('.backup')
        ? backupIdOrPath
        : path.join(BACKUP_DIR, `${backupIdOrPath}.backup`)

      if (!fs.existsSync(backupPath)) {
        throw new Error(`Backup not found: ${backupPath}`)
      }

      // Read and parse backup
      let fileContent = await fs.promises.readFile(backupPath)
      let backupData: BackupData

      // Check if encrypted
      if (this.isEncrypted(fileContent)) {
        if (!this.encryptionKey) {
          throw new Error('Backup is encrypted but no encryption key provided')
        }
        const decrypted = this.decrypt(fileContent)
        backupData = JSON.parse(decrypted)
      } else {
        backupData = JSON.parse(fileContent.toString())
      }

      // Verify checksum
      const dataString = JSON.stringify(backupData.data)
      const checksum = this.calculateChecksum(dataString)

      if (checksum !== backupData.metadata.checksum) {
        throw new Error('Backup checksum verification failed - data may be corrupted')
      }

      logger.info(`Backup verified: ${backupData.metadata.type}, ${backupData.metadata.components.join(', ')}`)

      // Filter components to restore
      const componentsToRestore = options.components || backupData.metadata.components

      if (options.dryRun) {
        logger.info(`Dry run - would restore: ${componentsToRestore.join(', ')}`)
        return {
          success: true,
          restoredComponents: componentsToRestore,
          errors: [],
          timestamp: new Date().toISOString(),
        }
      }

      // Restore each component
      for (const component of componentsToRestore) {
        try {
          switch (component) {
            case 'credentials':
              if (backupData.data.credentials) {
                await this.restoreCredentials(backupData.data.credentials)
                restoredComponents.push('credentials')
              }
              break

            case 'trust-registry':
              if (backupData.data.trustRegistry) {
                await this.restoreTrustRegistry(backupData.data.trustRegistry)
                restoredComponents.push('trust-registry')
              }
              break

            case 'audit-logs':
              if (backupData.data.auditLogs) {
                await this.restoreAuditLogs(backupData.data.auditLogs)
                restoredComponents.push('audit-logs')
              }
              break

            case 'wallet':
              if (backupData.data.walletData) {
                await this.restoreWalletData(backupData.data.walletData)
                restoredComponents.push('wallet')
              }
              break

            case 'config':
              if (backupData.data.config) {
                await this.restoreConfiguration(backupData.data.config)
                restoredComponents.push('config')
              }
              break

            default:
              errors.push(`Unknown component: ${component}`)
          }
        } catch (err) {
          const errorMsg = `Failed to restore ${component}: ${(err as Error).message}`
          logger.error(errorMsg)
          errors.push(errorMsg)
        }
      }

      logger.info(`Restore completed: ${restoredComponents.length} components restored`)

      return {
        success: errors.length === 0,
        restoredComponents,
        errors,
        timestamp: new Date().toISOString(),
      }
    } catch (error) {
      logger.error('Restore failed', error)
      throw error
    }
  }

  /**
   * List available backups
   */
  async listBackups(): Promise<BackupMetadata[]> {
    await this.ensureBackupDir()

    const files = await fs.promises.readdir(BACKUP_DIR)
    const backups: BackupMetadata[] = []

    for (const file of files) {
      if (file.endsWith('.backup')) {
        try {
          const filePath = path.join(BACKUP_DIR, file)
          const content = await fs.promises.readFile(filePath)

          let data: BackupData
          if (this.isEncrypted(content)) {
            // For encrypted backups, we can't read metadata without key
            // Return basic info
            const stats = await fs.promises.stat(filePath)
            backups.push({
              version: 'unknown',
              timestamp: stats.mtime.toISOString(),
              type: 'full',
              components: [],
              checksum: '',
              encrypted: true,
              size: stats.size,
            })
          } else {
            data = JSON.parse(content.toString())
            backups.push(data.metadata)
          }
        } catch {
          // Skip invalid backup files
        }
      }
    }

    // Sort by timestamp descending
    backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    return backups
  }

  /**
   * Delete a backup
   */
  async deleteBackup(backupId: string): Promise<boolean> {
    const backupPath = path.join(BACKUP_DIR, `${backupId}.backup`)

    if (!fs.existsSync(backupPath)) {
      return false
    }

    await fs.promises.unlink(backupPath)
    logger.info(`Backup deleted: ${backupId}`)
    return true
  }

  /**
   * Verify backup integrity
   */
  async verifyBackup(backupIdOrPath: string): Promise<{
    valid: boolean
    error?: string
    metadata?: BackupMetadata
  }> {
    try {
      const backupPath = backupIdOrPath.endsWith('.backup')
        ? backupIdOrPath
        : path.join(BACKUP_DIR, `${backupIdOrPath}.backup`)

      if (!fs.existsSync(backupPath)) {
        return { valid: false, error: 'Backup not found' }
      }

      let fileContent = await fs.promises.readFile(backupPath)
      let backupData: BackupData

      if (this.isEncrypted(fileContent)) {
        if (!this.encryptionKey) {
          return { valid: false, error: 'Cannot verify encrypted backup without key' }
        }
        const decrypted = this.decrypt(fileContent)
        backupData = JSON.parse(decrypted)
      } else {
        backupData = JSON.parse(fileContent.toString())
      }

      const dataString = JSON.stringify(backupData.data)
      const checksum = this.calculateChecksum(dataString)

      if (checksum !== backupData.metadata.checksum) {
        return { valid: false, error: 'Checksum mismatch - backup may be corrupted' }
      }

      return { valid: true, metadata: backupData.metadata }
    } catch (error) {
      return { valid: false, error: (error as Error).message }
    }
  }

  // Private methods

  private generateBackupId(prefix: string = 'backup'): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const random = crypto.randomBytes(4).toString('hex')
    return `${prefix}-${timestamp}-${random}`
  }

  private async ensureBackupDir(): Promise<void> {
    if (!fs.existsSync(BACKUP_DIR)) {
      await fs.promises.mkdir(BACKUP_DIR, { recursive: true })
    }
  }

  private calculateChecksum(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex')
  }

  private encrypt(data: string): Buffer {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not configured')
    }

    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv)

    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()

    // Format: 'ENCRYPTED' marker + IV + authTag + encrypted data
    return Buffer.concat([
      Buffer.from('ENCRYPTED'),
      iv,
      authTag,
      encrypted,
    ])
  }

  private decrypt(data: Buffer): string {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not configured')
    }

    // Skip 'ENCRYPTED' marker (9 bytes)
    const iv = data.subarray(9, 25)
    const authTag = data.subarray(25, 41)
    const encrypted = data.subarray(41)

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv)
    decipher.setAuthTag(authTag)

    return decipher.update(encrypted) + decipher.final('utf8')
  }

  private isEncrypted(data: Buffer): boolean {
    return data.subarray(0, 9).toString() === 'ENCRYPTED'
  }

  // Data collection methods (mock implementations - replace with actual data access)

  private async backupCredentials(): Promise<any[]> {
    // TODO: Replace with actual credential repository access
    try {
      // Access credential storage
      return []
    } catch {
      return []
    }
  }

  private async backupTrustRegistry(): Promise<any[]> {
    // TODO: Replace with actual trust registry access
    try {
      return []
    } catch {
      return []
    }
  }

  private async backupAuditLogs(): Promise<any[]> {
    // TODO: Replace with actual audit log access
    try {
      return []
    } catch {
      return []
    }
  }

  private async backupWalletData(): Promise<any> {
    // TODO: Replace with actual wallet data access
    try {
      return null
    } catch {
      return null
    }
  }

  private async backupConfiguration(): Promise<any> {
    // Backup environment-safe configuration
    return {
      version: BACKUP_VERSION,
      settings: {
        // Add configuration settings to backup
      },
    }
  }

  // Restore methods

  private async restoreCredentials(credentials: any[]): Promise<void> {
    logger.info(`Restoring ${credentials.length} credentials`)
    // TODO: Implement credential restoration
  }

  private async restoreTrustRegistry(entities: any[]): Promise<void> {
    logger.info(`Restoring ${entities.length} trust registry entities`)
    // TODO: Implement trust registry restoration
  }

  private async restoreAuditLogs(logs: any[]): Promise<void> {
    logger.info(`Restoring ${logs.length} audit logs`)
    // TODO: Implement audit log restoration
  }

  private async restoreWalletData(walletData: any): Promise<void> {
    logger.info('Restoring wallet data')
    // TODO: Implement wallet data restoration
  }

  private async restoreConfiguration(config: any): Promise<void> {
    logger.info('Restoring configuration')
    // TODO: Implement configuration restoration
  }
}

export const backupService = new BackupService()
