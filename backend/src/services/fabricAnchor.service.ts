/**
 * Hyperledger Fabric Anchor Service
 *
 * Writes immutable SHA-256 hash anchors to Fabric ledger for
 * credential revocation and delegation events.
 *
 * On-chain data: hash + timestamp + event type only.
 * Credential content is NEVER stored on-chain.
 *
 * Graceful degradation: if HLF unavailable, records stay in
 * PostgreSQL with status 'pending' and retry job picks them up.
 */

import { createHash } from 'crypto'
import { query } from '../database/connection'
import { logger } from '../utils/logger'

// --- Types ---

interface FabricConfig {
  peerEndpoint: string
  mspId: string
  channelName: string
  chaincodeName: string
  certPath?: string
  keyPath?: string
  tlsCertPath?: string
}

interface AnchorRecord {
  id: string
  recordType: string
  referenceId: string
  dataHash: string
  fabricTxId: string | null
  fabricBlockNumber: number | null
  status: 'pending' | 'confirmed' | 'failed'
  retryCount: number
  payload: Record<string, unknown>
  createdAt: string
  confirmedAt: string | null
  errorMessage: string | null
}

type RecordType = 'revocation' | 'delegation_created' | 'delegation_revoked'

// --- State ---

let fabricConfig: FabricConfig | null = null
let fabricConnected = false

// --- Public API ---

/**
 * Initialize the Fabric anchor service
 */
export async function initialize(config: FabricConfig): Promise<void> {
  fabricConfig = config
  logger.info('Fabric anchor service initializing', {
    peerEndpoint: config.peerEndpoint,
    mspId: config.mspId,
    channelName: config.channelName,
  })

  try {
    // Test connectivity (non-blocking — if fails, records stay pending)
    await testConnection()
    fabricConnected = true
    logger.info('Fabric anchor service connected')
  } catch (err) {
    fabricConnected = false
    logger.warn('Fabric anchor service — HLF not available, records will be queued', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Anchor a record (revocation, delegation) to Fabric ledger
 */
export async function anchorRecord(
  recordType: RecordType,
  referenceId: string,
  payload: Record<string, unknown>,
): Promise<AnchorRecord> {
  const dataHash = computeHash(recordType, referenceId, payload)
  const timestamp = new Date().toISOString()

  // Write to PostgreSQL first (always succeeds)
  const result = await query(
    `INSERT INTO fabric_anchor_records (record_type, reference_id, data_hash, payload, status)
     VALUES ($1, $2, $3, $4, 'pending')
     RETURNING id, record_type, reference_id, data_hash, fabric_tx_id, fabric_block_number,
               status, retry_count, payload, created_at, confirmed_at, error_message`,
    [recordType, referenceId, dataHash, JSON.stringify(payload)],
  )

  const record = mapRecord(result.rows[0])

  // Attempt to write to Fabric (non-blocking)
  if (fabricConnected) {
    try {
      const txId = await submitToFabric(recordType, referenceId, dataHash, timestamp)
      await query(
        `UPDATE fabric_anchor_records SET fabric_tx_id = $2, status = 'confirmed', confirmed_at = NOW()
         WHERE id = $1`,
        [record.id, txId],
      )
      record.fabricTxId = txId
      record.status = 'confirmed'
      logger.info('Anchor confirmed on Fabric', { recordType, referenceId, txId })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await query(
        `UPDATE fabric_anchor_records SET error_message = $2, retry_count = retry_count + 1 WHERE id = $1`,
        [record.id, msg],
      )
      logger.warn('Fabric anchor write failed — will retry', { recordType, referenceId, error: msg })
    }
  }

  return record
}

/**
 * Verify an anchor against the Fabric ledger
 */
export async function verifyAnchor(
  referenceId: string,
): Promise<{ verified: boolean; localHash?: string; onChainHash?: string; records: AnchorRecord[] }> {
  const result = await query(
    `SELECT * FROM fabric_anchor_records WHERE reference_id = $1 ORDER BY created_at`,
    [referenceId],
  )

  const records = result.rows.map(mapRecord)

  if (records.length === 0) {
    return { verified: false, records: [] }
  }

  // Check confirmed records against Fabric
  const confirmedRecords = records.filter((r) => r.status === 'confirmed' && r.fabricTxId)
  if (confirmedRecords.length === 0) {
    return { verified: false, records }
  }

  if (!fabricConnected) {
    return { verified: false, localHash: confirmedRecords[0].dataHash, records }
  }

  try {
    const latestConfirmed = confirmedRecords[confirmedRecords.length - 1]
    const onChainResult = await queryFabric(referenceId, latestConfirmed.recordType)
    const onChainHash = onChainResult?.dataHash

    return {
      verified: onChainHash === latestConfirmed.dataHash,
      localHash: latestConfirmed.dataHash,
      onChainHash,
      records,
    }
  } catch (err) {
    logger.warn('Fabric verify failed', { referenceId, error: err })
    return { verified: false, localHash: confirmedRecords[0].dataHash, records }
  }
}

/**
 * Get anchor status for a reference ID
 */
export async function getAnchorStatus(
  referenceId: string,
): Promise<AnchorRecord[]> {
  const result = await query(
    `SELECT * FROM fabric_anchor_records WHERE reference_id = $1 ORDER BY created_at`,
    [referenceId],
  )
  return result.rows.map(mapRecord)
}

/**
 * List recent anchor records (paginated)
 */
export async function listAnchors(
  limit = 50,
  offset = 0,
): Promise<{ records: AnchorRecord[]; total: number }> {
  const countResult = await query(`SELECT COUNT(*)::int as total FROM fabric_anchor_records`)
  const total = countResult.rows[0].total

  const result = await query(
    `SELECT * FROM fabric_anchor_records ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset],
  )

  return { records: result.rows.map(mapRecord), total }
}

/**
 * Retry pending/failed anchors — called by background job
 */
export async function retryPendingAnchors(): Promise<number> {
  if (!fabricConnected) return 0

  const result = await query(
    `SELECT * FROM fabric_anchor_records WHERE status IN ('pending', 'failed') AND retry_count < 3
     ORDER BY created_at LIMIT 10`,
  )

  let retried = 0
  for (const row of result.rows) {
    const record = mapRecord(row)
    try {
      const txId = await submitToFabric(
        record.recordType as RecordType,
        record.referenceId,
        record.dataHash,
        record.createdAt,
      )
      await query(
        `UPDATE fabric_anchor_records SET fabric_tx_id = $2, status = 'confirmed', confirmed_at = NOW(), error_message = NULL
         WHERE id = $1`,
        [record.id, txId],
      )
      retried++
      logger.info('Anchor retry succeeded', { id: record.id, txId })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await query(
        `UPDATE fabric_anchor_records SET retry_count = retry_count + 1, error_message = $2,
         status = CASE WHEN retry_count >= 2 THEN 'failed' ELSE status END
         WHERE id = $1`,
        [record.id, msg],
      )
    }
  }

  if (retried > 0) {
    logger.info('Anchor retry job completed', { retried, total: result.rows.length })
  }

  return retried
}

/**
 * Check if the Fabric anchor service is connected
 */
export function isConnected(): boolean {
  return fabricConnected
}

// --- Internal helpers ---

function computeHash(recordType: string, referenceId: string, payload: Record<string, unknown>): string {
  const data = JSON.stringify({ recordType, referenceId, ...payload })
  return createHash('sha256').update(data).digest('hex')
}

function mapRecord(row: Record<string, unknown>): AnchorRecord {
  return {
    id: row.id as string,
    recordType: row.record_type as string,
    referenceId: row.reference_id as string,
    dataHash: row.data_hash as string,
    fabricTxId: row.fabric_tx_id as string | null,
    fabricBlockNumber: row.fabric_block_number as number | null,
    status: row.status as AnchorRecord['status'],
    retryCount: row.retry_count as number,
    payload: (typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload) as Record<string, unknown>,
    createdAt: String(row.created_at),
    confirmedAt: row.confirmed_at ? String(row.confirmed_at) : null,
    errorMessage: row.error_message as string | null,
  }
}

/**
 * Connect to Fabric Gateway — shared helper for submit/query
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function connectToFabric(): Promise<{ gateway: any; client: any; contract: any }> {
  if (!fabricConfig) throw new Error('Fabric not initialized')

  // @ts-ignore — optional peer dependency
  const { connect, signers } = await import('@hyperledger/fabric-gateway')
  // @ts-ignore — optional peer dependency
  const grpc = await import('@grpc/grpc-js')
  const fs = await import('fs')

  const certPath = fabricConfig.certPath
  const keyPath = fabricConfig.keyPath

  if (!certPath || !keyPath) {
    throw new Error('HLF_CERT_PATH and HLF_KEY_PATH required for Fabric Gateway')
  }

  const credentials = grpc.credentials.createInsecure()
  const client = new grpc.Client(fabricConfig.peerEndpoint, credentials)

  const certificate = fs.readFileSync(certPath)
  const privateKey = fs.readFileSync(keyPath)
  const signer = signers.newPrivateKeySigner(
    (await import('crypto')).createPrivateKey(privateKey),
  )

  const gateway = connect({
    client,
    identity: { mspId: fabricConfig.mspId, credentials: certificate },
    signer,
  })

  const network = gateway.getNetwork(fabricConfig.channelName)
  const contract = network.getContract(fabricConfig.chaincodeName)

  return { gateway, client, contract }
}

/**
 * Submit anchor to Fabric Gateway
 */
async function submitToFabric(
  recordType: string,
  referenceId: string,
  dataHash: string,
  timestamp: string,
): Promise<string> {
  try {
    const { gateway, client, contract } = await connectToFabric()
    try {
      const result = await contract.submitTransaction(
        'writeAnchor', recordType, referenceId, dataHash, timestamp,
      )
      return new TextDecoder().decode(result)
    } finally {
      gateway.close()
      client.close()
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('Cannot find module')) {
      throw new Error(
        'Fabric Gateway SDK not installed. Run: npm install @hyperledger/fabric-gateway @grpc/grpc-js',
      )
    }
    throw err
  }
}

/**
 * Query Fabric ledger for anchor verification
 */
async function queryFabric(
  referenceId: string,
  recordType: string,
): Promise<{ dataHash: string } | null> {
  try {
    const { gateway, client, contract } = await connectToFabric()
    try {
      const result = await contract.evaluateTransaction('readAnchor', referenceId, recordType)
      return JSON.parse(new TextDecoder().decode(result))
    } finally {
      gateway.close()
      client.close()
    }
  } catch {
    return null
  }
}

/**
 * Test Fabric connectivity
 */
async function testConnection(): Promise<void> {
  if (!fabricConfig) throw new Error('Fabric not configured')

  // Try importing the SDK — if not installed, mark as disconnected
  try {
    // @ts-ignore — optional peer dependency
    await import('@hyperledger/fabric-gateway')
    // @ts-ignore — optional peer dependency
    await import('@grpc/grpc-js')
  } catch {
    throw new Error('Fabric Gateway SDK not available')
  }
}
