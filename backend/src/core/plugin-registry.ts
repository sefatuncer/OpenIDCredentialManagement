/**
 * Plugin Registry System
 *
 * Provides a modular plugin architecture for the AI Agent Identity System.
 * Allows modules to be registered, initialized, and managed at runtime.
 */

import { logger } from '../utils/logger'
import { eventBus } from './event-bus'
import { isFeatureEnabled } from './feature-flags'

/**
 * Plugin lifecycle states
 */
export type PluginState = 'registered' | 'initializing' | 'active' | 'error' | 'shutdown'

/**
 * Plugin interface that all plugins must implement
 */
export interface IPlugin {
  /** Unique plugin name */
  name: string

  /** Plugin version (semver) */
  version: string

  /** Plugin description */
  description?: string

  /** Plugin dependencies (other plugin names) */
  dependencies?: string[]

  /** Feature flag that controls this plugin */
  featureFlag?: string

  /** Initialize the plugin */
  initialize(): Promise<void>

  /** Shutdown the plugin gracefully */
  shutdown(): Promise<void>

  /** Health check */
  healthCheck?(): Promise<{ healthy: boolean; details?: Record<string, unknown> }>
}

/**
 * Plugin metadata and state
 */
export interface PluginInfo {
  name: string
  version: string
  description?: string
  state: PluginState
  dependencies: string[]
  featureFlag?: string
  initializedAt?: Date
  error?: string
}

/**
 * Plugin events
 */
export type PluginEvent =
  | 'plugin.registered'
  | 'plugin.initialized'
  | 'plugin.shutdown'
  | 'plugin.error'

/**
 * Plugin Registry implementation
 */
export class PluginRegistry {
  private plugins: Map<string, IPlugin> = new Map()
  private pluginStates: Map<string, PluginState> = new Map()
  private pluginErrors: Map<string, string> = new Map()
  private initializationOrder: string[] = []
  private initializedAt: Map<string, Date> = new Map()

  /**
   * Register a plugin
   */
  register(plugin: IPlugin): void {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin '${plugin.name}' is already registered`)
    }

    // Validate dependencies exist
    if (plugin.dependencies) {
      for (const dep of plugin.dependencies) {
        if (!this.plugins.has(dep)) {
          logger.warn(`Plugin '${plugin.name}' depends on unregistered plugin '${dep}'`)
        }
      }
    }

    this.plugins.set(plugin.name, plugin)
    this.pluginStates.set(plugin.name, 'registered')

    logger.info('Plugin registered', {
      name: plugin.name,
      version: plugin.version,
      dependencies: plugin.dependencies,
    })

    eventBus.emit('plugin.registered', {
      name: plugin.name,
      version: plugin.version,
    })
  }

  /**
   * Unregister a plugin
   */
  unregister(name: string): boolean {
    const plugin = this.plugins.get(name)
    if (!plugin) {
      return false
    }

    // Check if other plugins depend on this one
    const dependents = this.getDependents(name)
    if (dependents.length > 0) {
      throw new Error(
        `Cannot unregister plugin '${name}': other plugins depend on it: ${dependents.join(', ')}`
      )
    }

    this.plugins.delete(name)
    this.pluginStates.delete(name)
    this.pluginErrors.delete(name)
    this.initializedAt.delete(name)
    this.initializationOrder = this.initializationOrder.filter((n) => n !== name)

    logger.info('Plugin unregistered', { name })

    return true
  }

  /**
   * Get a plugin by name
   */
  get<T extends IPlugin>(name: string): T | null {
    return (this.plugins.get(name) as T) || null
  }

  /**
   * Check if a plugin is registered
   */
  has(name: string): boolean {
    return this.plugins.has(name)
  }

  /**
   * Check if a plugin is enabled (registered and feature flag check)
   */
  isEnabled(name: string): boolean {
    const plugin = this.plugins.get(name)
    if (!plugin) {
      return false
    }

    if (plugin.featureFlag && !isFeatureEnabled(plugin.featureFlag)) {
      return false
    }

    return true
  }

  /**
   * Check if a plugin is active (initialized successfully)
   */
  isActive(name: string): boolean {
    return this.pluginStates.get(name) === 'active'
  }

  /**
   * List all plugins with their info
   */
  list(): PluginInfo[] {
    const result: PluginInfo[] = []

    for (const [name, plugin] of this.plugins.entries()) {
      result.push({
        name: plugin.name,
        version: plugin.version,
        description: plugin.description,
        state: this.pluginStates.get(name) || 'registered',
        dependencies: plugin.dependencies || [],
        featureFlag: plugin.featureFlag,
        initializedAt: this.initializedAt.get(name),
        error: this.pluginErrors.get(name),
      })
    }

    return result
  }

  /**
   * Initialize all registered plugins
   */
  async initializeAll(): Promise<void> {
    // Build initialization order based on dependencies
    const order = this.buildInitializationOrder()

    for (const name of order) {
      await this.initializePlugin(name)
    }

    logger.info('All plugins initialized', {
      count: this.initializationOrder.length,
      plugins: this.initializationOrder,
    })
  }

  /**
   * Initialize a specific plugin
   */
  async initializePlugin(name: string): Promise<boolean> {
    const plugin = this.plugins.get(name)
    if (!plugin) {
      throw new Error(`Plugin '${name}' not found`)
    }

    // Check feature flag
    if (plugin.featureFlag && !isFeatureEnabled(plugin.featureFlag)) {
      logger.info(`Plugin '${name}' skipped (feature flag disabled)`, {
        featureFlag: plugin.featureFlag,
      })
      return false
    }

    // Check if already initialized
    if (this.pluginStates.get(name) === 'active') {
      return true
    }

    // Initialize dependencies first
    if (plugin.dependencies) {
      for (const dep of plugin.dependencies) {
        const depState = this.pluginStates.get(dep)
        if (depState !== 'active') {
          await this.initializePlugin(dep)
        }
      }
    }

    // Initialize the plugin
    this.pluginStates.set(name, 'initializing')

    try {
      await plugin.initialize()

      this.pluginStates.set(name, 'active')
      this.initializedAt.set(name, new Date())
      this.initializationOrder.push(name)

      logger.info('Plugin initialized', { name, version: plugin.version })

      eventBus.emit('plugin.initialized', {
        name: plugin.name,
        version: plugin.version,
      })

      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.pluginStates.set(name, 'error')
      this.pluginErrors.set(name, errorMessage)

      logger.error('Plugin initialization failed', {
        name,
        error: errorMessage,
      })

      eventBus.emit('plugin.error', {
        name: plugin.name,
        error: errorMessage,
      })

      throw error
    }
  }

  /**
   * Shutdown all plugins (in reverse initialization order)
   */
  async shutdownAll(): Promise<void> {
    const order = [...this.initializationOrder].reverse()

    for (const name of order) {
      await this.shutdownPlugin(name)
    }

    logger.info('All plugins shutdown')
  }

  /**
   * Shutdown a specific plugin
   */
  async shutdownPlugin(name: string): Promise<void> {
    const plugin = this.plugins.get(name)
    if (!plugin) {
      return
    }

    const state = this.pluginStates.get(name)
    if (state !== 'active') {
      return
    }

    // Check if other active plugins depend on this one
    const activeDependents = this.getDependents(name).filter(
      (dep) => this.pluginStates.get(dep) === 'active'
    )

    if (activeDependents.length > 0) {
      // Shutdown dependents first
      for (const dep of activeDependents) {
        await this.shutdownPlugin(dep)
      }
    }

    try {
      await plugin.shutdown()
      this.pluginStates.set(name, 'shutdown')

      logger.info('Plugin shutdown', { name })

      eventBus.emit('plugin.shutdown', { name: plugin.name })
    } catch (error) {
      logger.error('Plugin shutdown error', { name, error })
    }
  }

  /**
   * Health check all active plugins
   */
  async healthCheck(): Promise<Record<string, { healthy: boolean; details?: Record<string, unknown> }>> {
    const results: Record<string, { healthy: boolean; details?: Record<string, unknown> }> = {}

    for (const [name, plugin] of this.plugins.entries()) {
      if (this.pluginStates.get(name) !== 'active') {
        results[name] = { healthy: false, details: { reason: 'not active' } }
        continue
      }

      if (plugin.healthCheck) {
        try {
          results[name] = await plugin.healthCheck()
        } catch (error) {
          results[name] = {
            healthy: false,
            details: { error: error instanceof Error ? error.message : String(error) },
          }
        }
      } else {
        results[name] = { healthy: true }
      }
    }

    return results
  }

  /**
   * Private: Build initialization order based on dependencies
   */
  private buildInitializationOrder(): string[] {
    const order: string[] = []
    const visited: Set<string> = new Set()
    const visiting: Set<string> = new Set()

    const visit = (name: string): void => {
      if (visited.has(name)) return
      if (visiting.has(name)) {
        throw new Error(`Circular dependency detected involving plugin '${name}'`)
      }

      visiting.add(name)

      const plugin = this.plugins.get(name)
      if (plugin?.dependencies) {
        for (const dep of plugin.dependencies) {
          if (this.plugins.has(dep)) {
            visit(dep)
          }
        }
      }

      visiting.delete(name)
      visited.add(name)
      order.push(name)
    }

    for (const name of this.plugins.keys()) {
      visit(name)
    }

    return order
  }

  /**
   * Private: Get plugins that depend on the given plugin
   */
  private getDependents(name: string): string[] {
    const dependents: string[] = []

    for (const [pluginName, plugin] of this.plugins.entries()) {
      if (plugin.dependencies?.includes(name)) {
        dependents.push(pluginName)
      }
    }

    return dependents
  }

  /**
   * Get initialization order
   */
  getInitializationOrder(): string[] {
    return [...this.initializationOrder]
  }

  /**
   * Get plugin count by state
   */
  getStats(): Record<PluginState, number> {
    const stats: Record<PluginState, number> = {
      registered: 0,
      initializing: 0,
      active: 0,
      error: 0,
      shutdown: 0,
    }

    for (const state of this.pluginStates.values()) {
      stats[state]++
    }

    return stats
  }
}

/**
 * Global plugin registry instance
 */
export const pluginRegistry = new PluginRegistry()

/**
 * Convenience function to register a plugin
 */
export function registerPlugin(plugin: IPlugin): void {
  pluginRegistry.register(plugin)
}

/**
 * Convenience function to get a plugin
 */
export function getPlugin<T extends IPlugin>(name: string): T | null {
  return pluginRegistry.get<T>(name)
}
