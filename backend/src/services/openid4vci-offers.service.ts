/**
 * OpenID4VCI Offers & Storage Service
 *
 * Handles credential offer CRUD, token exchange, storage adapters, and cleanup.
 * Extracted from openid4vci.service.ts for modularity.
 */

import { v4 as uuidv4 } from 'uuid'
import { logger } from '../utils/logger'
import {
  IStorageAdapter,
  createStorageAdapter,
  getStorageType,
} from '../core/storage'
import { eventBus } from '../core/event-bus'
import { saveTenantData, listTenantData } from './tenant-storage.service'
import {
  createCredentialOffer as credoCreateOffer,
} from './credo.service'
import type { CredentialOffer } from './openid4vci.service'

// ==================== Storage Types ====================

export interface StoredCredentialOffer {
  offer: CredentialOffer
  preAuthorizedCode: string
  createdAt: Date
  expiresAt: Date
  claimed: boolean
}

export interface StoredAccessToken {
  tokenKey: string  // Store the token key for cleanup
  offerId: string
  issuedAt: Date
  expiresAt: Date
  scope: string
}

export interface StoredDeferredCredential {
  credentialType: string
  subject: Record<string, unknown>
  holderDid: string
  status: 'pending' | 'ready' | 'issued' | 'failed'
  credential?: string
  createdAt: Date
}

export interface StoredNonce {
  nonce: string
  tokenId: string  // Associated access token
  createdAt: Date
  expiresAt: Date
  used: boolean
}

// ==================== Storage Adapters ====================

let credentialOffersStorage: IStorageAdapter<StoredCredentialOffer> | null = null
let accessTokensStorage: IStorageAdapter<StoredAccessToken> | null = null
let deferredCredentialsStorage: IStorageAdapter<StoredDeferredCredential> | null = null
let nonceStorage: IStorageAdapter<StoredNonce> | null = null

export function getOffersStorage(): IStorageAdapter<StoredCredentialOffer> {
  if (!credentialOffersStorage) {
    credentialOffersStorage = createStorageAdapter<StoredCredentialOffer>('credential_offers')
  }
  return credentialOffersStorage
}

export function getTokensStorage(): IStorageAdapter<StoredAccessToken> {
  if (!accessTokensStorage) {
    accessTokensStorage = createStorageAdapter<StoredAccessToken>('access_tokens')
  }
  return accessTokensStorage
}

export function getDeferredStorage(): IStorageAdapter<StoredDeferredCredential> {
  if (!deferredCredentialsStorage) {
    deferredCredentialsStorage = createStorageAdapter<StoredDeferredCredential>('deferred_credentials')
  }
  return deferredCredentialsStorage
}

export function getNonceStorage(): IStorageAdapter<StoredNonce> {
  if (!nonceStorage) {
    nonceStorage = createStorageAdapter<StoredNonce>('credential_nonces')
  }
  return nonceStorage
}

// ==================== Offer CRUD ====================

/**
 * Create a credential offer — Credo-TS PRIMARY
 */
export async function createCredentialOffer(
  credentialTypes: string[],
  options: {
    txCode?: { input_mode: string; length: number; description?: string }
    userPinRequired?: boolean // deprecated, mapped to txCode
    expiresInSeconds?: number
    tenantId?: string
  } = {}
): Promise<{
  offerId: string
  credentialOffer: CredentialOffer
  credentialOfferUri: string
}> {
  const txCode = options.txCode || (options.userPinRequired
    ? { inputMode: 'numeric', length: 6 }
    : undefined)
  const credoResult = await credoCreateOffer(credentialTypes, {
    preAuthorizedCodeFlowConfig: txCode ? { txCode } : undefined,
  })

  if (!credoResult) {
    throw new Error('Credo credential offer creation failed')
  }

  const offerId = credoResult.issuanceSession?.id || uuidv4()

  logger.info('Created credential offer via Credo', {
    offerId,
    credentialTypes,
    mode: 'credo',
  })

  eventBus.emit('credential.offer.created', {
    offerId,
    credentialTypes,
    expiresAt: new Date(Date.now() + (options.expiresInSeconds || 300) * 1000),
    mode: 'credo',
  })

  return {
    offerId,
    credentialOffer: credoResult.credentialOffer,
    credentialOfferUri: credoResult.credentialOfferUri,
  }
}

/**
 * Get a credential offer by ID
 */
export async function getCredentialOffer(
  offerId: string
): Promise<{ offer: CredentialOffer; expired: boolean; claimed: boolean } | null> {
  const stored = await getOffersStorage().get(offerId)
  if (!stored) {
    return null
  }

  return {
    offer: stored.offer,
    expired: new Date() > stored.expiresAt,
    claimed: stored.claimed,
  }
}

/**
 * Exchange pre-authorized code for access token
 */
export async function exchangePreAuthorizedCode(
  preAuthorizedCode: string,
  userPin?: string
): Promise<{
  access_token: string
  token_type: string
  expires_in: number
  c_nonce?: string
  c_nonce_expires_in?: number
} | { error: string; error_description: string }> {
  // Find the offer with this pre-authorized code
  const allOffers = await getOffersStorage().list()
  let foundOffer: StoredCredentialOffer | null = null

  for (const offer of allOffers) {
    if (offer.preAuthorizedCode === preAuthorizedCode) {
      const result = await getOffersStorage().query({
        where: { preAuthorizedCode },
        limit: 1,
      })
      if (result.data.length > 0) {
        foundOffer = result.data[0]
        for (const o of allOffers) {
          if (o.preAuthorizedCode === preAuthorizedCode) {
            const allData = await getOffersStorage().list()
            foundOffer = o
            break
          }
        }
      }
      break
    }
  }

  // Re-query to find by code
  const offersResult = await getOffersStorage().query({
    limit: 1000,
  })

  for (const offer of offersResult.data) {
    if (offer.preAuthorizedCode === preAuthorizedCode) {
      foundOffer = offer
      break
    }
  }

  if (!foundOffer) {
    return {
      error: 'invalid_grant',
      error_description: 'Invalid pre-authorized code',
    }
  }

  if (new Date() > foundOffer.expiresAt) {
    return {
      error: 'invalid_grant',
      error_description: 'Pre-authorized code has expired',
    }
  }

  if (foundOffer.claimed) {
    return {
      error: 'invalid_grant',
      error_description: 'Pre-authorized code has already been used',
    }
  }

  // Mark as claimed
  const allOffersForUpdate = await getOffersStorage().list()
  for (const offer of allOffersForUpdate) {
    if (offer.preAuthorizedCode === preAuthorizedCode) {
      await getOffersStorage().save(preAuthorizedCode, {
        ...offer,
        claimed: true,
      })
      break
    }
  }

  // Generate access token
  const accessToken = `at_${uuidv4()}`
  const expiresIn = 3600 // 1 hour

  const tokenData: StoredAccessToken = {
    tokenKey: accessToken,
    offerId: preAuthorizedCode,
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    scope: (foundOffer.offer.credential_configuration_ids || foundOffer.offer.credentials || []).join(' '),
  }

  await getTokensStorage().save(accessToken, tokenData)

  // Generate c_nonce for proof of possession
  const cNonce = uuidv4()
  const nonceExpiresIn = 300

  const storedNonce: StoredNonce = {
    nonce: cNonce,
    tokenId: accessToken,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + nonceExpiresIn * 1000),
    used: false,
  }
  await getNonceStorage().save(cNonce, storedNonce)

  logger.info('Issued access token for credential offer', {
    expiresIn,
    nonceExpiresIn,
    storage: getStorageType(),
  })

  eventBus.emit('auth.token.issued', {
    expiresIn,
    scope: tokenData.scope,
  })

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: expiresIn,
    c_nonce: cNonce,
    c_nonce_expires_in: nonceExpiresIn,
  }
}

/**
 * Validate access token
 */
export async function validateAccessToken(
  token: string
): Promise<{ valid: boolean; offerId?: string; error?: string }> {
  const stored = await getTokensStorage().get(token)
  if (!stored) {
    return { valid: false, error: 'Invalid access token' }
  }

  if (new Date() > stored.expiresAt) {
    return { valid: false, error: 'Access token expired' }
  }

  return { valid: true, offerId: stored.offerId }
}

/**
 * List all credential offers (for admin purposes)
 */
export async function listCredentialOffers(tenantId?: string): Promise<Array<{
  offerId: string
  credentialTypes: string[]
  createdAt: Date
  expiresAt: Date
  claimed: boolean
  expired: boolean
}>> {
  const offers = await listTenantData(getOffersStorage(), tenantId)
  const now = new Date()

  return offers.map((offer) => ({
    offerId: offer.preAuthorizedCode,
    credentialTypes: offer.offer.credential_configuration_ids || offer.offer.credentials || [],
    createdAt: offer.createdAt,
    expiresAt: offer.expiresAt,
    claimed: offer.claimed,
    expired: now > offer.expiresAt,
  }))
}

// ==================== Cleanup ====================

/**
 * Cleanup expired offers, tokens, and nonces
 */
export async function cleanupExpired(): Promise<{ offersRemoved: number; tokensRemoved: number; noncesRemoved: number }> {
  let offersRemoved = 0
  let tokensRemoved = 0
  let noncesRemoved = 0
  const now = new Date()

  const offers = await getOffersStorage().list()
  for (const offer of offers) {
    if (now > offer.expiresAt) {
      const deleted = await getOffersStorage().delete(offer.preAuthorizedCode)
      if (deleted) offersRemoved++
    }
  }

  const tokens = await getTokensStorage().list()
  for (const token of tokens) {
    if (now > token.expiresAt) {
      if (token.tokenKey) {
        const deleted = await getTokensStorage().delete(token.tokenKey)
        if (deleted) tokensRemoved++
      }
    }
  }

  const nonces = await getNonceStorage().list()
  for (const nonce of nonces) {
    if (now > nonce.expiresAt || nonce.used) {
      const deleted = await getNonceStorage().delete(nonce.nonce)
      if (deleted) noncesRemoved++
    }
  }

  if (offersRemoved > 0 || tokensRemoved > 0 || noncesRemoved > 0) {
    logger.info('Cleaned up expired items', { offersRemoved, tokensRemoved, noncesRemoved })

    eventBus.emit('credential.offer.expired', {
      offersRemoved,
      tokensRemoved,
      noncesRemoved,
    })
  }

  return { offersRemoved, tokensRemoved, noncesRemoved }
}

let cleanupInterval: NodeJS.Timeout | null = null

export function startCleanupInterval(intervalMs: number = 5 * 60 * 1000): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval)
  }
  cleanupInterval = setInterval(cleanupExpired, intervalMs)
}

export function stopCleanupInterval(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval)
    cleanupInterval = null
  }
}

// Start cleanup by default
startCleanupInterval()
