import { Command } from 'commander'
import { apiClient } from '../utils/api-client'
import { output, spinner, success, error } from '../utils/output'

export const agentCommands = new Command('agent')
  .description('Agent management commands')

// Get issuer info
agentCommands
  .command('issuer')
  .description('Get issuer agent information')
  .action(async () => {
    try {
      const result = await apiClient.get('/api/v1/issuer/did')

      output('\nIssuer Agent:\n')
      output(`  DID: ${result.did}`)
    } catch (err) {
      error(`Error: ${(err as Error).message}`)
    }
  })

// Get verifier info
agentCommands
  .command('verifier')
  .description('Get verifier agent information')
  .action(async () => {
    try {
      const result = await apiClient.get('/api/v1/openid4vp/did')

      output('\nVerifier Agent:\n')
      output(`  DID: ${result.did}`)
    } catch (err) {
      error(`Error: ${(err as Error).message}`)
    }
  })

// Get holder info
agentCommands
  .command('holder')
  .description('Get holder agent information')
  .action(async () => {
    try {
      const result = await apiClient.get('/api/v1/holder/did')

      output('\nHolder Agent:\n')
      output(`  DID: ${result.did}`)
    } catch (err) {
      error(`Error: ${(err as Error).message}`)
    }
  })

// Health check
agentCommands
  .command('health')
  .description('Check system health')
  .action(async () => {
    const spin = spinner('Checking health...')

    try {
      const health = await apiClient.get('/health')
      const ready = await apiClient.get('/health/ready').catch(() => ({ status: 'unknown' }))

      spin.stop()

      output('\nSystem Health:\n')
      output(`  Status: ${health.status}`)
      output(`  Ready: ${ready.status}`)
      output(`  Timestamp: ${health.timestamp || new Date().toISOString()}`)

      if (health.services) {
        output('\n  Services:')
        for (const [name, status] of Object.entries(health.services)) {
          output(`    ${name}: ${status}`)
        }
      }
    } catch (err) {
      spin.stop()
      error(`Error: ${(err as Error).message}`)
    }
  })

// Trust registry commands
const trustCommands = agentCommands
  .command('trust')
  .description('Trust registry management')

trustCommands
  .command('list')
  .description('List trusted entities')
  .option('-t, --type <type>', 'Entity type (issuer, verifier, both)')
  .action(async (options) => {
    try {
      let url = '/api/v1/trust/entities'
      if (options.type) {
        url += `?type=${options.type}`
      }

      const result = await apiClient.get(url)

      output('\nTrusted Entities:\n')

      if (!result.entities?.length) {
        output('  No trusted entities found')
        return
      }

      for (const entity of result.entities) {
        output(`  ${entity.name}`)
        output(`    DID: ${entity.did}`)
        output(`    Type: ${entity.type}`)
        output(`    Trust Level: ${entity.trustLevel}`)
        output(`    Active: ${entity.active ? 'Yes' : 'No'}`)
        output('')
      }
    } catch (err) {
      error(`Error: ${(err as Error).message}`)
    }
  })

trustCommands
  .command('add <did>')
  .description('Add a trusted entity')
  .requiredOption('-n, --name <name>', 'Entity name')
  .requiredOption('-t, --type <type>', 'Entity type (issuer, verifier, both)')
  .option('-l, --level <level>', 'Trust level', 'basic')
  .action(async (did: string, options) => {
    const spin = spinner('Adding trusted entity...')

    try {
      const result = await apiClient.post('/api/v1/trust/entities', {
        did,
        name: options.name,
        type: options.type,
        trustLevel: options.level,
      })

      spin.stop()

      if (result.success) {
        success('Trusted entity added successfully')
        output(`\n  DID: ${did}`)
        output(`  Name: ${options.name}`)
      } else {
        error('Failed to add trusted entity')
      }
    } catch (err) {
      spin.stop()
      error(`Error: ${(err as Error).message}`)
    }
  })

trustCommands
  .command('remove <did>')
  .description('Remove a trusted entity')
  .action(async (did: string) => {
    const spin = spinner('Removing trusted entity...')

    try {
      await apiClient.delete(`/api/v1/trust/entities/${encodeURIComponent(did)}`)

      spin.stop()
      success('Trusted entity removed')
    } catch (err) {
      spin.stop()
      error(`Error: ${(err as Error).message}`)
    }
  })

trustCommands
  .command('verify <did>')
  .description('Verify if a DID is trusted')
  .option('-t, --type <type>', 'Check as type (issuer, verifier)', 'issuer')
  .action(async (did: string, options) => {
    try {
      const result = await apiClient.post('/api/v1/trust/verify/issuer', {
        did,
        type: options.type,
      })

      output('\nTrust Verification:\n')
      output(`  DID: ${did}`)
      output(`  Trusted: ${result.trusted ? 'Yes' : 'No'}`)

      if (result.entity) {
        output(`  Name: ${result.entity.name}`)
        output(`  Trust Level: ${result.entity.trustLevel}`)
      }
    } catch (err) {
      error(`Error: ${(err as Error).message}`)
    }
  })

// Audit commands
const auditCommands = agentCommands
  .command('audit')
  .description('Audit log commands')

auditCommands
  .command('logs')
  .description('View audit logs')
  .option('-l, --limit <number>', 'Number of logs to show', '20')
  .option('-e, --event <type>', 'Filter by event type')
  .action(async (options) => {
    try {
      let url = `/api/v1/audit/logs?limit=${options.limit}`
      if (options.event) {
        url += `&eventType=${options.event}`
      }

      const result = await apiClient.get(url)

      output('\nAudit Logs:\n')

      if (!result.logs?.length) {
        output('  No logs found')
        return
      }

      for (const log of result.logs) {
        output(`  [${log.timestamp}] ${log.eventType}`)
        output(`    Action: ${log.action}`)
        output(`    Actor: ${log.actor?.name || log.actor?.id || 'N/A'}`)
        output(`    Outcome: ${log.outcome}`)
        output('')
      }
    } catch (err) {
      error(`Error: ${(err as Error).message}`)
    }
  })

auditCommands
  .command('stats')
  .description('View audit statistics')
  .action(async () => {
    try {
      const result = await apiClient.get('/api/v1/audit/stats')

      output('\nAudit Statistics:\n')
      output(`  Total Events: ${result.total}`)

      if (result.byEventType) {
        output('\n  By Event Type:')
        for (const [type, count] of Object.entries(result.byEventType)) {
          output(`    ${type}: ${count}`)
        }
      }

      if (result.byOutcome) {
        output('\n  By Outcome:')
        for (const [outcome, count] of Object.entries(result.byOutcome)) {
          output(`    ${outcome}: ${count}`)
        }
      }
    } catch (err) {
      error(`Error: ${(err as Error).message}`)
    }
  })
