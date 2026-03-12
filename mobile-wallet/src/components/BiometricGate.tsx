/**
 * Biometric Gate — Wraps app content with biometric authentication
 */

import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { colors, spacing, fontSize, borderRadius } from '../theme'
import { useBiometric } from '../hooks/useBiometric'

interface Props {
  children: React.ReactNode
}

export default function BiometricGate({ children }: Props) {
  const { authenticated, biometricType, requestAuth } = useBiometric()

  if (!authenticated) {
    return (
      <View style={styles.container}>
        <Text style={styles.lockIcon}>{'\u{1F512}'}</Text>
        <Text style={styles.title}>Wallet Locked</Text>
        <Text style={styles.subtitle}>
          Authenticate with {biometricType} to access your wallet
        </Text>
        <TouchableOpacity style={styles.button} onPress={() => requestAuth()}>
          <Text style={styles.buttonText}>Unlock</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return <>{children}</>
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: colors.background,
    alignItems: 'center', justifyContent: 'center', padding: spacing.xl,
  },
  lockIcon: { fontSize: 60, marginBottom: spacing.lg },
  title: { fontSize: fontSize.xxl, fontWeight: 'bold', color: colors.white },
  subtitle: {
    fontSize: fontSize.md, color: colors.textSecondary,
    textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.xl,
  },
  button: {
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
  },
  buttonText: { fontSize: fontSize.lg, fontWeight: '600', color: colors.white },
})
