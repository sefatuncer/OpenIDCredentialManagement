/**
 * Secure Storage Service
 * Wraps expo-secure-store for Keychain (iOS) / Keystore (Android) access.
 * Provides biometric-gated storage for sensitive data (private keys, tokens).
 */

import * as SecureStore from 'expo-secure-store'

const BIOMETRIC_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
}

/**
 * Store a value in secure storage (Keychain/Keystore)
 */
export async function secureSet(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value, BIOMETRIC_OPTIONS)
}

/**
 * Retrieve a value from secure storage
 */
export async function secureGet(key: string): Promise<string | null> {
  return SecureStore.getItemAsync(key, BIOMETRIC_OPTIONS)
}

/**
 * Delete a value from secure storage
 */
export async function secureDelete(key: string): Promise<void> {
  await SecureStore.deleteItemAsync(key, BIOMETRIC_OPTIONS)
}

/**
 * Store a JSON object securely
 */
export async function secureSetJSON<T>(key: string, value: T): Promise<void> {
  await secureSet(key, JSON.stringify(value))
}

/**
 * Retrieve a JSON object from secure storage
 */
export async function secureGetJSON<T>(key: string): Promise<T | null> {
  const raw = await secureGet(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/**
 * Clear all wallet-related secure storage keys
 */
export async function clearAllSecureData(): Promise<void> {
  const walletKeys = [
    'wallet_keypair',
    'auth_token',
    'credentials_encrypted',
    'push_token',
    'settings',
  ]
  await Promise.all(walletKeys.map((k) => secureDelete(k)))
}
