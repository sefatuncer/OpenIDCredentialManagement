/**
 * Credo Agent — Lifecycle + Init + Re-exports
 *
 * Credo-TS 0.6.x tabanlı SSI agent. OpenID4VCI ve OpenID4VP desteği.
 * Credo-TS PRIMARY mimari: Askar ZORUNLU.
 *
 * API wrappers extracted to credo-api.agent.ts.
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
import { eventBus } from '../core/event-bus'
import { isFeatureEnabled } from '../core/feature-flags'

import type { Express } from 'express'

// Re-export API wrappers for backward compat
export {
  createCredoCredentialOffer,
  createCredoVerificationRequest,
  getCredoVerificationSession,
  acceptCredoCredentialOffer,
  submitCredoPresentation,
} from './credo-api.agent'

// ==================== State ====================

let credoAgent: Agent | null = null
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

// ==================== Askar Check ====================

/**
 * Askar modülünün kullanılabilirliğini kontrol et — ZORUNLU
 */
export async function checkAskarAvailability(): Promise<boolean> {
  if (askarAvailable !== null) {
    return askarAvailable
  }

  try {
    const askarModule = await import('@credo-ts/askar')
    const ariesAskarNodejs = await import('@openwallet-foundation/askar-nodejs')

    if (askarModule && ariesAskarNodejs && ariesAskarNodejs.askarNodeJS) {
      logger.info('Askar module available - Credo-TS PRIMARY mode')
      askarAvailable = true
      return true
    }

    throw new Error('Askar module loaded but askarNodeJS export is missing')
  } catch (error) {
    askarAvailable = false
    const msg = error instanceof Error ? error.message : String(error)
    logger.error('FATAL: Askar native module is required but not available', { error: msg })
    throw new Error(
      `Askar native module is required for Credo-TS PRIMARY mode. ` +
      `Ensure @openwallet-foundation/askar-nodejs is installed with native build tools. ` +
      `Original error: ${msg}`
    )
  }
}

// ==================== Credential Mapper ====================

/**
 * Credential request mapper — Credo callback
 */
async function credentialRequestToCredentialMapper(
  options: OpenId4VciCredentialRequestToCredentialMapperOptions
): Promise<OpenId4VciSignW3cCredentials> {
  const { credentialConfigurationId, holderBinding, issuanceSession } = options

  logger.debug('Credential mapper called', { credentialConfigurationId })

  let holderDid = 'unknown'
  if (holderBinding.bindingMethod === 'did' && holderBinding.keys.length > 0) {
    holderDid = holderBinding.keys[0].didUrl
  }

  const now = new Date()
  const oneYearFromNow = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)

  const credentialSubject = buildCredentialSubject(credentialConfigurationId, holderDid)

  const credential = new W3cCredential({
    context: ['https://www.w3.org/2018/credentials/v1'],
    type: ['VerifiableCredential', credentialConfigurationId],
    issuer: issuanceSession.issuerId,
    issuanceDate: now.toISOString(),
    expirationDate: oneYearFromNow.toISOString(),
    credentialSubject,
  })

  eventBus.emit('credential.issued', {
    credentialType: credentialConfigurationId,
    issuerDid: issuanceSession.issuerId,
    holderDid,
    mode: 'credo',
  })

  logger.info('Credential mapped via Credo', {
    credentialConfigurationId,
    holderDid,
    issuerId: issuanceSession.issuerId,
  })

  return {
    type: 'credentials',
    format: ClaimFormat.JwtVc,
    credentials: [
      {
        verificationMethod: '',
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

// ==================== Init ====================

/**
 * Credo Agent'ı başlat — Askar ZORUNLU
 */
export async function initializeCredoAgent(config: CredoAgentConfig, expressApp?: Express): Promise<Agent> {
  if (credoAgent && isInitialized) {
    logger.info('Credo agent already initialized')
    return credoAgent
  }

  await checkAskarAvailability()

  logger.info('Initializing Credo agent...', { label: config.label })

  try {
    const { AskarModule } = await import('@credo-ts/askar')
    const { askarNodeJS } = await import('@openwallet-foundation/askar-nodejs')
    const { registerAskar } = await import('@openwallet-foundation/askar-shared')

    registerAskar({ askar: askarNodeJS as any })

    const credoApp = expressApp || express()

    const { ConsoleLogger, LogLevel } = await import('@credo-ts/core')
    const credoLogLevel = process.env.CREDO_LOG_LEVEL === 'debug' ? LogLevel.debug
      : process.env.CREDO_LOG_LEVEL === 'info' ? LogLevel.info
      : process.env.CREDO_LOG_LEVEL === 'warn' ? LogLevel.warn
      : LogLevel.error

    const agentConfig: InitConfig = {
      allowInsecureHttpUrls: process.env.NODE_ENV !== 'production',
      logger: new ConsoleLogger(credoLogLevel),
    }

    const agentModules: Record<string, unknown> = {
      askar: new AskarModule({
        askar: askarNodeJS as any,
        store: {
          id: config.walletId,
          key: config.walletKey,
        },
      }),
      dids: new DidsModule(),
      w3cCredentials: new W3cCredentialsModule(),
      openId4Vc: new OpenId4VcModule({
        app: credoApp as any,
        issuer: {
          baseUrl: `${config.issuerBaseUrl}/oid4vci`,
          credentialRequestToCredentialMapper,
        },
        verifier: {
          baseUrl: `${config.verifierBaseUrl}/oid4vp`,
        },
      }),
    }

    // Conditionally add DIDComm module
    if (isFeatureEnabled('module.didcomm')) {
      try {
        // @ts-ignore — optional peer dependency
        const { DidCommModule, DidCommHttpOutboundTransport } = await import('@credo-ts/didcomm')
        // @ts-ignore — optional peer dependency
        const { DidCommHttpInboundTransport } = await import('@credo-ts/node')
        const didCommPort = parseInt(process.env.API_PORT || '3000')
        agentModules.didComm = new DidCommModule({
          endpoints: [`${config.issuerBaseUrl}/didcomm`],
          inboundTransports: [
            new DidCommHttpInboundTransport({ app: credoApp as any, path: '/didcomm', port: didCommPort }),
          ],
          outboundTransports: [new DidCommHttpOutboundTransport()],
        })
        logger.info('DIDComm module added to Credo agent')
      } catch (err) {
        logger.warn('DIDComm module not available', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    credoAgent = new Agent({
      config: agentConfig,
      dependencies: agentDependencies,
      modules: agentModules as any,
    })

    await credoAgent.initialize()
    isInitialized = true

    // VP verification event listener for audit
    try {
      const { OpenId4VcVerificationSessionState } = await import('@credo-ts/openid4vc')
      credoAgent.events.on('OpenId4VcVerificationSessionStateChanged', async (event: any) => {
        const session = event.payload?.verificationSession
        if (session?.state === OpenId4VcVerificationSessionState.ResponseVerified) {
          logger.info('Credo VP session verified', { sessionId: session.id })
          eventBus.emit('credential.verified', {
            sessionId: session.id,
            mode: 'credo',
          })
        }
      })
      logger.debug('Registered Credo VP event listener')
    } catch {
      logger.debug('Could not register Credo VP event listener (non-critical)')
    }

    await ensureAgentDid(credoAgent)

    logger.info('Credo agent initialized successfully', {
      label: config.label,
      walletId: config.walletId,
    })

    return credoAgent
  } catch (error) {
    const err = error as any
    logger.error('Failed to initialize Credo agent', {
      error: err.message,
      cause: err.cause?.message || err.cause,
      causeStack: err.cause?.stack,
      stack: err.stack,
    })
    throw error
  }
}

// ==================== DID Management ====================

/**
 * Agent için DID oluştur (did:key)
 */
async function ensureAgentDid(agent: Agent): Promise<string> {
  try {
    const existingDids = await agent.dids.getCreatedDids({ method: 'key' })

    if (existingDids.length > 0) {
      const did = existingDids[0].did
      logger.info('Using existing DID', { did })
      return did
    }

    const keyResult = await agent.kms.createKey({ type: { kty: 'OKP', crv: 'Ed25519' } })
    logger.debug('KMS key created', { keyId: keyResult.keyId })

    const didResult = await agent.dids.create({
      method: 'key',
      options: {
        keyId: keyResult.keyId,
      },
    })

    logger.debug('DID creation result', {
      state: didResult.didState.state,
      did: didResult.didState.did,
      reason: (didResult.didState as any).reason,
    })

    if (!didResult.didState.did) {
      throw new Error(`Failed to create DID: state=${didResult.didState.state}, reason=${(didResult.didState as any).reason || 'unknown'}`)
    }

    logger.info('Created new DID', { did: didResult.didState.did })
    return didResult.didState.did
  } catch (error) {
    logger.error('Failed to ensure agent DID', { error: (error as Error).message })
    throw error
  }
}

// ==================== Getters ====================

export function getCredoAgent(): Agent | null {
  return credoAgent
}

export function isCredoAgentReady(): boolean {
  return isInitialized && credoAgent !== null
}

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

export { Agent }
