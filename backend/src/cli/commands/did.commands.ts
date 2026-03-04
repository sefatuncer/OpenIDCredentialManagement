import { Command } from 'commander'
import { apiClient } from '../utils/api-client'
import { output, spinner, success, error } from '../utils/output'

export const didCommands = new Command('did')
  .description('DID management commands')

// Resolve DID
didCommands
  .command('resolve <did>')
  .description('Resolve a DID to its DID Document')
  .option('-f, --format <format>', 'Output format (json, yaml, pretty)', 'pretty')
  .action(async (did: string, options) => {
    const spin = spinner('Resolving DID...')

    try {
      const result = await apiClient.get(`/api/v1/did/resolve/${encodeURIComponent(did)}`)

      spin.stop()

      if (!result.didDocument) {
        error(`Failed to resolve DID: ${result.didResolutionMetadata?.error || 'Unknown error'}`)
        return
      }

      success('DID resolved successfully')

      if (options.format === 'json') {
        output(JSON.stringify(result.didDocument, null, 2))
      } else if (options.format === 'pretty') {
        output('\nDID Document:')
        output(`  ID: ${result.didDocument.id}`)

        if (result.didDocument.verificationMethod?.length) {
          output('\n  Verification Methods:')
          for (const vm of result.didDocument.verificationMethod) {
            output(`    - ${vm.id}`)
            output(`      Type: ${vm.type}`)
          }
        }

        if (result.didDocument.service?.length) {
          output('\n  Services:')
          for (const svc of result.didDocument.service) {
            output(`    - ${svc.id}`)
            output(`      Type: ${svc.type}`)
            output(`      Endpoint: ${svc.serviceEndpoint}`)
          }
        }

        output(`\n  Resolution Time: ${result.didResolutionMetadata?.duration}ms`)
      } else {
        output(result.didDocument)
      }
    } catch (err) {
      spin.stop()
      error(`Error: ${(err as Error).message}`)
    }
  })

// Validate DID
didCommands
  .command('validate <did>')
  .description('Validate a DID')
  .action(async (did: string) => {
    const spin = spinner('Validating DID...')

    try {
      const result = await apiClient.post('/api/v1/did/validate', { did })

      spin.stop()

      if (result.valid) {
        success(`DID is valid`)
        output(`  Method: ${result.method}`)
        output(`  Resolvable: ${result.resolvable ? 'Yes' : 'No'}`)
      } else {
        error(`DID is invalid: ${result.error}`)
      }
    } catch (err) {
      spin.stop()
      error(`Error: ${(err as Error).message}`)
    }
  })

// List supported methods
didCommands
  .command('methods')
  .description('List supported DID methods')
  .action(async () => {
    try {
      const result = await apiClient.get('/api/v1/did/methods')

      output('\nSupported DID Methods:\n')

      for (const [method, details] of Object.entries(result.details as Record<string, any>)) {
        output(`  did:${method}`)
        output(`    ${details.description}`)
        output(`    Spec: ${details.spec}`)
        output(`    Example: ${details.example}`)
        output('')
      }
    } catch (err) {
      error(`Error: ${(err as Error).message}`)
    }
  })

// Create DID (did:key)
didCommands
  .command('create')
  .description('Create a new DID')
  .option('-m, --method <method>', 'DID method (key)', 'key')
  .action(async (options) => {
    const spin = spinner('Creating DID...')

    try {
      // For did:key, we need to generate locally or call agent API
      const result = await apiClient.get('/api/v1/issuer/did')

      spin.stop()

      success('DID created successfully')
      output(`\n  DID: ${result.did}`)
    } catch (err) {
      spin.stop()
      error(`Error: ${(err as Error).message}`)
    }
  })

// Cache commands
const cacheCommands = didCommands
  .command('cache')
  .description('DID cache management')

cacheCommands
  .command('stats')
  .description('Show cache statistics')
  .action(async () => {
    try {
      const result = await apiClient.get('/api/v1/did/cache/stats')

      output('\nDID Cache Statistics:\n')
      output(`  Cached DIDs: ${result.size}`)

      if (result.entries.length > 0) {
        output('\n  Entries:')
        for (const entry of result.entries.slice(0, 10)) {
          output(`    - ${entry.did} (age: ${Math.round(entry.age / 1000)}s)`)
        }
        if (result.entries.length > 10) {
          output(`    ... and ${result.entries.length - 10} more`)
        }
      }
    } catch (err) {
      error(`Error: ${(err as Error).message}`)
    }
  })

cacheCommands
  .command('clear')
  .description('Clear DID cache')
  .action(async () => {
    const spin = spinner('Clearing cache...')

    try {
      await apiClient.post('/api/v1/did/cache/clear')
      spin.stop()
      success('DID cache cleared')
    } catch (err) {
      spin.stop()
      error(`Error: ${(err as Error).message}`)
    }
  })
