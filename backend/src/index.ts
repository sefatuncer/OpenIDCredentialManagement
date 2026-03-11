import dotenv from 'dotenv'
import https from 'https'
import http from 'http'
import { createServer } from './api/server'
import { initializeIssuerAgent } from './agents/issuer.agent'
import { initializeVerifierAgent } from './agents/verifier.agent'
import { initializeHolderAgent } from './agents/holder.agent'
import type { BaseAgentInstance } from './agents/base.agent'
import { logger } from './utils/logger'
import {
  defaultTlsConfig,
  loadTlsCredentials,
  certificatesExist,
} from './config/tls.config'
import {
  initializeDatabase,
  closeDatabase,
  runMigrations,
  isDatabaseConnected,
} from './database'
import {
  initializeCore,
  shutdownCore,
  getCoreStatus,
  eventBus,
  getStorageType,
  getEnabledFeatures,
} from './core'
import { initializeFeatures, getFeatureSummary } from './config/features.config'
import { initializeCredoService, isUsingCredo, shutdownCredoService } from './services/credo.service'

dotenv.config()

async function main() {
  try {
    logger.info('Starting AI Agent Identity System...')

    // Initialize feature flags first
    initializeFeatures()
    const featureSummary = getFeatureSummary()
    logger.info('Feature flags configured', {
      preset: featureSummary.preset,
      enabled: featureSummary.total.enabled,
      disabled: featureSummary.total.disabled,
    })

    // Initialize database (optional - skip if not configured)
    const dbEnabled = process.env.DATABASE_URL || process.env.DB_HOST
    if (dbEnabled) {
      logger.info('Initializing database connection...')
      try {
        await initializeDatabase()
        await runMigrations()
        logger.info('Database initialized successfully')
      } catch (dbError) {
        logger.warn('Database initialization failed, running without persistence', {
          error: (dbError as Error).message,
        })
      }
    } else {
      logger.info('Database not configured, running with in-memory storage')
    }

    // Initialize core infrastructure (storage, event bus, plugins)
    await initializeCore({
      storageType: 'auto',
      initializePlugins: false, // Will add plugins later
    })
    logger.info('Core infrastructure initialized', {
      storageType: getStorageType(),
      features: getEnabledFeatures().length,
    })

    // Initialize all agents
    logger.info('Initializing agents...')

    const [issuerAgent, verifierAgent, holderAgent] = await Promise.all([
      initializeIssuerAgent(),
      initializeVerifierAgent(),
      initializeHolderAgent(),
    ])

    logger.info('All agents initialized successfully')

    // Initialize Credo service (optional - enhances with full OpenID4VC support)
    logger.info('Initializing Credo service...')
    const credoActive = await initializeCredoService()
    if (credoActive) {
      logger.info('Credo service active - using Credo-TS for OpenID4VCI/VP')
    } else {
      logger.info('Credo service inactive - using Jose-based implementation')
    }

    // Create Express app
    const app = createServer()
    const port = process.env.API_PORT || 3000
    const httpsPort = process.env.HTTPS_PORT || 3443

    // Create server (HTTP or HTTPS based on config)
    let server: http.Server | https.Server
    let protocol: string

    if (defaultTlsConfig.enabled && certificatesExist(defaultTlsConfig)) {
      // TLS enabled - create HTTPS server
      const tlsOptions = loadTlsCredentials(defaultTlsConfig)
      if (tlsOptions) {
        server = https.createServer(tlsOptions, app)
        protocol = 'https'

        server.listen(httpsPort, () => {
          logger.info(`HTTPS server running on port ${httpsPort}`)
          logger.info('TLS/mTLS enabled', {
            minVersion: defaultTlsConfig.minVersion,
            requestCert: defaultTlsConfig.requestCert,
          })
        })

        // Also start HTTP server for redirect (optional)
        if (process.env.TLS_REDIRECT_HTTP === 'true') {
          const httpApp = createServer()
          httpApp.use((req, res) => {
            res.redirect(301, `https://${req.hostname}:${httpsPort}${req.url}`)
          })
          http.createServer(httpApp).listen(port, () => {
            logger.info(`HTTP redirect server running on port ${port} -> ${httpsPort}`)
          })
        }
      } else {
        // Fallback to HTTP if TLS loading failed
        server = http.createServer(app)
        protocol = 'http'
        server.listen(port)
        logger.warn('TLS enabled but credentials failed to load, falling back to HTTP')
      }
    } else {
      // TLS disabled - create HTTP server
      server = http.createServer(app)
      protocol = 'http'

      server.listen(port, () => {
        logger.info(`HTTP server running on port ${port}`)
        if (defaultTlsConfig.enabled && !certificatesExist(defaultTlsConfig)) {
          logger.warn('TLS enabled but certificates not found. Run scripts/generate-certs.sh')
        }
      })
    }

    const displayPort = protocol === 'https' ? httpsPort : port

    // Emit system startup event
    eventBus.emit('system.startup', {
      protocol,
      port: displayPort,
      storageType: getStorageType(),
      features: getEnabledFeatures(),
      timestamp: new Date(),
    })

    logger.info('AI Agent Identity System is ready!')
    logger.info('')
    logger.info('Endpoints:')
    logger.info(`  Health:   ${protocol}://localhost:${displayPort}/health`)
    logger.info(`  Swagger:  ${protocol}://localhost:${displayPort}/api/v1/docs`)
    logger.info(`  Issuer:   ${protocol}://localhost:${displayPort}/api/v1/issuer`)
    logger.info(`  Verifier: ${protocol}://localhost:${displayPort}/api/v1/verifier`)
    logger.info(`  Holder:   ${protocol}://localhost:${displayPort}/api/v1/holder`)
    logger.info(`  Metrics:  ${protocol}://localhost:${displayPort}/metrics`)
    logger.info('')
    logger.info('Core Status:')
    logger.info(`  Storage:  ${getStorageType()}`)
    logger.info(`  SSI Mode: ${isUsingCredo() ? 'Credo-TS (full OpenID4VC)' : 'Jose (lightweight)'}`)
    logger.info(`  Features: ${getEnabledFeatures().length} enabled`)

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down...')

      // Emit shutdown event
      eventBus.emit('system.shutdown', {
        timestamp: new Date(),
      })

      server.close(() => {
        logger.info('Server closed')
      })

      await Promise.all([
        issuerAgent.shutdown(),
        verifierAgent.shutdown(),
        holderAgent.shutdown(),
      ])

      // Shutdown Credo service
      await shutdownCredoService()

      // Shutdown core infrastructure
      await shutdownCore()

      // Close database connection
      if (await isDatabaseConnected()) {
        await closeDatabase()
      }

      logger.info('All agents shut down')
      process.exit(0)
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    logger.error('Failed to start AI Agent Identity System', {
      message: errorMessage,
      stack: errorStack,
      error: JSON.stringify(error, Object.getOwnPropertyNames(error))
    })
    console.error('Startup error:', error)
    process.exit(1)
  }
}

main()
