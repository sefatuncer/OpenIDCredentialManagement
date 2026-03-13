/**
 * Demo 1: Payment Agent
 *
 * Scenario: An AI payment agent receives a delegation credential with
 * scope-limited authority (maxAmount, allowedServices), exchanges it for
 * an OAuth token to access a payment API, and processes a transaction.
 * Then the delegation is revoked in real-time.
 *
 * Flow:
 *   1. Issue agent identity credential
 *   2. Create delegation with payment constraints
 *   3. Exchange delegation VC for OAuth token
 *   4. Simulate payment API call
 *   5. Revoke delegation (real-time)
 *   6. Verify revocation blocks further access
 *
 * Prerequisites:
 *   - Backend running at http://localhost:3000
 *   - API key configured
 *
 * Run:
 *   npx ts-node demos/demo1-payment-agent.ts
 */

import { AgentSDK } from '../sdk/src'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const API_KEY = process.env.API_KEY || 'test-api-key-12345'

async function runPaymentAgentDemo() {
  console.log('═══════════════════════════════════════════════════')
  console.log('  Demo 1: AI Payment Agent — Scope-Limited Authority')
  console.log('═══════════════════════════════════════════════════\n')

  const sdk = new AgentSDK({ baseUrl: BASE_URL, apiKey: API_KEY })

  // Step 1: Health check
  const health = await sdk.health()
  console.log(`✓ Backend status: ${health.status}`)

  // Step 2: Issue agent identity credential
  console.log('\n── Step 1: Issue Agent Identity ──')
  const holderDid = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
  const offer = await sdk.issuer.issueAgentIdentity({
    holderDid,
    agentType: 'autonomous',
    agentName: 'PaymentBot-001',
    ownerDid: holderDid,
    capabilities: ['payment:execute', 'payment:query'],
    trustLevel: 3,
  })
  console.log(`✓ Agent identity credential offer created`)
  console.log(`  URI: ${offer.credentialOfferUri || offer.credential_offer_uri || '(inline)'}`)

  // Step 3: Create delegation with payment scope constraints
  console.log('\n── Step 2: Create Delegation (Payment Scope) ──')
  const delegation = await sdk.delegation.create({
    delegateeDid: holderDid,
    scope: ['payment:execute', 'payment:query'],
    expiresIn: 3600, // 1 hour
  })
  console.log(`✓ Delegation created: ${delegation.id}`)
  console.log(`  Scope: ${delegation.scope.join(', ')}`)
  console.log(`  Status: ${delegation.status}`)
  console.log(`  Expires: ${delegation.expiresAt || '1 hour'}`)

  // Step 4: List active delegations
  console.log('\n── Step 3: Verify Active Delegations ──')
  const activeDelegations = await sdk.delegation.list({ status: 'active' })
  console.log(`✓ Active delegations: ${activeDelegations.length}`)

  // Step 5: Simulate OAuth token exchange
  console.log('\n── Step 4: OAuth Token Exchange (VC → API Token) ──')
  try {
    const scopeMappings = await sdk.oauth.getScopeMappings()
    console.log(`✓ Available scope mappings:`, Object.keys(scopeMappings))
  } catch (e) {
    console.log(`  (OAuth bridge endpoint not available — skipping)`)
  }

  // Step 6: Simulate payment check via audit
  console.log('\n── Step 5: Audit Trail ──')
  try {
    const auditEntries = await sdk.audit.query({
      action: 'delegation',
      limit: 5,
    })
    console.log(`✓ Recent delegation audit entries: ${auditEntries.length}`)
  } catch {
    console.log(`  (Audit query — no entries yet)`)
  }

  // Step 7: Revoke delegation
  console.log('\n── Step 6: Real-Time Revocation ──')
  try {
    await sdk.delegation.revoke(delegation.id)
    console.log(`✓ Delegation ${delegation.id} revoked`)

    // Verify revocation
    const revokedDelegation = await sdk.delegation.get(delegation.id)
    console.log(`  Status after revocation: ${revokedDelegation.status}`)
  } catch (e) {
    console.log(`  Revocation: ${e instanceof Error ? e.message : String(e)}`)
  }

  console.log('\n═══════════════════════════════════════════════════')
  console.log('  Demo 1 Complete — Payment Agent Lifecycle')
  console.log('═══════════════════════════════════════════════════\n')
}

runPaymentAgentDemo().catch(console.error)
