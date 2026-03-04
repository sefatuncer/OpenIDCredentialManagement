import { Command } from 'commander'
import { apiClient } from '../utils/api-client'
import { output, spinner, success, error, prompt } from '../utils/output'

export const credentialCommands = new Command('credential')
  .alias('cred')
  .description('Credential management commands')

// Issue credential
credentialCommands
  .command('issue')
  .description('Issue a new credential')
  .requiredOption('-t, --type <type>', 'Credential type (agent-identity, delegation, capability)')
  .requiredOption('-h, --holder <did>', 'Holder DID')
  .option('--agent-id <id>', 'Agent ID (for agent-identity)')
  .option('--agent-name <name>', 'Agent name (for agent-identity)')
  .option('--agent-type <type>', 'Agent type (for agent-identity)', 'assistant')
  .option('--owner-did <did>', 'Owner DID (for agent-identity)')
  .option('--scope <scope>', 'Delegation scope (comma-separated)')
  .option('--delegator-did <did>', 'Delegator DID (for delegation)')
  .action(async (options) => {
    const spin = spinner('Creating credential offer...')

    try {
      let endpoint: string
      let body: any = { holderDid: options.holder }

      switch (options.type) {
        case 'agent-identity':
          endpoint = '/api/v1/issuer/credentials/agent-identity'
          body = {
            ...body,
            agentId: options.agentId || `agent-${Date.now()}`,
            agentName: options.agentName || 'AI Agent',
            agentType: options.agentType,
            ownerDid: options.ownerDid || options.holder,
            capabilities: [],
          }
          break

        case 'delegation':
          endpoint = '/api/v1/issuer/credentials/delegation'
          body = {
            ...body,
            delegatorDid: options.delegatorDid,
            delegateDid: options.holder,
            scope: options.scope?.split(',') || ['read'],
          }
          break

        case 'capability':
          endpoint = '/api/v1/issuer/credentials/capability'
          body = {
            ...body,
            capabilityType: 'action',
            resource: '*',
            actions: ['read'],
          }
          break

        default:
          spin.stop()
          error(`Unknown credential type: ${options.type}`)
          return
      }

      const result = await apiClient.post(endpoint, body)

      spin.stop()

      if (result.success) {
        success('Credential offer created successfully')
        output(`\n  Offer ID: ${result.credentialOfferId}`)
        output(`\n  Offer URI:\n  ${result.credentialOfferUri}`)
      } else {
        error('Failed to create credential offer')
      }
    } catch (err) {
      spin.stop()
      error(`Error: ${(err as Error).message}`)
    }
  })

// Verify credential
credentialCommands
  .command('verify')
  .description('Create a verification request')
  .requiredOption('-d, --definition <id>', 'Presentation definition ID')
  .action(async (options) => {
    const spin = spinner('Creating verification request...')

    try {
      const result = await apiClient.post('/api/v1/openid4vp/authorization-request', {
        presentationDefinitionId: options.definition,
      })

      spin.stop()

      success('Verification request created')
      output(`\n  Session ID: ${result.sessionId}`)
      output(`\n  Authorization Request URI:\n  ${result.authorizationRequestUri}`)
      output('\n  Use this URI or QR code to request credential presentation')
    } catch (err) {
      spin.stop()
      error(`Error: ${(err as Error).message}`)
    }
  })

// Check verification status
credentialCommands
  .command('verify-status <sessionId>')
  .description('Check verification session status')
  .action(async (sessionId: string) => {
    try {
      const session = await apiClient.get(`/api/v1/openid4vp/sessions/${sessionId}`)
      const result = await apiClient.get(`/api/v1/openid4vp/sessions/${sessionId}/result`)

      output('\nVerification Session Status:\n')
      output(`  Session ID: ${session.sessionId}`)
      output(`  Status: ${session.status}`)
      output(`  Expired: ${session.expired ? 'Yes' : 'No'}`)

      if (result.verified !== undefined) {
        output(`\n  Verification Result: ${result.verified ? 'VERIFIED' : 'NOT VERIFIED'}`)

        if (result.credentialSubject) {
          output('\n  Credential Subject:')
          for (const [key, value] of Object.entries(result.credentialSubject)) {
            output(`    ${key}: ${value}`)
          }
        }

        if (result.errors?.length) {
          output('\n  Errors:')
          for (const err of result.errors) {
            output(`    - ${err}`)
          }
        }
      }
    } catch (err) {
      error(`Error: ${(err as Error).message}`)
    }
  })

// Revoke credential
credentialCommands
  .command('revoke <credentialId>')
  .description('Revoke a credential')
  .option('-r, --reason <reason>', 'Revocation reason')
  .action(async (credentialId: string, options) => {
    const spin = spinner('Revoking credential...')

    try {
      const result = await apiClient.post('/api/v1/revocation/revoke', {
        credentialId,
        reason: options.reason || 'Revoked by CLI',
      })

      spin.stop()

      if (result.success) {
        success('Credential revoked successfully')
        output(`\n  Credential ID: ${credentialId}`)
        output(`  Status List Index: ${result.statusIndex}`)
      } else {
        error('Failed to revoke credential')
      }
    } catch (err) {
      spin.stop()
      error(`Error: ${(err as Error).message}`)
    }
  })

// Check revocation status
credentialCommands
  .command('revocation-status <credentialId>')
  .description('Check credential revocation status')
  .action(async (credentialId: string) => {
    try {
      const result = await apiClient.get(`/api/v1/revocation/status/${credentialId}`)

      output('\nRevocation Status:\n')
      output(`  Credential ID: ${credentialId}`)
      output(`  Revoked: ${result.revoked ? 'Yes' : 'No'}`)

      if (result.revoked) {
        output(`  Reason: ${result.reason || 'Not specified'}`)
        output(`  Revoked At: ${result.revokedAt}`)
      }
    } catch (err) {
      error(`Error: ${(err as Error).message}`)
    }
  })

// List presentation definitions
credentialCommands
  .command('definitions')
  .description('List available presentation definitions')
  .action(async () => {
    try {
      const result = await apiClient.get('/api/v1/openid4vp/presentation-definitions')

      output('\nAvailable Presentation Definitions:\n')

      for (const def of result.definitions) {
        output(`  ${def.id}`)
        output(`    Name: ${def.name || 'N/A'}`)
        output(`    Purpose: ${def.purpose || 'N/A'}`)
        output('')
      }
    } catch (err) {
      error(`Error: ${(err as Error).message}`)
    }
  })
