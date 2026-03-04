import fs from 'fs'
import path from 'path'
import https from 'https'
import { logger } from '../utils/logger'

export interface TlsConfig {
  enabled: boolean
  certPath: string
  keyPath: string
  caPath?: string
  passphrase?: string
  rejectUnauthorized: boolean
  requestCert: boolean // For mTLS
  minVersion?: 'TLSv1.2' | 'TLSv1.3'
}

export interface MtlsConfig extends TlsConfig {
  clientCertRequired: boolean
  trustedCAs: string[]
}

const defaultCertsDir = path.join(process.cwd(), 'docker', 'certs')

export const defaultTlsConfig: TlsConfig = {
  enabled: process.env.TLS_ENABLED === 'true',
  certPath: process.env.TLS_CERT_PATH || path.join(defaultCertsDir, 'server.crt'),
  keyPath: process.env.TLS_KEY_PATH || path.join(defaultCertsDir, 'server.key'),
  caPath: process.env.TLS_CA_PATH || path.join(defaultCertsDir, 'ca.crt'),
  passphrase: process.env.TLS_PASSPHRASE,
  rejectUnauthorized: process.env.TLS_REJECT_UNAUTHORIZED !== 'false',
  requestCert: process.env.TLS_REQUEST_CERT === 'true',
  minVersion: (process.env.TLS_MIN_VERSION as 'TLSv1.2' | 'TLSv1.3') || 'TLSv1.2',
}

export const defaultMtlsConfig: MtlsConfig = {
  ...defaultTlsConfig,
  clientCertRequired: process.env.MTLS_CLIENT_CERT_REQUIRED === 'true',
  trustedCAs: process.env.MTLS_TRUSTED_CAS?.split(',') || [],
}

/**
 * Load TLS credentials from files
 */
export function loadTlsCredentials(config: TlsConfig): https.ServerOptions | null {
  if (!config.enabled) {
    return null
  }

  try {
    const options: https.ServerOptions = {
      cert: fs.readFileSync(config.certPath),
      key: fs.readFileSync(config.keyPath),
      passphrase: config.passphrase,
      requestCert: config.requestCert,
      rejectUnauthorized: config.rejectUnauthorized,
      minVersion: config.minVersion,
    }

    if (config.caPath && fs.existsSync(config.caPath)) {
      options.ca = fs.readFileSync(config.caPath)
    }

    logger.info('TLS credentials loaded successfully', {
      cert: config.certPath,
      ca: config.caPath,
      requestCert: config.requestCert,
    })

    return options
  } catch (error) {
    logger.error('Failed to load TLS credentials', { error })
    throw error
  }
}

/**
 * Load mTLS credentials including client CA verification
 */
export function loadMtlsCredentials(config: MtlsConfig): https.ServerOptions | null {
  const baseOptions = loadTlsCredentials(config)
  if (!baseOptions) {
    return null
  }

  const options: https.ServerOptions = {
    ...baseOptions,
    requestCert: true,
    rejectUnauthorized: config.clientCertRequired,
  }

  // Load additional trusted CAs for client verification
  if (config.trustedCAs.length > 0) {
    const cas: Buffer[] = []

    if (options.ca) {
      cas.push(options.ca as Buffer)
    }

    for (const caPath of config.trustedCAs) {
      try {
        cas.push(fs.readFileSync(caPath))
      } catch (error) {
        logger.warn('Failed to load trusted CA', { path: caPath, error })
      }
    }

    options.ca = cas
  }

  logger.info('mTLS credentials loaded', {
    clientCertRequired: config.clientCertRequired,
    trustedCAs: config.trustedCAs.length,
  })

  return options
}

/**
 * Check if TLS certificates exist
 */
export function certificatesExist(config: TlsConfig = defaultTlsConfig): boolean {
  try {
    return fs.existsSync(config.certPath) && fs.existsSync(config.keyPath)
  } catch {
    return false
  }
}

/**
 * Get certificate info
 */
export function getCertificateInfo(certPath: string): {
  subject: string
  issuer: string
  validFrom: Date
  validTo: Date
} | null {
  try {
    // This would require additional parsing logic
    // For now, just check if file exists
    if (fs.existsSync(certPath)) {
      return {
        subject: 'Certificate loaded',
        issuer: 'See certificate details',
        validFrom: new Date(),
        validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      }
    }
    return null
  } catch {
    return null
  }
}
