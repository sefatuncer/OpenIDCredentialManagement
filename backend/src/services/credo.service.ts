/**
 * Credo Service - Credo Agent lifecycle ve API wrapper'ları
 * Singleton pattern ile tek bir agent instance yönetimi
 *
 * Bu service Credo-TS'i kullanır. Native askar modülü için
 * Visual Studio Build Tools gereklidir.
 *
 * Kurulum: scripts/setup-credo.ps1 scriptini admin olarak çalıştırın.
 */

import { Agent } from '@credo-ts/core'
import {
  initializeCredoAgent,
  getCredoAgent,
  isCredoAgentReady,
  getAgentDid,
  shutdownCredoAgent,
  CredoAgentConfig,
  checkAskarAvailability,
  createCredoCredentialOffer,
  createCredoVerificationRequest,
  getCredoVerificationSession,
  acceptCredoCredentialOffer,
  submitCredoPresentation,
} from '../agents/credo.agent'
import { logger } from '../utils/logger'
import { issuerConfig, verifierConfig } from '../config/agent.config'
import type { Express } from 'express'

// Service state
let serviceInitialized = false
let usingCredo = false

/**
 * Credo Service'i başlat
 * @returns true if using Credo, false if using Jose fallback
 */
export async function initializeCredoService(expressApp?: Express): Promise<boolean> {
  if (serviceInitialized) {
    logger.info('Credo service already initialized', { usingCredo })
    return usingCredo
  }

  // Askar kullanılabilirliğini kontrol et
  const askarAvailable = await checkAskarAvailability()

  if (!askarAvailable) {
    // Jose mode - bu normal çalışma modu, Askar opsiyonel
    logger.info('Using Jose-based SSI implementation (primary mode)')
    serviceInitialized = true
    usingCredo = false
    return false
  }

  const config: CredoAgentConfig = {
    label: process.env.CREDO_AGENT_LABEL || 'AI-Agent-Identity-System',
    walletId: process.env.CREDO_WALLET_ID || process.env.WALLET_ID || 'ai-agent-wallet',
    walletKey: process.env.CREDO_WALLET_KEY || process.env.WALLET_KEY || '',
    issuerBaseUrl: process.env.ISSUER_BASE_URL || issuerConfig.endpoint || 'http://localhost:3000',
    verifierBaseUrl: process.env.VERIFIER_BASE_URL || verifierConfig.endpoint || 'http://localhost:3000',
  }

  // Wallet key kontrolü
  if (!config.walletKey) {
    logger.warn('CREDO_WALLET_KEY or WALLET_KEY not set. Using development key.')
    config.walletKey = 'development-key-do-not-use-in-production'
  }

  try {
    const agent = await initializeCredoAgent(config, expressApp)

    if (agent) {
      serviceInitialized = true
      usingCredo = true
      logger.info('Credo service initialized with Credo agent')
      return true
    } else {
      serviceInitialized = true
      usingCredo = false
      logger.info('Credo agent initialization failed. Using Jose-based implementation.')
      return false
    }
  } catch (error) {
    logger.error('Failed to initialize Credo service', { error: (error as Error).message })
    serviceInitialized = true
    usingCredo = false
    return false
  }
}

/**
 * Credo Agent instance'ını getir (null olabilir)
 */
export function getAgent(): Agent | null {
  return getCredoAgent()
}

/**
 * Service hazır mı?
 */
export function isServiceReady(): boolean {
  return serviceInitialized
}

/**
 * Credo kullanılıyor mu?
 */
export function isUsingCredo(): boolean {
  return usingCredo
}

/**
 * Issuer DID'ini getir
 */
export async function getIssuerDid(): Promise<string | null> {
  if (usingCredo) {
    return await getAgentDid()
  }
  return null
}

/**
 * Verifier DID'ini getir
 */
export async function getVerifierDid(): Promise<string | null> {
  if (usingCredo) {
    return await getAgentDid()
  }
  return null
}

/**
 * Holder DID'ini getir
 */
export async function getHolderDid(): Promise<string | null> {
  if (usingCredo) {
    return await getAgentDid()
  }
  return null
}

// ==================== ISSUER METADATA ====================

/**
 * Get Credo issuer metadata for .well-known endpoint
 */
export async function getCredoIssuerMetadata(): Promise<Record<string, any> | null> {
  if (!usingCredo) {
    return null
  }

  try {
    const agent = getCredoAgent()
    if (!agent) return null

    const issuerApi = agent.modules.openId4Vc.issuer
    const issuers = await issuerApi.getAllIssuers()
    if (issuers.length === 0) return null

    const issuer = issuers[0]

    // Use Credo's built-in metadata generation
    const credoMetadata = await issuerApi.getIssuerMetadata(issuer.issuerId) as any

    // Credo wraps metadata in { credentialIssuer, authorizationServers, ... }
    // Flatten to spec-compliant .well-known response
    if (credoMetadata?.credentialIssuer) {
      return credoMetadata.credentialIssuer as Record<string, any>
    }
    return credoMetadata as Record<string, any>
  } catch (error) {
    logger.error('Failed to get Credo issuer metadata', { error: (error as Error).message })
    return null
  }
}

// ==================== ISSUER API ====================

/**
 * Credential offer oluştur (Credo kullanarak)
 */
export async function createCredentialOffer(
  credentialConfigurationIds: string[],
  options?: {
    preAuthorizedCodeFlowConfig?: {
      txCode?: { inputMode?: string; length?: number }
    }
  }
): Promise<{
  credentialOffer: any
  credentialOfferUri: string
  issuanceSession: any
} | null> {
  if (!usingCredo) {
    logger.debug('Credo not available for createCredentialOffer')
    return null
  }

  return await createCredoCredentialOffer(credentialConfigurationIds, options)
}

// ==================== VERIFIER API ====================

/**
 * Verification request oluştur (Credo kullanarak)
 */
export async function createVerificationRequest(
  presentationDefinition: any
): Promise<{
  authorizationRequest: any
  authorizationRequestUri: string
  verificationSession: any
} | null> {
  if (!usingCredo) {
    logger.debug('Credo not available for createVerificationRequest')
    return null
  }

  return await createCredoVerificationRequest(presentationDefinition)
}

/**
 * Verification session getir
 */
export async function getVerificationSession(sessionId: string): Promise<any | null> {
  if (!usingCredo) {
    return null
  }

  return await getCredoVerificationSession(sessionId)
}

/**
 * Presentation doğrula (Credo kullanarak)
 */
export async function verifyPresentation(
  verificationSessionId: string
): Promise<{
  verified: boolean
  credentialSubject?: Record<string, any>
  issuerDid?: string
  holderDid?: string
  errors?: string[]
} | null> {
  if (!usingCredo) {
    logger.debug('Credo not available for verifyPresentation')
    return null
  }

  const session = await getCredoVerificationSession(verificationSessionId)
  if (!session) {
    return {
      verified: false,
      errors: ['Verification session not found'],
    }
  }

  // Session state kontrolü
  if (session.state === 'Verified') {
    return {
      verified: true,
      credentialSubject: session.presentationExchange?.credentials?.[0]?.credentialSubject,
      issuerDid: session.presentationExchange?.credentials?.[0]?.issuer,
      holderDid: session.presentationExchange?.holder,
    }
  }

  return {
    verified: false,
    errors: [session.errorMessage || 'Verification failed'],
  }
}

// ==================== HOLDER API ====================

/**
 * Credential offer kabul et (Credo kullanarak)
 */
export async function acceptCredentialOffer(
  credentialOfferUri: string
): Promise<{
  credentials: any[]
} | null> {
  if (!usingCredo) {
    logger.debug('Credo not available for acceptCredentialOffer')
    return null
  }

  return await acceptCredoCredentialOffer(credentialOfferUri)
}

/**
 * Presentation oluştur ve gönder (Credo kullanarak)
 */
export async function presentCredential(
  authorizationRequestUri: string
): Promise<{
  submitted: boolean
  result?: any
} | null> {
  if (!usingCredo) {
    logger.debug('Credo not available for presentCredential')
    return null
  }

  return await submitCredoPresentation(authorizationRequestUri)
}

// ==================== LIFECYCLE ====================

/**
 * Service'i kapat
 */
export async function shutdownCredoService(): Promise<void> {
  if (!serviceInitialized) {
    return
  }

  if (usingCredo) {
    try {
      await shutdownCredoAgent()
      logger.info('Credo service shutdown successfully')
    } catch (error) {
      logger.error('Error shutting down Credo service', { error: (error as Error).message })
    }
  }

  serviceInitialized = false
  usingCredo = false
}

/**
 * Health check
 */
export async function healthCheck(): Promise<{
  status: 'healthy' | 'unhealthy'
  mode: 'credo' | 'jose'
  details: {
    serviceReady: boolean
    agentReady: boolean
    askarAvailable: boolean
    did?: string | null
  }
}> {
  const askarAvailable = await checkAskarAvailability()

  try {
    if (!serviceInitialized) {
      return {
        status: 'unhealthy',
        mode: 'jose',
        details: {
          serviceReady: false,
          agentReady: false,
          askarAvailable,
        },
      }
    }

    if (usingCredo) {
      const did = await getAgentDid()

      return {
        status: isCredoAgentReady() ? 'healthy' : 'unhealthy',
        mode: 'credo',
        details: {
          serviceReady: true,
          agentReady: isCredoAgentReady(),
          askarAvailable: true,
          did,
        },
      }
    }

    // Jose mode
    return {
      status: 'healthy',
      mode: 'jose',
      details: {
        serviceReady: true,
        agentReady: true,
        askarAvailable,
      },
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      mode: usingCredo ? 'credo' : 'jose',
      details: {
        serviceReady: false,
        agentReady: false,
        askarAvailable,
      },
    }
  }
}

// Export singleton functions
export const credoService = {
  initialize: initializeCredoService,
  shutdown: shutdownCredoService,
  isReady: isServiceReady,
  isUsingCredo,
  healthCheck,
  getAgent,
  getIssuerDid,
  getVerifierDid,
  getHolderDid,
  // Issuer
  createCredentialOffer,
  // Verifier
  createVerificationRequest,
  getVerificationSession,
  verifyPresentation,
  // Holder
  acceptCredentialOffer,
  presentCredential,
}
