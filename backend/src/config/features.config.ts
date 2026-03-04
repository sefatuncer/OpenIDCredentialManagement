/**
 * Feature Configuration
 *
 * Central configuration for feature flags and system capabilities.
 * This file provides presets for different deployment environments.
 */

import {
  initializeFeatureFlags,
  setFeature,
  getAllFeatureFlags,
  FeatureCategory,
} from '../core/feature-flags'
import { logger } from '../utils/logger'

/**
 * Environment presets for feature configuration
 */
export type FeaturePreset = 'development' | 'testing' | 'staging' | 'production' | 'minimal'

/**
 * Preset configurations
 */
const presetConfigs: Record<FeaturePreset, Record<string, boolean>> = {
  development: {
    'module.did': true,
    'module.credential': true,
    'module.verification': true,
    'module.trust-registry': true,
    'module.revocation': true,
    'module.audit': true,
    'module.sdjwt': true,
    'module.backup': true,
    'module.batch-issuance': true,
    'module.multi-tenant': false,
    'storage.postgres': false,
    'storage.redis': false,
    'security.mtls': false,
    'security.rate-limiting': false,
    'experimental.federation': false,
    'experimental.verified-bot': false,
    'experimental.webhooks': false,
  },
  testing: {
    'module.did': true,
    'module.credential': true,
    'module.verification': true,
    'module.trust-registry': true,
    'module.revocation': true,
    'module.audit': true,
    'module.sdjwt': true,
    'module.backup': true,
    'module.batch-issuance': true,
    'module.multi-tenant': true,
    'storage.postgres': false,
    'storage.redis': false,
    'security.mtls': false,
    'security.rate-limiting': false,
    'experimental.federation': true,
    'experimental.verified-bot': true,
    'experimental.webhooks': true,
  },
  staging: {
    'module.did': true,
    'module.credential': true,
    'module.verification': true,
    'module.trust-registry': true,
    'module.revocation': true,
    'module.audit': true,
    'module.sdjwt': true,
    'module.backup': true,
    'module.batch-issuance': true,
    'module.multi-tenant': false,
    'storage.postgres': true,
    'storage.redis': false,
    'security.mtls': false,
    'security.rate-limiting': true,
    'experimental.federation': false,
    'experimental.verified-bot': false,
    'experimental.webhooks': false,
  },
  production: {
    'module.did': true,
    'module.credential': true,
    'module.verification': true,
    'module.trust-registry': true,
    'module.revocation': true,
    'module.audit': true,
    'module.sdjwt': true,
    'module.backup': true,
    'module.batch-issuance': true,
    'module.multi-tenant': false,
    'storage.postgres': true,
    'storage.redis': false,
    'security.mtls': true,
    'security.rate-limiting': true,
    'experimental.federation': false,
    'experimental.verified-bot': false,
    'experimental.webhooks': false,
  },
  minimal: {
    'module.did': true,
    'module.credential': true,
    'module.verification': true,
    'module.trust-registry': false,
    'module.revocation': false,
    'module.audit': false,
    'module.sdjwt': false,
    'module.backup': false,
    'module.batch-issuance': false,
    'module.multi-tenant': false,
    'storage.postgres': false,
    'storage.redis': false,
    'security.mtls': false,
    'security.rate-limiting': false,
    'experimental.federation': false,
    'experimental.verified-bot': false,
    'experimental.webhooks': false,
  },
}

/**
 * Apply a feature preset
 */
export function applyFeaturePreset(preset: FeaturePreset): void {
  const config = presetConfigs[preset]
  if (!config) {
    throw new Error(`Unknown feature preset: ${preset}`)
  }

  // First initialize defaults
  initializeFeatureFlags()

  // Then apply preset overrides
  for (const [flag, enabled] of Object.entries(config)) {
    setFeature(flag, enabled)
  }

  logger.info('Applied feature preset', { preset })
}

/**
 * Get current environment preset
 */
export function detectEnvironmentPreset(): FeaturePreset {
  const env = process.env.NODE_ENV || 'development'
  const preset = process.env.FEATURE_PRESET as FeaturePreset | undefined

  if (preset && presetConfigs[preset]) {
    return preset
  }

  switch (env) {
    case 'production':
      return 'production'
    case 'staging':
      return 'staging'
    case 'test':
      return 'testing'
    default:
      return 'development'
  }
}

/**
 * Initialize features based on environment
 */
export function initializeFeatures(): void {
  const preset = detectEnvironmentPreset()
  applyFeaturePreset(preset)
}

/**
 * Get feature summary for health check / status
 */
export function getFeatureSummary(): {
  preset: FeaturePreset
  categories: Record<FeatureCategory, number>
  total: { enabled: number; disabled: number }
} {
  const allFlags = getAllFeatureFlags()
  const preset = detectEnvironmentPreset()

  const categories: Record<FeatureCategory, number> = {
    module: 0,
    storage: 0,
    security: 0,
    experimental: 0,
  }

  let enabled = 0
  let disabled = 0

  for (const { enabled: isEnabled, definition } of Object.values(allFlags)) {
    if (isEnabled) {
      enabled++
      categories[definition.category]++
    } else {
      disabled++
    }
  }

  return {
    preset,
    categories,
    total: { enabled, disabled },
  }
}

/**
 * Export presets for external use
 */
export { presetConfigs }
