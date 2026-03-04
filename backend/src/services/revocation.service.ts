import { v4 as uuidv4 } from 'uuid'
import { logger } from '../utils/logger'
import {
  IStorageAdapter,
  createStorageAdapter,
  getStorageType,
} from '../core/storage'
import { eventBus } from '../core/event-bus'
import { isFeatureEnabled, requireFeature } from '../core/feature-flags'

/**
 * Status List 2021 Implementation
 * https://w3c-ccg.github.io/vc-status-list-2021/
 *
 * A status list is a bitstring where each bit represents the status of a credential.
 * 0 = not revoked, 1 = revoked
 *
 * Now supports pluggable storage backends via IStorageAdapter.
 */

export interface StatusListEntry {
  id: string
  type: 'StatusList2021Entry'
  statusPurpose: 'revocation' | 'suspension'
  statusListIndex: string
  statusListCredential: string
}

export interface StatusList {
  id: string
  issuer: string
  encodedList: string
  size: number
  usedIndices: number[] // Changed from Set to array for serialization
  createdAt: Date
  updatedAt: Date
}

export interface CredentialStatus {
  credentialId: string
  statusListId: string
  statusListIndex: number
  revoked: boolean
  revokedAt?: Date
  reason?: string
}

// Storage adapters (initialized lazily)
let statusListsStorage: IStorageAdapter<StatusList> | null = null
let credentialStatusesStorage: IStorageAdapter<CredentialStatus> | null = null

const DEFAULT_LIST_SIZE = 131072 // 16KB bitstring = 131072 bits

/**
 * Get or initialize storage adapters
 */
function getStatusListsStorage(): IStorageAdapter<StatusList> {
  if (!statusListsStorage) {
    statusListsStorage = createStorageAdapter<StatusList>('status_lists')
  }
  return statusListsStorage
}

function getCredentialStatusesStorage(): IStorageAdapter<CredentialStatus> {
  if (!credentialStatusesStorage) {
    credentialStatusesStorage = createStorageAdapter<CredentialStatus>('credential_statuses')
  }
  return credentialStatusesStorage
}

/**
 * Check if revocation feature is enabled
 */
function ensureRevocationEnabled(): void {
  requireFeature('module.revocation')
}

/**
 * Create a new status list for an issuer
 */
export async function createStatusList(
  issuerId: string,
  size: number = DEFAULT_LIST_SIZE
): Promise<StatusList> {
  ensureRevocationEnabled()

  const id = `urn:uuid:${uuidv4()}`

  // Create empty bitstring (all zeros = no revocations)
  const byteSize = Math.ceil(size / 8)
  const emptyBitstring = Buffer.alloc(byteSize, 0)
  const encodedList = emptyBitstring.toString('base64')

  const statusList: StatusList = {
    id,
    issuer: issuerId,
    encodedList,
    size,
    usedIndices: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  await getStatusListsStorage().save(id, statusList)

  logger.info('Created new status list', {
    id,
    issuer: issuerId,
    size,
    storage: getStorageType(),
  })

  return statusList
}

/**
 * Get or create a status list for an issuer
 */
export async function getOrCreateStatusList(issuerId: string): Promise<StatusList> {
  if (!isFeatureEnabled('module.revocation')) {
    // Return a dummy status list if revocation is disabled
    return {
      id: 'disabled',
      issuer: issuerId,
      encodedList: '',
      size: 0,
      usedIndices: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }

  // Find existing list with available space
  const allLists = await getStatusListsStorage().list()
  for (const list of allLists) {
    if (list.issuer === issuerId && list.usedIndices.length < list.size) {
      return list
    }
  }

  // Create new list
  return createStatusList(issuerId)
}

/**
 * Allocate a status list entry for a new credential
 */
export async function allocateStatusEntry(
  issuerId: string,
  credentialId: string,
  purpose: 'revocation' | 'suspension' = 'revocation'
): Promise<StatusListEntry> {
  ensureRevocationEnabled()

  const statusList = await getOrCreateStatusList(issuerId)

  // Convert usedIndices to Set for efficient lookup
  const usedSet = new Set(statusList.usedIndices)

  // Find next available index
  let index = 0
  while (usedSet.has(index) && index < statusList.size) {
    index++
  }

  if (index >= statusList.size) {
    throw new Error('Status list is full, creating new list')
  }

  // Mark index as used
  statusList.usedIndices.push(index)
  statusList.updatedAt = new Date()

  await getStatusListsStorage().save(statusList.id, statusList)

  // Store credential status
  const credentialStatus: CredentialStatus = {
    credentialId,
    statusListId: statusList.id,
    statusListIndex: index,
    revoked: false,
  }
  await getCredentialStatusesStorage().save(credentialId, credentialStatus)

  logger.info('Allocated status entry', {
    credentialId,
    statusListId: statusList.id,
    index,
    storage: getStorageType(),
  })

  return {
    id: `${statusList.id}#${index}`,
    type: 'StatusList2021Entry',
    statusPurpose: purpose,
    statusListIndex: index.toString(),
    statusListCredential: statusList.id,
  }
}

/**
 * Revoke a credential
 */
export async function revokeCredential(credentialId: string, reason?: string): Promise<boolean> {
  ensureRevocationEnabled()

  const status = await getCredentialStatusesStorage().get(credentialId)
  if (!status) {
    logger.warn('Credential not found for revocation', { credentialId })
    return false
  }

  if (status.revoked) {
    logger.info('Credential already revoked', { credentialId })
    return true
  }

  const statusList = await getStatusListsStorage().get(status.statusListId)
  if (!statusList) {
    logger.error('Status list not found', { statusListId: status.statusListId })
    return false
  }

  // Update bitstring
  const bitstring = Buffer.from(statusList.encodedList, 'base64')
  const byteIndex = Math.floor(status.statusListIndex / 8)
  const bitIndex = status.statusListIndex % 8
  bitstring[byteIndex] |= (1 << (7 - bitIndex))
  statusList.encodedList = bitstring.toString('base64')
  statusList.updatedAt = new Date()

  await getStatusListsStorage().save(statusList.id, statusList)

  // Update credential status
  status.revoked = true
  status.revokedAt = new Date()
  status.reason = reason

  await getCredentialStatusesStorage().save(credentialId, status)

  logger.info('Credential revoked', {
    credentialId,
    reason,
    storage: getStorageType(),
  })

  eventBus.emit('credential.revoked', {
    credentialId,
    statusListId: status.statusListId,
    reason,
  })

  return true
}

/**
 * Unrevoke (reinstate) a credential
 */
export async function unrevokeCredential(credentialId: string): Promise<boolean> {
  ensureRevocationEnabled()

  const status = await getCredentialStatusesStorage().get(credentialId)
  if (!status) {
    logger.warn('Credential not found for unrevocation', { credentialId })
    return false
  }

  if (!status.revoked) {
    logger.info('Credential not revoked', { credentialId })
    return true
  }

  const statusList = await getStatusListsStorage().get(status.statusListId)
  if (!statusList) {
    logger.error('Status list not found', { statusListId: status.statusListId })
    return false
  }

  // Update bitstring
  const bitstring = Buffer.from(statusList.encodedList, 'base64')
  const byteIndex = Math.floor(status.statusListIndex / 8)
  const bitIndex = status.statusListIndex % 8
  bitstring[byteIndex] &= ~(1 << (7 - bitIndex))
  statusList.encodedList = bitstring.toString('base64')
  statusList.updatedAt = new Date()

  await getStatusListsStorage().save(statusList.id, statusList)

  // Update credential status
  status.revoked = false
  status.revokedAt = undefined
  status.reason = undefined

  await getCredentialStatusesStorage().save(credentialId, status)

  logger.info('Credential unrevoked', {
    credentialId,
    storage: getStorageType(),
  })

  eventBus.emit('credential.unrevoked', {
    credentialId,
    statusListId: status.statusListId,
  })

  return true
}

/**
 * Check if a credential is revoked
 */
export async function isCredentialRevoked(credentialId: string): Promise<boolean> {
  if (!isFeatureEnabled('module.revocation')) {
    // If revocation is disabled, no credential is considered revoked
    return false
  }

  const status = await getCredentialStatusesStorage().get(credentialId)
  if (!status) {
    // Unknown credentials are not considered revoked
    return false
  }
  return status.revoked
}

/**
 * Check revocation status by status list entry
 */
export async function checkStatusListEntry(
  statusListId: string,
  statusListIndex: number
): Promise<boolean> {
  if (!isFeatureEnabled('module.revocation')) {
    return false
  }

  const statusList = await getStatusListsStorage().get(statusListId)
  if (!statusList) {
    logger.warn('Status list not found', { statusListId })
    return false
  }

  const bitstring = Buffer.from(statusList.encodedList, 'base64')
  const byteIndex = Math.floor(statusListIndex / 8)
  const bitIndex = statusListIndex % 8

  if (byteIndex >= bitstring.length) {
    return false
  }

  return (bitstring[byteIndex] & (1 << (7 - bitIndex))) !== 0
}

/**
 * Get credential status details
 */
export async function getCredentialStatus(credentialId: string): Promise<CredentialStatus | null> {
  if (!isFeatureEnabled('module.revocation')) {
    return null
  }
  return getCredentialStatusesStorage().get(credentialId)
}

/**
 * Get status list by ID
 */
export async function getStatusList(statusListId: string): Promise<StatusList | null> {
  if (!isFeatureEnabled('module.revocation')) {
    return null
  }
  return getStatusListsStorage().get(statusListId)
}

/**
 * Get all status lists for an issuer
 */
export async function getStatusListsForIssuer(issuerId: string): Promise<StatusList[]> {
  if (!isFeatureEnabled('module.revocation')) {
    return []
  }

  const result = await getStatusListsStorage().query({
    where: { issuer: issuerId },
  })

  return result.data
}

/**
 * Get all status lists
 */
export async function getAllStatusLists(): Promise<StatusList[]> {
  if (!isFeatureEnabled('module.revocation')) {
    return []
  }
  return getStatusListsStorage().list()
}

/**
 * Get status list credential (for publishing)
 */
export async function getStatusListCredential(
  statusListId: string,
  issuerId: string
): Promise<object | null> {
  if (!isFeatureEnabled('module.revocation')) {
    return null
  }

  const statusList = await getStatusListsStorage().get(statusListId)
  if (!statusList) {
    return null
  }

  return {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://w3id.org/vc/status-list/2021/v1',
    ],
    id: statusListId,
    type: ['VerifiableCredential', 'StatusList2021Credential'],
    issuer: issuerId,
    issuanceDate: statusList.createdAt.toISOString(),
    credentialSubject: {
      id: `${statusListId}#list`,
      type: 'StatusList2021',
      statusPurpose: 'revocation',
      encodedList: statusList.encodedList,
    },
  }
}

/**
 * Get revocation statistics
 */
export async function getRevocationStats(issuerId?: string): Promise<{
  totalLists: number
  totalCredentials: number
  revokedCredentials: number
  activeCredentials: number
  storageType: string
}> {
  if (!isFeatureEnabled('module.revocation')) {
    return {
      totalLists: 0,
      totalCredentials: 0,
      revokedCredentials: 0,
      activeCredentials: 0,
      storageType: getStorageType(),
    }
  }

  let lists = await getStatusListsStorage().list()
  let statuses = await getCredentialStatusesStorage().list()

  if (issuerId) {
    const issuerListIds = new Set(
      lists.filter((l) => l.issuer === issuerId).map((l) => l.id)
    )
    lists = lists.filter((l) => l.issuer === issuerId)
    statuses = statuses.filter((s) => issuerListIds.has(s.statusListId))
  }

  const revokedCount = statuses.filter((s) => s.revoked).length

  return {
    totalLists: lists.length,
    totalCredentials: statuses.length,
    revokedCredentials: revokedCount,
    activeCredentials: statuses.length - revokedCount,
    storageType: getStorageType(),
  }
}

/**
 * Export revocation data (for backup)
 */
export async function exportRevocationData(): Promise<{
  statusLists: StatusList[]
  credentialStatuses: CredentialStatus[]
}> {
  if (!isFeatureEnabled('module.revocation')) {
    return { statusLists: [], credentialStatuses: [] }
  }

  return {
    statusLists: await getStatusListsStorage().list(),
    credentialStatuses: await getCredentialStatusesStorage().list(),
  }
}

/**
 * Import revocation data (for restore)
 */
export async function importRevocationData(data: {
  statusLists?: StatusList[]
  credentialStatuses?: CredentialStatus[]
}): Promise<void> {
  ensureRevocationEnabled()

  if (data.statusLists) {
    for (const list of data.statusLists) {
      await getStatusListsStorage().save(list.id, list)
    }
  }

  if (data.credentialStatuses) {
    for (const status of data.credentialStatuses) {
      await getCredentialStatusesStorage().save(status.credentialId, status)
    }
  }

  logger.info('Revocation data imported', {
    statusLists: data.statusLists?.length || 0,
    credentialStatuses: data.credentialStatuses?.length || 0,
    storage: getStorageType(),
  })
}

/**
 * Clear all revocation data (use with caution!)
 */
export async function clearRevocationData(): Promise<void> {
  ensureRevocationEnabled()

  await getStatusListsStorage().clear()
  await getCredentialStatusesStorage().clear()

  logger.warn('All revocation data cleared')
}
