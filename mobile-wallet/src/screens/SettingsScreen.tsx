/**
 * Settings Screen — App configuration, biometric toggle, wallet management
 */

import React, { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, TextInput,
} from 'react-native'
import Constants from 'expo-constants'

import { colors, spacing, fontSize, borderRadius } from '../theme'
import { useBiometric } from '../hooks/useBiometric'
import { clearAllSecureData } from '../services/secure-storage.service'
import { clearWalletKey } from '../services/wallet-key.service'
import { apiService } from '../services/api.service'
import { registerForPushNotifications } from '../services/notification.service'

export default function SettingsScreen() {
  const { available, enabled, biometricType, toggleBiometric } = useBiometric()
  const [pushEnabled, setPushEnabled] = useState(false)
  const [backendUrl, setBackendUrl] = useState(
    Constants.expoConfig?.extra?.apiUrl || 'http://localhost:3000'
  )

  const handleBiometricToggle = async (value: boolean) => {
    const success = await toggleBiometric(value)
    if (!success) {
      Alert.alert('Authentication Failed', 'Biometric authentication is required to enable this setting.')
    }
  }

  const handlePushToggle = async (value: boolean) => {
    if (value) {
      const token = await registerForPushNotifications()
      if (token) {
        setPushEnabled(true)
      } else {
        Alert.alert('Permission Denied', 'Push notification permission was not granted.')
      }
    } else {
      setPushEnabled(false)
    }
  }

  const handleClearWallet = () => {
    Alert.alert(
      'Clear Wallet',
      'This will delete all stored credentials, keys, and settings. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearWalletKey()
            await clearAllSecureData()
            await apiService.clearAuth()
            Alert.alert('Done', 'Wallet data has been cleared.')
          },
        },
      ]
    )
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Settings</Text>

      {/* Security Section */}
      <Text style={styles.sectionTitle}>Security</Text>
      <View style={styles.card}>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>{biometricType} Lock</Text>
            <Text style={styles.settingHint}>
              {available
                ? 'Require biometric authentication to open the app'
                : 'Not available on this device'}
            </Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={handleBiometricToggle}
            disabled={!available}
            trackColor={{ false: colors.border, true: colors.primaryLight }}
            thumbColor={enabled ? colors.primary : colors.textMuted}
          />
        </View>
      </View>

      {/* Notifications Section */}
      <Text style={styles.sectionTitle}>Notifications</Text>
      <View style={styles.card}>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Push Notifications</Text>
            <Text style={styles.settingHint}>
              Receive alerts for credential revocations and updates
            </Text>
          </View>
          <Switch
            value={pushEnabled}
            onValueChange={handlePushToggle}
            trackColor={{ false: colors.border, true: colors.primaryLight }}
            thumbColor={pushEnabled ? colors.primary : colors.textMuted}
          />
        </View>
      </View>

      {/* Connection Section */}
      <Text style={styles.sectionTitle}>Connection</Text>
      <View style={styles.card}>
        <Text style={styles.settingLabel}>Backend URL</Text>
        <TextInput
          style={styles.input}
          value={backendUrl}
          onChangeText={setBackendUrl}
          placeholder="http://localhost:3000"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          keyboardType="url"
        />
      </View>

      {/* Danger Zone */}
      <Text style={styles.sectionTitle}>Danger Zone</Text>
      <View style={styles.card}>
        <TouchableOpacity style={styles.dangerButton} onPress={handleClearWallet}>
          <Text style={styles.dangerText}>Clear All Wallet Data</Text>
        </TouchableOpacity>
        <Text style={styles.dangerHint}>
          Removes all credentials, keys, and settings from this device.
        </Text>
      </View>

      {/* App Info */}
      <View style={styles.infoSection}>
        <Text style={styles.infoText}>SSI Mobile Wallet v1.0.0</Text>
        <Text style={styles.infoText}>OpenID4VCI/VP | DID:key | SD-JWT VC</Text>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.md },
  title: {
    fontSize: fontSize.title, fontWeight: 'bold', color: colors.white,
    marginTop: spacing.xxl, marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.lg, fontWeight: '600', color: colors.textSecondary,
    marginTop: spacing.md, marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.card, borderRadius: borderRadius.lg,
    padding: spacing.lg, marginBottom: spacing.sm,
  },
  settingRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  settingInfo: { flex: 1, marginRight: spacing.md },
  settingLabel: { fontSize: fontSize.lg, color: colors.text, fontWeight: '500' },
  settingHint: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  input: {
    backgroundColor: colors.surfaceLight, borderRadius: borderRadius.md,
    padding: spacing.md, color: colors.text, fontSize: fontSize.md,
    borderWidth: 1, borderColor: colors.border, marginTop: spacing.sm,
  },
  dangerButton: {
    padding: spacing.md, borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: colors.error, alignItems: 'center',
  },
  dangerText: { fontSize: fontSize.lg, color: colors.error, fontWeight: '600' },
  dangerHint: {
    fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.sm, textAlign: 'center',
  },
  infoSection: { alignItems: 'center', paddingVertical: spacing.xxl },
  infoText: { fontSize: fontSize.sm, color: colors.textMuted },
})
