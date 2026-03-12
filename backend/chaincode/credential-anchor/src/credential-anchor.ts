/**
 * Credential Anchor Chaincode
 *
 * Stores immutable hash anchors for credential revocation and delegation events.
 * On-chain data: SHA-256 hash + timestamp + event type only.
 * Credential content is NEVER stored on-chain.
 */

import { Contract, Context } from 'fabric-contract-api'

interface AnchorRecord {
  recordType: string
  referenceId: string
  dataHash: string
  timestamp: string
  createdBy: string
}

export class CredentialAnchorContract extends Contract {
  constructor() {
    super('CredentialAnchorContract')
  }

  /**
   * Initialize the chaincode ledger
   */
  async initLedger(ctx: Context): Promise<void> {
    console.info('Credential Anchor chaincode initialized')
  }

  /**
   * Write an anchor record to the ledger
   */
  async writeAnchor(
    ctx: Context,
    recordType: string,
    referenceId: string,
    dataHash: string,
    timestamp: string,
  ): Promise<string> {
    // Validate inputs
    const validTypes = ['revocation', 'delegation_created', 'delegation_revoked', 'credential_issued']
    if (!validTypes.includes(recordType)) {
      throw new Error(`Invalid record type: ${recordType}. Must be one of: ${validTypes.join(', ')}`)
    }
    if (!referenceId || referenceId.length === 0) {
      throw new Error('Reference ID is required')
    }
    if (!dataHash || dataHash.length !== 64) {
      throw new Error('Data hash must be a 64-character hex SHA-256 hash')
    }

    const clientIdentity = ctx.clientIdentity.getID()

    const record: AnchorRecord = {
      recordType,
      referenceId,
      dataHash,
      timestamp,
      createdBy: clientIdentity,
    }

    // Use composite key: recordType~referenceId
    const key = ctx.stub.createCompositeKey('Anchor', [recordType, referenceId])
    await ctx.stub.putState(key, Buffer.from(JSON.stringify(record)))

    // Also store by referenceId for quick lookup
    const refKey = ctx.stub.createCompositeKey('Ref', [referenceId, recordType])
    await ctx.stub.putState(refKey, Buffer.from(JSON.stringify(record)))

    return ctx.stub.getTxID()
  }

  /**
   * Read an anchor record by reference ID and type
   */
  async readAnchor(
    ctx: Context,
    referenceId: string,
    recordType: string,
  ): Promise<string> {
    const key = ctx.stub.createCompositeKey('Anchor', [recordType, referenceId])
    const data = await ctx.stub.getState(key)

    if (!data || data.length === 0) {
      throw new Error(`Anchor not found: ${recordType}/${referenceId}`)
    }

    return data.toString()
  }

  /**
   * Get all anchors for a reference ID (credential or delegation)
   */
  async getAnchorsForReference(
    ctx: Context,
    referenceId: string,
  ): Promise<string> {
    const iterator = await ctx.stub.getStateByPartialCompositeKey('Ref', [referenceId])
    const results: AnchorRecord[] = []

    let result = await iterator.next()
    while (!result.done) {
      if (result.value && result.value.value) {
        results.push(JSON.parse(result.value.value.toString()))
      }
      result = await iterator.next()
    }
    await iterator.close()

    return JSON.stringify(results)
  }

  /**
   * Verify that a hash matches the on-chain anchor
   */
  async verifyAnchor(
    ctx: Context,
    referenceId: string,
    recordType: string,
    expectedHash: string,
  ): Promise<string> {
    const key = ctx.stub.createCompositeKey('Anchor', [recordType, referenceId])
    const data = await ctx.stub.getState(key)

    if (!data || data.length === 0) {
      return JSON.stringify({ verified: false, reason: 'Anchor not found on ledger' })
    }

    const record: AnchorRecord = JSON.parse(data.toString())
    const verified = record.dataHash === expectedHash

    return JSON.stringify({
      verified,
      onChainHash: record.dataHash,
      expectedHash,
      recordType: record.recordType,
      timestamp: record.timestamp,
    })
  }
}
