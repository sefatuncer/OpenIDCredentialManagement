/**
 * Feature Flags System
 *
 * Provides runtime feature toggling for the AI Agent Identity System.
 * Features can be enabled/disabled via environment variables or programmatically.
 */

import { logger } from '../utils/logger'

/**
 * Feature flag categories
 */
export type FeatureCategory = 'module' | 'storage' | 'security' | 'experimental'

/**
 * Feature flag definition
 */
export interface FeatureFlag {
  name: string
  category: FeatureCategory
  description: string
  defaultValue: boolean
  envVar?: string
}

/**
 * All available feature flags
 */
export const featureFlagDefinitions: Record<string, FeatureFlag> = {
  // Core modules (always enabled by default)
  'module.did': {
    name: 'module.did',
    category: 'module',
    description: 'DID management functionality',
    defaultValue: true,
  },
  'module.credential': {
    name: 'module.credential',
    category: 'module',
    description: 'Credential issuance functionality',
    defaultValue: true,
  },
  'module.verification': {
    name: 'module.verification',
    category: 'module',
    description: 'Credential verification functionality',
    defaultValue: true,
  },

  // Optional modules
  'module.trust-registry': {
    name: 'module.trust-registry',
    category: 'module',
    description: 'Trust registry for issuer/verifier management',
    defaultValue: true,
    envVar: 'FEATURE_TRUST_REGISTRY',
  },
  'module.revocation': {
    name: 'module.revocation',
    category: 'module',
    description: 'Credential revocation via Status List 2021',
    defaultValue: true,
    envVar: 'FEATURE_REVOCATION',
  },
  'module.audit': {
    name: 'module.audit',
    category: 'module',
    description: 'Audit logging functionality',
    defaultValue: true,
    envVar: 'FEATURE_AUDIT',
  },
  'module.sdjwt': {
    name: 'module.sdjwt',
    category: 'module',
    description: 'SD-JWT selective disclosure support',
    defaultValue: true,
    envVar: 'FEATURE_SDJWT',
  },
  'module.backup': {
    name: 'module.backup',
    category: 'module',
    description: 'Backup and restore functionality',
    defaultValue: true,
    envVar: 'FEATURE_BACKUP',
  },
  'module.batch-issuance': {
    name: 'module.batch-issuance',
    category: 'module',
    description: 'Batch credential issuance',
    defaultValue: true,
    envVar: 'FEATURE_BATCH_ISSUANCE',
  },
  'module.multi-tenant': {
    name: 'module.multi-tenant',
    category: 'module',
    description: 'Multi-tenant support',
    defaultValue: false,
    envVar: 'FEATURE_MULTI_TENANT',
  },

  'module.hlf-anchoring': {
    name: 'module.hlf-anchoring',
    category: 'module',
    description: 'Hyperledger Fabric immutable hash anchoring for revocation and delegation events',
    defaultValue: false,
    envVar: 'FEATURE_HLF_ANCHORING',
  },

  'module.didcomm': {
    name: 'module.didcomm',
    category: 'module',
    description: 'DIDComm v1 agent-to-agent messaging via Credo-TS',
    defaultValue: false,
    envVar: 'FEATURE_DIDCOMM',
  },

  // Storage features
  'storage.postgres': {
    name: 'storage.postgres',
    category: 'storage',
    description: 'Use PostgreSQL for persistent storage',
    defaultValue: false,
    envVar: 'FEATURE_POSTGRES',
  },
  'storage.redis': {
    name: 'storage.redis',
    category: 'storage',
    description: 'Use Redis for caching',
    defaultValue: false,
    envVar: 'FEATURE_REDIS',
  },

  // Security features
  'security.mtls': {
    name: 'security.mtls',
    category: 'security',
    description: 'Mutual TLS authentication',
    defaultValue: false,
    envVar: 'FEATURE_MTLS',
  },
  'security.rate-limiting': {
    name: 'security.rate-limiting',
    category: 'security',
    description: 'API rate limiting',
    defaultValue: true,
    envVar: 'FEATURE_RATE_LIMITING',
  },

  // Experimental features
  'experimental.federation': {
    name: 'experimental.federation',
    category: 'experimental',
    description: 'Trust registry federation (experimental)',
    defaultValue: false,
    envVar: 'FEATURE_FEDERATION',
  },
  'experimental.verified-bot': {
    name: 'experimental.verified-bot',
    category: 'experimental',
    description: 'Verified bot identity protocol (experimental)',
    defaultValue: false,
    envVar: 'FEATURE_VERIFIED_BOT',
  },
  'experimental.webhooks': {
    name: 'experimental.webhooks',
    category: 'experimental',
    description: 'Webhook notifications (experimental)',
    defaultValue: false,
    envVar: 'FEATURE_WEBHOOKS',
  },
}

/**
 * Runtime feature flag state
 */
const featureState: Map<string, boolean> = new Map()

/**
 * Feature flag event listeners
 */
type FeatureFlagListener = (flag: string, enabled: boolean) => void
const listeners: Set<FeatureFlagListener> = new Set()

/**
 * Initialize feature flags from environment and defaults
 */
export function initializeFeatureFlags(): void {
  for (const [flagName, definition] of Object.entries(featureFlagDefinitions)) {
    let value = definition.defaultValue

    // Check environment variable override
    if (definition.envVar) {
      const envValue = process.env[definition.envVar]
      if (envValue !== undefined) {
        value = envValue === 'true' || envValue === '1'
      }
    }

    // Check DATABASE_URL for postgres feature
    if (flagName === 'storage.postgres' && process.env.DATABASE_URL) {
      value = true
    }

    // Check REDIS_URL for redis feature
    if (flagName === 'storage.redis' && process.env.REDIS_URL) {
      value = true
    }

    featureState.set(flagName, value)
  }

  logger.info('Feature flags initialized', {
    enabled: Array.from(featureState.entries())
      .filter(([, v]) => v)
      .map(([k]) => k),
    disabled: Array.from(featureState.entries())
      .filter(([, v]) => !v)
      .map(([k]) => k),
  })
}

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(flag: string): boolean {
  // Initialize if not done yet
  if (featureState.size === 0) {
    initializeFeatureFlags()
  }

  const value = featureState.get(flag)
  if (value === undefined) {
    logger.warn('Unknown feature flag', { flag })
    return false
  }

  return value
}

/**
 * Set a feature flag value at runtime
 */
export function setFeature(flag: string, enabled: boolean): void {
  if (!featureFlagDefinitions[flag]) {
    logger.warn('Attempting to set unknown feature flag', { flag })
    return
  }

  const previousValue = featureState.get(flag)
  featureState.set(flag, enabled)

  if (previousValue !== enabled) {
    logger.info('Feature flag changed', { flag, enabled, previousValue })

    // Notify listeners
    for (const listener of listeners) {
      try {
        listener(flag, enabled)
      } catch (error) {
        logger.error('Feature flag listener error', { flag, error })
      }
    }
  }
}

/**
 * Get all feature flags and their states
 */
export function getAllFeatureFlags(): Record<string, { enabled: boolean; definition: FeatureFlag }> {
  // Initialize if not done yet
  if (featureState.size === 0) {
    initializeFeatureFlags()
  }

  const result: Record<string, { enabled: boolean; definition: FeatureFlag }> = {}

  for (const [flag, definition] of Object.entries(featureFlagDefinitions)) {
    result[flag] = {
      enabled: featureState.get(flag) || false,
      definition,
    }
  }

  return result
}

/**
 * Get feature flags by category
 */
export function getFeaturesByCategory(category: FeatureCategory): Record<string, boolean> {
  const result: Record<string, boolean> = {}

  for (const [flag, definition] of Object.entries(featureFlagDefinitions)) {
    if (definition.category === category) {
      result[flag] = featureState.get(flag) || false
    }
  }

  return result
}

/**
 * Add a listener for feature flag changes
 */
export function onFeatureFlagChange(listener: FeatureFlagListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Reset all feature flags to defaults
 */
export function resetFeatureFlags(): void {
  featureState.clear()
  initializeFeatureFlags()
}

/**
 * Feature flag guard decorator
 * Throws error if feature is not enabled
 */
export function requireFeature(flag: string): void {
  if (!isFeatureEnabled(flag)) {
    const definition = featureFlagDefinitions[flag]
    throw new Error(
      `Feature '${flag}' is not enabled. ${definition?.description || 'Enable this feature to use this functionality.'}`
    )
  }
}

/**
 * Feature flag check with callback
 * Executes callback only if feature is enabled
 */
export function withFeature<T>(flag: string, callback: () => T, fallback?: T): T | undefined {
  if (isFeatureEnabled(flag)) {
    return callback()
  }
  return fallback
}

/**
 * Get enabled features as a simple list
 */
export function getEnabledFeatures(): string[] {
  return Array.from(featureState.entries())
    .filter(([, enabled]) => enabled)
    .map(([flag]) => flag)
}

/**
 * Check multiple features at once
 */
export function areFeaturesEnabled(...flags: string[]): boolean {
  return flags.every((flag) => isFeatureEnabled(flag))
}

/**
 * Check if any of the features is enabled
 */
export function isAnyFeatureEnabled(...flags: string[]): boolean {
  return flags.some((flag) => isFeatureEnabled(flag))
}
