/**
 * Example: Basic Credential Issuance & Verification
 *
 * Demonstrates the full lifecycle:
 *   1. Issue an agent identity credential
 *   2. Receive it in the holder wallet
 *   3. Create a verification request
 *   4. Present the credential
 *   5. Check verification result
 *
 * Prerequisites:
 *   - Backend running at http://localhost:3000
 *   - Valid API key configured
 *
 * Run:
 *   npx ts-node examples/basic-issuance.ts
 */

import { AgentSDK } from '../src'

async function main() {
  const sdk = new AgentSDK({
    baseUrl: 'http://localhost:3000',
    apiKey: 'your-api-key-here',
  })

  // Check backend health
  const health = await sdk.health()
  console.log('Backend status:', health.status)

  // Step 1: Get issuer DID
  const issuerDid = await sdk.issuer.getDid()
  console.log('Issuer DID:', issuerDid.did)

  // Step 2: Issue an agent identity credential
  const holderDid = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
  const offer = await sdk.issuer.issueAgentIdentity({
    holderDid,
    agentType: 'autonomous',
    agentName: 'My AI Agent',
    ownerDid: holderDid,
  })
  console.log('Credential offer created:', offer.credentialOfferUri ? 'URI available' : 'inline offer')

  // Step 3: Receive credential in holder wallet
  if (offer.credentialOfferUri) {
    const credential = await sdk.holder.receiveCredential(offer.credentialOfferUri)
    console.log('Credential received:', credential.id)
  }

  // Step 4: Create verification request
  const verificationReq = await sdk.verifier.verifyAgentIdentity()
  console.log('Verification request:', verificationReq.sessionId)

  // Step 5: List holder credentials
  const credentials = await sdk.holder.listCredentials()
  console.log(`Holder has ${credentials.length} credential(s)`)

  // Step 6: Check verification result (will be 'pending' without VP submission)
  const result = await sdk.verifier.getResult(verificationReq.sessionId)
  console.log('Verification status:', result.status)
}

main().catch(console.error)
