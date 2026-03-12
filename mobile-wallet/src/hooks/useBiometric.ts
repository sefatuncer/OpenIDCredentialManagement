/**
 * Biometric authentication hook
 */

import { useState, useEffect, useCallback } from 'react'
import {
  isBiometricAvailable,
  getBiometricType,
  authenticate,
  isBiometricEnabled,
  setBiometricEnabled,
} from '../services/auth.service'

export function useBiometric() {
  const [available, setAvailable] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [biometricType, setBiometricType] = useState('Biometric')
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    async function check() {
      const avail = await isBiometricAvailable()
      setAvailable(avail)
      if (avail) {
        const type = await getBiometricType()
        setBiometricType(type)
        const en = await isBiometricEnabled()
        setEnabled(en)
        // If biometric not enabled, auto-authenticate
        if (!en) {
          setAuthenticated(true)
        }
      } else {
        // No biometric hardware — skip gate
        setAuthenticated(true)
      }
    }
    check()
  }, [])

  const requestAuth = useCallback(async (prompt?: string) => {
    const success = await authenticate(prompt)
    setAuthenticated(success)
    return success
  }, [])

  const toggleBiometric = useCallback(
    async (value: boolean) => {
      if (value) {
        const success = await authenticate('Enable biometric protection')
        if (success) {
          await setBiometricEnabled(true)
          setEnabled(true)
        }
        return success
      }
      await setBiometricEnabled(false)
      setEnabled(false)
      return true
    },
    []
  )

  return { available, enabled, biometricType, authenticated, requestAuth, toggleBiometric }
}
