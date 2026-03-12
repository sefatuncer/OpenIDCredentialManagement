/**
 * Auth Service — Biometric authentication
 * Wraps expo-local-authentication for FaceID/TouchID/Fingerprint.
 */

import * as LocalAuthentication from 'expo-local-authentication'
import { secureGet, secureSet } from './secure-storage.service'

const BIOMETRIC_ENABLED_KEY = 'biometric_enabled'

export async function isBiometricAvailable(): Promise<boolean> {
  const compatible = await LocalAuthentication.hasHardwareAsync()
  if (!compatible) return false
  const enrolled = await LocalAuthentication.isEnrolledAsync()
  return enrolled
}

export async function getBiometricType(): Promise<string> {
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync()
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return 'Face ID'
  }
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return 'Fingerprint'
  }
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
    return 'Iris'
  }
  return 'Biometric'
}

export async function authenticate(promptMessage?: string): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: promptMessage || 'Authenticate to access your wallet',
    cancelLabel: 'Cancel',
    disableDeviceFallback: false,
    fallbackLabel: 'Use passcode',
  })

  return result.success
}

export async function isBiometricEnabled(): Promise<boolean> {
  const stored = await secureGet(BIOMETRIC_ENABLED_KEY)
  return stored === 'true'
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await secureSet(BIOMETRIC_ENABLED_KEY, enabled ? 'true' : 'false')
}
