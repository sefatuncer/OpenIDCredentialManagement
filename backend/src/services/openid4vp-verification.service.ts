/**
 * OpenID4VP Verification Engine
 *
 * Handles VP token verification, direct_post processing, and result retrieval.
 * Extracted from openid4vp.service.ts for modularity.
 */

import * as jose from 'jose'
import { logger } from '../utils/logger'
import { resolvePublicKeyFromDid } from './didResolver.service'
import { isCredentialRevoked, getRevocationStatus } from './revocation.service'
import type { IStorageAdapter } from '../core/storage'
import type {
  VerificationSession,
  VerificationResult,
  PresentationSubmission,
} from './openid4vp.service'

/**
 * Handle direct_post submission of VP token
 */
export async function handleDirectPost(
  vpToken: string,
  presentationSubmission: PresentationSubmission,
  state: string,
  deps: {
    getSessionByState: (state: string) => Promise<VerificationSession | undefined>
    getStorage: () => IStorageAdapter<VerificationSession>
  }
): Promise<{
  redirect_uri?: string
  error?: string
  error_description?: string
}> {
  const session = await deps.getSessionByState(state)
  if (!session) {
    return {
      error: 'invalid_request',
      error_description: 'Invalid state parameter',
    }
  }

  if (new Date() > new Date(session.expiresAt)) {
    await deps.getStorage().update(session.id, { status: 'expired' })
    return {
      error: 'expired_request',
      error_description: 'Authorization request has expired',
    }
  }

  if (session.status !== 'pending') {
    return {
      error: 'invalid_request',
      error_description: 'Request already processed',
    }
  }

  try {
    const verificationResult = await verifyVPToken(vpToken, session)

    if (verificationResult.verified) {
      await deps.getStorage().update(session.id, {
        status: 'verified',
        presentation: vpToken,
        verificationResult,
      })
      logger.info('Presentation verified successfully', { sessionId: session.id })
    } else {
      await deps.getStorage().update(session.id, {
        status: 'rejected',
        presentation: vpToken,
        verificationResult,
      })
      logger.warn('Presentation verification failed', {
        sessionId: session.id,
        errors: verificationResult.errors,
      })
    }

    return {}
  } catch (error) {
    logger.error('Error processing presentation', { error })
    await deps.getStorage().update(session.id, {
      status: 'rejected',
      verificationResult: {
        verified: false,
        errors: [(error as Error).message],
      },
    })

    return {
      error: 'invalid_presentation',
      error_description: (error as Error).message,
    }
  }
}

/**
 * Verify VP token using Jose-based verification
 */
async function verifyVPToken(
  vpToken: string,
  session: VerificationSession
): Promise<VerificationResult> {
  try {
    const parts = vpToken.split('.')
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format')
    }

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())

    // Check nonce
    if (payload.nonce !== session.nonce) {
      return {
        verified: false,
        errors: ['Nonce mismatch'],
      }
    }

    // Check expiration
    if (payload.exp && payload.exp < Date.now() / 1000) {
      return {
        verified: false,
        errors: ['Presentation expired'],
      }
    }

    // Verify VP signature using universal DID resolution
    const holderDid = payload.iss
    let vpSignatureVerified = false
    const warnings: string[] = []

    if (holderDid && holderDid.startsWith('did:')) {
      try {
        const publicKey = await resolvePublicKeyFromDid(holderDid)
        if (publicKey) {
          await jose.jwtVerify(vpToken, publicKey)
          vpSignatureVerified = true
          logger.info('VP signature verified successfully', { holderDid })
        } else {
          warnings.push('Could not resolve holder DID public key')
        }
      } catch (sigError) {
        warnings.push('VP signature verification failed: ' + (sigError as Error).message)
      }
    } else {
      warnings.push('Missing or invalid holder DID: ' + holderDid)
    }

    // Extract credential info from VP
    const vp = payload.vp || payload
    const credentials = vp.verifiableCredential || []

    // Verify embedded VC signatures
    let vcSignatureVerified = false
    let credentialSubject: Record<string, unknown> | undefined
    let issuerDid: string | undefined
    let issuanceDate: string | undefined
    let expirationDate: string | undefined

    for (const credential of credentials) {
      if (typeof credential === 'string') {
        try {
          const credParts = credential.split('.')
          if (credParts.length === 3) {
            const credPayload = JSON.parse(Buffer.from(credParts[1], 'base64url').toString())

            if (credPayload.exp && credPayload.exp < Date.now() / 1000) {
              warnings.push('Embedded credential expired')
              continue
            }

            // Verify VC signature
            const vcIssuerDid = credPayload.iss
            if (vcIssuerDid && vcIssuerDid.startsWith('did:')) {
              const vcPublicKey = await resolvePublicKeyFromDid(vcIssuerDid)
              if (vcPublicKey) {
                try {
                  await jose.jwtVerify(credential, vcPublicKey)
                  vcSignatureVerified = true
                  logger.info('VC signature verified successfully', { issuerDid: vcIssuerDid })
                } catch (vcSigError) {
                  warnings.push('VC signature verification failed: ' + (vcSigError as Error).message)
                }
              } else {
                warnings.push('Could not resolve VC issuer public key: ' + vcIssuerDid)
              }
            }

            // Check credential revocation — CRITICAL security check
            const credentialId = credPayload.jti || credPayload.vc?.id
            if (credentialId) {
              try {
                const revoked = await isCredentialRevoked(credentialId)
                if (revoked) {
                  logger.warn('Credential has been revoked', { credentialId })
                  return {
                    verified: false,
                    errors: ['Credential has been revoked'],
                    credentialSubject: credPayload.vc?.credentialSubject,
                    issuerDid: vcIssuerDid,
                    holderDid,
                  }
                }

                const credentialStatus = credPayload.vc?.credentialStatus
                if (credentialStatus && credentialStatus.type === 'StatusList2021Entry') {
                  const statusResult = await getRevocationStatus(
                    credentialStatus.statusListCredential,
                    credentialStatus.statusListIndex
                  )
                  if (statusResult.revoked) {
                    logger.warn('Credential revoked via StatusList2021', {
                      credentialId,
                      statusListIndex: credentialStatus.statusListIndex
                    })
                    return {
                      verified: false,
                      errors: ['Credential has been revoked (StatusList2021)'],
                      credentialSubject: credPayload.vc?.credentialSubject,
                      issuerDid: vcIssuerDid,
                      holderDid,
                    }
                  }
                }

                logger.info('Credential revocation check passed', { credentialId })
              } catch (revocationError) {
                logger.warn('Revocation check failed, continuing with verification', {
                  error: (revocationError as Error).message,
                  credentialId
                })
              }
            }

            // Extract credential data
            credentialSubject = credPayload.vc?.credentialSubject || credPayload.credentialSubject
            issuerDid = vcIssuerDid
            issuanceDate = credPayload.iat ? new Date(credPayload.iat * 1000).toISOString() : undefined
            expirationDate = credPayload.exp ? new Date(credPayload.exp * 1000).toISOString() : undefined
          }
        } catch (parseError) {
          warnings.push('Failed to parse embedded credential: ' + (parseError as Error).message)
        }
      }
    }

    const verified = vpSignatureVerified && vcSignatureVerified

    if (verified) {
      return {
        verified: true,
        credentialSubject,
        issuerDid,
        holderDid,
        issuanceDate,
        expirationDate,
        warnings: warnings.length > 0 ? warnings : undefined,
      }
    } else {
      return {
        verified: false,
        errors: warnings.length > 0 ? warnings : ['Signature verification failed'],
        credentialSubject,
        issuerDid,
        holderDid,
      }
    }
  } catch (error) {
    return {
      verified: false,
      errors: ['Failed to verify presentation: ' + (error as Error).message],
    }
  }
}

/**
 * Get verification result for a session
 */
export async function getVerificationResult(
  sessionId: string,
  getStorage: () => IStorageAdapter<VerificationSession>
): Promise<VerificationResult | null> {
  const session = await getStorage().get(sessionId)
  if (!session) {
    return null
  }

  if (session.status === 'pending') {
    return {
      verified: false,
      errors: ['Presentation not yet submitted'],
    }
  }

  if (session.status === 'expired') {
    return {
      verified: false,
      errors: ['Session expired'],
    }
  }

  return session.verificationResult || null
}
