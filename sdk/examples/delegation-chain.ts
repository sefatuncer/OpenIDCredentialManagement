/**
 * Example: Delegation Chain
 *
 * Demonstrates A→B→C delegation with scope attenuation:
 *   1. A delegates full scope to B
 *   2. B sub-delegates narrowed scope to C
 *   3. Query delegation chain
 *   4. Revoke with cascade
 *
 * Run:
 *   npx ts-node examples/delegation-chain.ts
 */

import { AgentSDK } from '../src'

async function main() {
  const sdk = new AgentSDK({
    baseUrl: 'http://localhost:3000',
    apiKey: 'your-api-key-here',
  })

  // Step 1: A delegates to B with full scope
  const delegationAB = await sdk.delegation.create({
    delegateeDid: 'did:key:z6MkB_DELEGATEE_B',
    scope: ['credential:issue', 'credential:verify', 'delegation:create'],
    expiresIn: 86400, // 24 hours
  })
  console.log('A→B delegation:', delegationAB.id)

  // Step 2: B sub-delegates to C with narrowed scope
  const delegationBC = await sdk.delegation.create({
    delegateeDid: 'did:key:z6MkC_DELEGATEE_C',
    scope: ['credential:verify'], // Narrowed from A→B
    parentDelegationId: delegationAB.id,
  })
  console.log('B→C delegation:', delegationBC.id)

  // Step 3: Get delegation chain
  const chain = await sdk.delegation.getChain(delegationBC.id)
  console.log(`Chain depth: ${chain.depth}`)
  for (const d of chain.chain) {
    console.log(`  ${d.delegatorDid} → ${d.delegateeDid} [${d.scope.join(', ')}]`)
  }

  // Step 4: List active delegations
  const activeDelegations = await sdk.delegation.list({ status: 'active' })
  console.log(`Active delegations: ${activeDelegations.length}`)

  // Step 5: Revoke A→B (cascades to B→C)
  await sdk.delegation.revoke(delegationAB.id)
  console.log('A→B revoked (cascade to B→C)')

  // Step 6: Verify cascade
  const afterRevoke = await sdk.delegation.get(delegationBC.id)
  console.log('B→C status after cascade:', afterRevoke.status) // Should be 'revoked'
}

main().catch(console.error)
