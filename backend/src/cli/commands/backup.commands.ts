import { Command } from 'commander'
import { apiClient } from '../utils/api-client'
import { output, spinner, success, error, info, table, confirm } from '../utils/output'

export const backupCommands = new Command('backup')
  .description('Backup and restore commands')

// Create backup
backupCommands
  .command('create')
  .description('Create a new backup')
  .option('-t, --type <type>', 'Backup type (full, credentials, wallet, config)', 'full')
  .option('-e, --encrypt', 'Encrypt the backup')
  .option('--no-audit-logs', 'Exclude audit logs from backup')
  .action(async (options) => {
    const spin = spinner('Creating backup...')

    try {
      const result = await apiClient.post('/api/v1/backup', {
        type: options.type,
        encrypt: options.encrypt,
        includeAuditLogs: options.auditLogs !== false,
      })

      spin.stop()

      if (result.success) {
        success('Backup created successfully')
        output('\nBackup Details:')
        output(`  ID: ${result.backupId}`)
        output(`  Type: ${result.metadata.type}`)
        output(`  Components: ${result.metadata.components.join(', ')}`)
        output(`  Size: ${formatBytes(result.metadata.size)}`)
        output(`  Encrypted: ${result.metadata.encrypted ? 'Yes' : 'No'}`)
        output(`  Timestamp: ${result.metadata.timestamp}`)
      } else {
        error('Backup creation failed')
      }
    } catch (err) {
      spin.stop()
      error(`Error: ${(err as Error).message}`)
    }
  })

// List backups
backupCommands
  .command('list')
  .description('List all available backups')
  .option('-l, --limit <number>', 'Number of backups to show', '10')
  .action(async (options) => {
    const spin = spinner('Fetching backups...')

    try {
      const result = await apiClient.get('/api/v1/backup')

      spin.stop()

      if (!result.backups?.length) {
        info('No backups found')
        return
      }

      output('\nAvailable Backups:\n')

      const headers = ['Timestamp', 'Type', 'Components', 'Size', 'Encrypted']
      const rows = result.backups.slice(0, parseInt(options.limit)).map((backup: any) => [
        new Date(backup.timestamp).toLocaleString(),
        backup.type,
        backup.components.join(', ') || 'N/A',
        formatBytes(backup.size),
        backup.encrypted ? 'Yes' : 'No',
      ])

      table(headers, rows)

      output(`\nTotal: ${result.count} backup(s)`)
    } catch (err) {
      spin.stop()
      error(`Error: ${(err as Error).message}`)
    }
  })

// Show backup details
backupCommands
  .command('show <backupId>')
  .description('Show backup details')
  .action(async (backupId: string) => {
    const spin = spinner('Fetching backup details...')

    try {
      const result = await apiClient.get(`/api/v1/backup/${backupId}`)

      spin.stop()

      output('\nBackup Details:\n')
      output(`  ID: ${backupId}`)
      output(`  Valid: ${result.valid ? 'Yes' : 'No'}`)

      if (result.error) {
        error(`  Error: ${result.error}`)
      }

      if (result.metadata) {
        output(`  Version: ${result.metadata.version}`)
        output(`  Type: ${result.metadata.type}`)
        output(`  Components: ${result.metadata.components.join(', ')}`)
        output(`  Size: ${formatBytes(result.metadata.size)}`)
        output(`  Encrypted: ${result.metadata.encrypted ? 'Yes' : 'No'}`)
        output(`  Timestamp: ${result.metadata.timestamp}`)
        output(`  Checksum: ${result.metadata.checksum.substring(0, 16)}...`)
      }
    } catch (err) {
      spin.stop()
      error(`Error: ${(err as Error).message}`)
    }
  })

// Verify backup
backupCommands
  .command('verify <backupId>')
  .description('Verify backup integrity')
  .action(async (backupId: string) => {
    const spin = spinner('Verifying backup...')

    try {
      const result = await apiClient.post(`/api/v1/backup/${backupId}/verify`)

      spin.stop()

      if (result.valid) {
        success('Backup is valid and intact')

        if (result.metadata) {
          output('\nBackup Info:')
          output(`  Type: ${result.metadata.type}`)
          output(`  Components: ${result.metadata.components.join(', ')}`)
          output(`  Created: ${result.metadata.timestamp}`)
        }
      } else {
        error(`Backup verification failed: ${result.error}`)
      }
    } catch (err) {
      spin.stop()
      error(`Error: ${(err as Error).message}`)
    }
  })

// Restore from backup
backupCommands
  .command('restore <backupId>')
  .description('Restore from a backup')
  .option('-c, --components <components>', 'Specific components to restore (comma-separated)')
  .option('--dry-run', 'Show what would be restored without actually restoring')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (backupId: string, options) => {
    // Parse components
    const components = options.components
      ? options.components.split(',').map((c: string) => c.trim())
      : undefined

    // Dry run first if not specified
    if (!options.dryRun && !options.yes) {
      const dryRunSpin = spinner('Analyzing backup...')

      try {
        const dryRunResult = await apiClient.post('/api/v1/backup/restore', {
          backupId,
          components,
          dryRun: true,
        })

        dryRunSpin.stop()

        output('\nRestore Preview:')
        output(`  Components to restore: ${dryRunResult.restoredComponents.join(', ')}`)

        const confirmed = await confirm('\nProceed with restore?')

        if (!confirmed) {
          info('Restore cancelled')
          return
        }
      } catch (err) {
        dryRunSpin.stop()
        error(`Error: ${(err as Error).message}`)
        return
      }
    }

    // Perform actual restore
    const spin = spinner('Restoring from backup...')

    try {
      const result = await apiClient.post('/api/v1/backup/restore', {
        backupId,
        components,
        dryRun: options.dryRun,
      })

      spin.stop()

      if (options.dryRun) {
        info('Dry run completed')
        output('\nWould restore:')
        for (const component of result.restoredComponents) {
          output(`  - ${component}`)
        }
        return
      }

      if (result.success) {
        success('Restore completed successfully')
        output('\nRestored Components:')
        for (const component of result.restoredComponents) {
          output(`  - ${component}`)
        }
      } else {
        error('Restore completed with errors')
        output('\nRestored:')
        for (const component of result.restoredComponents) {
          output(`  - ${component}`)
        }
        output('\nErrors:')
        for (const err of result.errors) {
          output(`  - ${err}`)
        }
      }
    } catch (err) {
      spin.stop()
      error(`Error: ${(err as Error).message}`)
    }
  })

// Delete backup
backupCommands
  .command('delete <backupId>')
  .description('Delete a backup')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (backupId: string, options) => {
    if (!options.yes) {
      const confirmed = await confirm(`Are you sure you want to delete backup ${backupId}?`)
      if (!confirmed) {
        info('Deletion cancelled')
        return
      }
    }

    const spin = spinner('Deleting backup...')

    try {
      await apiClient.delete(`/api/v1/backup/${backupId}`)

      spin.stop()
      success('Backup deleted successfully')
    } catch (err) {
      spin.stop()
      error(`Error: ${(err as Error).message}`)
    }
  })

// Schedule backup (shows info about scheduling)
backupCommands
  .command('schedule')
  .description('Show backup scheduling information')
  .action(() => {
    output('\nBackup Scheduling:')
    output('')
    output('  To schedule automated backups, use cron or a task scheduler:')
    output('')
    output('  Linux/macOS (crontab -e):')
    output('    # Daily backup at 2:00 AM')
    output('    0 2 * * * cd /path/to/app && npm run cli -- backup create --type full')
    output('')
    output('  Windows (Task Scheduler):')
    output('    Create a task that runs: npm run cli -- backup create --type full')
    output('')
    output('  Docker/Kubernetes:')
    output('    Use a CronJob resource to run the backup command periodically')
    output('')
    output('  Recommended schedule:')
    output('    - Full backup: Weekly')
    output('    - Credentials backup: Daily')
    output('')
  })

// Helper function
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
