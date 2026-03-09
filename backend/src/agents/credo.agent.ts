/**
 * Credo Agent - Credo-TS 0.6.x tabanlı SSI agent
 * OpenID4VCI ve OpenID4VP desteği
 *
 * NOT: Bu dosya Credo entegrasyonu için hazırlanmıştır.
 * Native askar modülü için Visual Studio Build Tools gereklidir.
 * Kurulum için: scripts/setup-credo.ps1 scriptini admin olarak çalıştırın.
 *
 * Askar kurulmadan Jose-based fallback kullanılır.
 */

import {
  Agent,
  InitConfig,
  DidsModule,
  W3cCredentialsModule,
  W3cCredential,
  ClaimFormat,
} from '@credo-ts/core'
import { agentDependencies } from '@credo-ts/node'
import {
  OpenId4VcModule,
  OpenId4VciCredentialRequestToCredentialMapperOptions,
  OpenId4VciSignW3cCredentials,
} from '@credo-ts/openid4vc'
import express from 'express'
import { logger } from '../utils/logger'

// Type imports
import type { Express } from 'express'

// Credo Agent instance
let credoAgent: Agent | null = null
let credoApp: Express | null = null
let isInitialized = false
let askarAvailable: boolean | null = null

export interface CredoAgentConfig {
  label: string
  walletId: string
  walletKey: string
  issuerBaseUrl: string
  verifierBaseUrl: string
  endpoints?: string[]
}

/**
 * Askar modülünün kullanılabilirliğini kontrol et
 */
export async function checkAskarAvailability(): Promise<boolean> {
  if (askarAvailable !== null) {
    return askarAvailable
  }

  try {
    // Askar modülünü dinamik olarak import et
    const askarModule = await import('@credo-ts/askar')
    const ariesAskarNodejs = await import('@hyperledger/aries-askar-nodejs')

    if (askarModule && ariesAskarNodejs && ariesAskarNodejs.ariesAskarNodeJS) {
      logger.info('Askar module available')
      askarAvailable = true
      return true
    }

    logger.warn('Askar module loaded but ariesAskarNodeJS not properly initialized')
    askarAvailable = false
    return false
  } catch (error) {
    logger.warn('Askar module not available', {
      error: (error as Error).message,
      hint: 'Run scripts/setup-credo.ps1 as administrator to install Visual Studio Build Tools',
    })
    askarAvailable = false
    return false
  }
}

/**
 * Credential request mapper - Credo callback
 */
async function credentialRequestToCredentialMapper(
  options: OpenId4VciCredentialRequestToCredentialMapperOptions
): Promise<OpenId4VciSignW3cCredentials> {
  const { credentialConfigurationId, holderBinding, issuanceSession } = options

  logger.debug('Credential mapper called', { credentialConfigurationId })

  // Holder DID'ini al
  const holderDid = holderBinding.didUrl || 'unknown'
  const now = new Date()
  const oneYearFromNow = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)

  // Credential subject oluştur
  const credentialSubject = buildCredentialSubject(credentialConfigurationId, holderDid)

  // W3cCredential oluştur
  const credential = new W3cCredential({
    context: ['https://www.w3.org/2018/credentials/v1'],
    type: ['VerifiableCredential', credentialConfigurationId],
    issuer: issuanceSession.issuerId,
    issuanceDate: now.toISOString(),
    expirationDate: oneYearFromNow.toISOString(),
    credentialSubject,
  })

  return {
    type: 'credentials',
    format: ClaimFormat.JwtVc,
    credentials: [
      {
        verificationMethod: '', // Agent tarafından otomatik ayarlanacak
        credential,
      },
    ],
  }
}

/**
 * Credential subject oluştur
 */
function buildCredentialSubject(configId: string, holderDid: string): Record<string, any> {
  const now = new Date().toISOString()
  const oneYearFromNow = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()

  switch (configId) {
    case 'AIAgentIdentityCredential':
      return {
        id: holderDid,
        agent_id: `agent-${Date.now()}`,
        agent_type: 'autonomous',
        agent_name: 'AI Agent',
        agent_version: '1.0.0',
        capabilities: ['text-generation', 'data-analysis'],
        owner_did: holderDid,
        owner_name: 'Agent Owner',
        created_at: now,
        valid_until: oneYearFromNow,
        trust_level: 'basic',
      }

    case 'DelegationCredential':
      return {
        id: holderDid,
        delegation_id: `del-${Date.now()}`,
        delegator_did: holderDid,
        delegate_did: `did:key:delegate-${Date.now()}`,
        scope: ['read', 'write'],
        valid_until: oneYearFromNow,
        revocable: true,
      }

    case 'CapabilityCredential':
      return {
        id: holderDid,
        capability_id: `cap-${Date.now()}`,
        capability_type: 'api_access',
        resource: '*',
        actions: ['read', 'write'],
        valid_until: oneYearFromNow,
      }

    default:
      return {
        id: holderDid,
        type: configId,
        issuedAt: now,
      }
  }
}

/**
 * Credo Agent'ı başlat
 */
export async function initializeCredoAgent(config: CredoAgentConfig): Promise<Agent | null> {
  if (credoAgent && isInitialized) {
    logger.info('Credo agent already initialized')
    return credoAgent
  }

  // Askar kullanılabilirliğini kontrol et
  const hasAskar = await checkAskarAvailability()
  if (!hasAskar) {
    logger.warn('Cannot initialize Credo agent without Askar. Using Jose-based fallback.')
    return null
  }

  logger.info('Initializing Credo agent...', { label: config.label })

  try {
    // Askar modülünü dinamik olarak import et
    const { AskarModule } = await import('@credo-ts/askar')
    const { ariesAskarNodeJS } = await import('@hyperledger/aries-askar-nodejs')

    // Express app oluştur - Credo kendi tipini bekliyor
    credoApp = express() as any

    // Agent configuration
    const agentConfig: InitConfig = {
      label: config.label,
      walletConfig: {
        id: config.walletId,
        key: config.walletKey,
      },
    }

    // Agent oluştur
    credoAgent = new Agent({
      config: agentConfig,
      dependencies: agentDependencies,
      modules: {
        // Askar wallet module
        askar: new AskarModule({
          ariesAskar: ariesAskarNodeJS,
        }),
        // DID modülü
        dids: new DidsModule(),
        // W3C Credentials
        w3cCredentials: new W3cCredentialsModule(),
        // OpenID4VC modülü (issuer + verifier + holder)
        openId4Vc: new OpenId4VcModule({
          app: credoApp as any,
          issuer: {
            baseUrl: config.issuerBaseUrl,
            credentialRequestToCredentialMapper,
          },
          verifier: {
            baseUrl: config.verifierBaseUrl,
          },
        }),
      },
    })

    // Agent'ı başlat
    await credoAgent.initialize()
    isInitialized = true

    // DID oluştur (eğer yoksa)
    await ensureAgentDid(credoAgent)

    logger.info('Credo agent initialized successfully', {
      label: config.label,
      walletId: config.walletId,
    })

    return credoAgent
  } catch (error) {
    logger.error('Failed to initialize Credo agent', {
      error: (error as Error).message,
      stack: (error as Error).stack,
    })
    return null
  }
}

/**
 * Agent için DID oluştur (did:key)
 */
async function ensureAgentDid(agent: Agent): Promise<string> {
  try {
    // Mevcut DID'leri kontrol et
    const existingDids = await agent.dids.getCreatedDids({ method: 'key' })

    if (existingDids.length > 0) {
      const did = existingDids[0].did
      logger.info('Using existing DID', { did })
      return did
    }

    // Yeni DID oluştur
    const didResult = await agent.dids.create({
      method: 'key',
      options: {
        keyType: 'Ed25519',
      },
    })

    if (!didResult.didState.did) {
      throw new Error('Failed to create DID')
    }

    logger.info('Created new DID', { did: didResult.didState.did })
    return didResult.didState.did
  } catch (error) {
    logger.error('Failed to ensure agent DID', { error: (error as Error).message })
    throw error
  }
}

/**
 * Credo Agent'ı getir
 */
export function getCredoAgent(): Agent | null {
  return credoAgent
}

/**
 * Credo Agent hazır mı?
 */
export function isCredoAgentReady(): boolean {
  return isInitialized && credoAgent !== null
}

/**
 * Agent DID'ini getir
 */
export async function getAgentDid(): Promise<string | null> {
  if (!credoAgent) {
    return null
  }

  try {
    const dids = await credoAgent.dids.getCreatedDids({ method: 'key' })
    if (dids.length === 0) {
      return null
    }
    return dids[0].did
  } catch (error) {
    logger.error('Failed to get agent DID', { error: (error as Error).message })
    return null
  }
}

/**
 * Express app'i getir
 */
export function getCredoApp(): Express | null {
  return credoApp
}

/**
 * Agent'ı kapat
 */
export async function shutdownCredoAgent(): Promise<void> {
  if (credoAgent && isInitialized) {
    try {
      await credoAgent.shutdown()
      logger.info('Credo agent shutdown successfully')
    } catch (error) {
      logger.error('Error shutting down Credo agent', { error: (error as Error).message })
    } finally {
      credoAgent = null
      isInitialized = false
    }
  }
}

// ==================== ISSUER API ====================

/**
 * Credential offer oluştur
 */
export async function createCredoCredentialOffer(
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
  if (!credoAgent || !isInitialized) {
    return null
  }

  try {
    const issuerApi = credoAgent.modules.openId4Vc.issuer

    // İlk önce bir issuer kaydı olmalı
    const issuers = await issuerApi.getAll()
    let issuer = issuers[0]

    if (!issuer) {
      // Issuer oluştur
      issuer = await issuerApi.createIssuer({
        credentialConfigurationsSupported: {
          AIAgentIdentityCredential: {
            format: ClaimFormat.JwtVc,
            credential_definition: {
              type: ['VerifiableCredential', 'AIAgentIdentityCredential'],
            },
          },
          DelegationCredential: {
            format: ClaimFormat.JwtVc,
            credential_definition: {
              type: ['VerifiableCredential', 'DelegationCredential'],
            },
          },
          CapabilityCredential: {
            format: ClaimFormat.JwtVc,
            credential_definition: {
              type: ['VerifiableCredential', 'CapabilityCredential'],
            },
          },
        },
      })
    }

    const result = await issuerApi.createCredentialOffer({
      issuerId: issuer.issuerId,
      credentialConfigurationIds,
      preAuthorizedCodeFlowConfig: options?.preAuthorizedCodeFlowConfig,
    })

    const credentialOfferUri = `openid-credential-offer://?credential_offer=${encodeURIComponent(
      JSON.stringify(result.credentialOffer)
    )}`

    logger.info('Credential offer created via Credo', {
      credentialConfigurationIds,
    })

    return {
      credentialOffer: result.credentialOffer,
      credentialOfferUri,
      issuanceSession: result.issuanceSession,
    }
  } catch (error) {
    logger.error('Failed to create credential offer via Credo', { error: (error as Error).message })
    return null
  }
}

// ==================== VERIFIER API ====================

/**
 * Verification request oluştur
 */
export async function createCredoVerificationRequest(
  presentationDefinition: any
): Promise<{
  authorizationRequest: any
  authorizationRequestUri: string
  verificationSession: any
} | null> {
  if (!credoAgent || !isInitialized) {
    return null
  }

  try {
    const verifierApi = credoAgent.modules.openId4Vc.verifier

    // İlk önce bir verifier kaydı olmalı
    const verifiers = await verifierApi.getAll()
    let verifier = verifiers[0]

    if (!verifier) {
      verifier = await verifierApi.createVerifier({})
    }

    const result = await verifierApi.createAuthorizationRequest({
      verifierId: verifier.verifierId,
      presentationExchange: {
        definition: presentationDefinition,
      },
    })

    const authorizationRequestUri = `openid4vp://?${result.authorizationRequest}`

    logger.info('Verification request created via Credo', {
      definitionId: presentationDefinition.id,
    })

    return {
      authorizationRequest: result.authorizationRequest,
      authorizationRequestUri,
      verificationSession: result.verificationSession,
    }
  } catch (error) {
    logger.error('Failed to create verification request via Credo', { error: (error as Error).message })
    return null
  }
}

/**
 * Verification session getir
 */
export async function getCredoVerificationSession(sessionId: string): Promise<any | null> {
  if (!credoAgent || !isInitialized) {
    return null
  }

  try {
    const verifierApi = credoAgent.modules.openId4Vc.verifier
    return await verifierApi.getVerificationSessionById(sessionId)
  } catch (error) {
    logger.error('Failed to get verification session', { error: (error as Error).message })
    return null
  }
}

// ==================== HOLDER API ====================

/**
 * Credential offer kabul et
 */
export async function acceptCredoCredentialOffer(
  credentialOfferUri: string
): Promise<{
  credentials: any[]
} | null> {
  if (!credoAgent || !isInitialized) {
    return null
  }

  try {
    const holderApi = credoAgent.modules.openId4Vc.holder

    const resolvedOffer = await holderApi.resolveCredentialOffer(credentialOfferUri)
    const credentials = await holderApi.acceptCredentialOfferUsingPreAuthorizedCode(
      resolvedOffer,
      {}
    )

    logger.info('Credential received via Credo', { count: credentials.length })

    return { credentials }
  } catch (error) {
    logger.error('Failed to accept credential offer via Credo', { error: (error as Error).message })
    return null
  }
}

/**
 * Presentation oluştur ve gönder
 */
export async function submitCredoPresentation(
  authorizationRequestUri: string
): Promise<{
  submitted: boolean
  result?: any
} | null> {
  if (!credoAgent || !isInitialized) {
    return null
  }

  try {
    const holderApi = credoAgent.modules.openId4Vc.holder

    const resolvedRequest = await holderApi.resolveProofRequest({ uri: authorizationRequestUri })
    const result = await holderApi.acceptProofRequest({
      proofRequest: resolvedRequest,
    })

    logger.info('Presentation submitted via Credo')

    return {
      submitted: true,
      result,
    }
  } catch (error) {
    logger.error('Failed to submit presentation via Credo', { error: (error as Error).message })
    return null
  }
}

export { Agent }
