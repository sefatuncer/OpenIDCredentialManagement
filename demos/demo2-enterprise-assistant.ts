/**
 * Demo 2: Enterprise Assistant
 *
 * Scenario: An AI assistant connects to a CRM/ERP system via capability
 * credentials, communicates with other agents via DIDComm, and leaves
 * a complete audit trail.
 *
 * Flow:
 *   1. Issue capability credential (CRM read, ERP query)
 *   2. Create DIDComm connection between agents
 *   3. Exchange messages via DIDComm
 *   4. Query audit trail
 *   5. Verify credential presentation
 *
 * Run:
 *   npx ts-node demos/demo2-enterprise-assistant.ts
 */

import { AgentSDK } from '../sdk/src'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const API_KEY = process.env.API_KEY || 'test-api-key-12345'

async function runEnterpriseAssistantDemo() {
  console.log('═══════════════════════════════════════════════════')
  console.log('  Demo 2: Enterprise AI Assistant — CRM/ERP Access')
  console.log('═══════════════════════════════════════════════════\n')

  const sdk = new AgentSDK({ baseUrl: BASE_URL, apiKey: API_KEY })

  // Step 1: Issue agent identity
  console.log('── Step 1: Issue Assistant Identity ──')
  const assistantDid = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
  const identityOffer = await sdk.issuer.issueAgentIdentity({
    holderDid: assistantDid,
    agentType: 'semi-autonomous',
    agentName: 'Enterprise-CRM-Assistant',
    ownerDid: assistantDid,
    capabilities: ['crm:read', 'crm:write', 'erp:query'],
  })
  console.log(`✓ Assistant identity issued`)

  // Step 2: Issue capability credential for API access
  console.log('\n── Step 2: Issue Capability Credential ──')
  const capOffer = await sdk.issuer.issueCapability({
    holderDid: assistantDid,
    resourceType: 'crm-api',
    actions: ['read', 'query', 'update'],
    constraints: {
      maxRecordsPerQuery: 100,
      departments: ['sales', 'support'],
    },
  })
  console.log(`✓ Capability credential offer created`)

  // Step 3: DIDComm agent-to-agent communication
  console.log('\n── Step 3: DIDComm A2A Messaging ──')
  try {
    // Create invitation from assistant agent
    const invitation = await sdk.didcomm.createInvitation()
    console.log(`✓ DIDComm invitation created: ${invitation.outOfBandId}`)
    console.log(`  URL: ${invitation.invitationUrl.substring(0, 60)}...`)

    // List connections
    const connections = await sdk.didcomm.listConnections()
    console.log(`✓ Active connections: ${connections.length}`)
  } catch (e) {
    console.log(`  DIDComm not enabled — feature-flag gated`)
  }

  // Step 4: Create verification request
  console.log('\n── Step 4: Verify Agent Capabilities ──')
  const verReq = await sdk.verifier.verifyAgentIdentity()
  console.log(`✓ Verification request: ${verReq.sessionId}`)
  console.log(`  Request URI: ${verReq.requestUri.substring(0, 60)}...`)

  // Poll for result (will be pending without wallet submission)
  const result = await sdk.verifier.getResult(verReq.sessionId)
  console.log(`  Session status: ${result.status}`)

  // Step 5: Combined verification (identity + delegation)
  console.log('\n── Step 5: Combined Verification ──')
  const combinedReq = await sdk.verifier.verifyCombined()
  console.log(`✓ Combined verification: ${combinedReq.sessionId}`)

  // Step 6: Audit trail
  console.log('\n── Step 6: Audit Trail ──')
  try {
    const audit = await sdk.audit.query({ limit: 10 })
    console.log(`✓ Audit entries: ${audit.length}`)
    for (const entry of audit.slice(0, 3)) {
      console.log(`  [${entry.timestamp}] ${entry.action} — ${entry.actor}`)
    }
  } catch {
    console.log(`  (Audit trail query — no entries)`)
  }

  // Step 7: List holder credentials
  console.log('\n── Step 7: Credential Inventory ──')
  const credentials = await sdk.holder.listCredentials()
  console.log(`✓ Stored credentials: ${credentials.length}`)
  for (const cred of credentials.slice(0, 3)) {
    console.log(`  [${cred.type}] ${cred.format} — issued ${cred.issuedAt}`)
  }

  console.log('\n═══════════════════════════════════════════════════')
  console.log('  Demo 2 Complete — Enterprise Assistant Lifecycle')
  console.log('═══════════════════════════════════════════════════\n')
}

runEnterpriseAssistantDemo().catch(console.error)
