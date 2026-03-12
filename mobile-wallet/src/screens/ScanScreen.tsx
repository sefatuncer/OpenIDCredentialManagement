/**
 * Scan Screen — QR code scanner for VP requests and credential offers
 */

import React, { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Alert,
} from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'

import { colors, spacing, fontSize, borderRadius } from '../theme'
import { RootStackParamList } from '../navigation/linking'
import { parseVerificationUri } from '../services/vp.service'

type Nav = NativeStackNavigationProp<RootStackParamList>

export default function ScanScreen() {
  const navigation = useNavigation<Nav>()
  const [permission, requestPermission] = useCameraPermissions()
  const [scanned, setScanned] = useState(false)
  const [manualUri, setManualUri] = useState('')
  const [showManual, setShowManual] = useState(false)

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (scanned) return
    setScanned(true)
    processUri(data)
  }

  const processUri = (uri: string) => {
    if (uri.startsWith('openid4vp://')) {
      const parsed = parseVerificationUri(uri)
      if (parsed.valid) {
        navigation.navigate('PresentCredential', { uri })
        return
      }
      Alert.alert('Invalid QR', 'This QR code contains an invalid verification request.')
    } else if (uri.startsWith('openid-credential-offer://')) {
      // TODO: Implement credential accept flow
      Alert.alert('Credential Offer', 'Credential offer scanning will be available soon.')
    } else {
      Alert.alert('Unknown QR', 'This QR code is not a supported SSI URI.')
    }
    setScanned(false)
  }

  const handleManualSubmit = () => {
    const trimmed = manualUri.trim()
    if (!trimmed) return
    processUri(trimmed)
    setManualUri('')
  }

  if (!permission) {
    return (
      <View style={styles.centered}>
        <Text style={styles.text}>Requesting camera permission...</Text>
      </View>
    )
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.text}>Camera access is required to scan QR codes</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={() => setShowManual(true)}
        >
          <Text style={styles.buttonText}>Enter URI Manually</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {!showManual ? (
        <>
          <CameraView
            style={styles.camera}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          >
            <View style={styles.overlay}>
              <View style={styles.scanFrame} />
              <Text style={styles.scanText}>
                Scan a QR code to present credentials or accept an offer
              </Text>
            </View>
          </CameraView>

          <View style={styles.bottomBar}>
            {scanned && (
              <TouchableOpacity
                style={styles.button}
                onPress={() => setScanned(false)}
              >
                <Text style={styles.buttonText}>Scan Again</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.button, styles.secondaryButton]}
              onPress={() => setShowManual(true)}
            >
              <Text style={styles.buttonText}>Enter URI Manually</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <View style={styles.manualContainer}>
          <Text style={styles.manualTitle}>Enter URI</Text>
          <TextInput
            style={styles.input}
            placeholder="openid4vp://..."
            placeholderTextColor={colors.textMuted}
            value={manualUri}
            onChangeText={setManualUri}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
          />
          <TouchableOpacity style={styles.button} onPress={handleManualSubmit}>
            <Text style={styles.buttonText}>Submit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={() => setShowManual(false)}
          >
            <Text style={styles.buttonText}>Back to Scanner</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.background, padding: spacing.lg,
  },
  text: { fontSize: fontSize.lg, color: colors.text, textAlign: 'center', marginBottom: spacing.lg },
  camera: { flex: 1 },
  overlay: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  scanFrame: {
    width: 250, height: 250, borderWidth: 2, borderColor: colors.primary,
    borderRadius: borderRadius.lg,
  },
  scanText: {
    fontSize: fontSize.md, color: colors.white, textAlign: 'center',
    marginTop: spacing.lg, paddingHorizontal: spacing.xl,
  },
  bottomBar: {
    padding: spacing.lg, backgroundColor: colors.surface, gap: spacing.sm,
  },
  button: {
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
    padding: spacing.md, alignItems: 'center',
  },
  secondaryButton: { backgroundColor: colors.surfaceLight },
  buttonText: { fontSize: fontSize.lg, fontWeight: '600', color: colors.white },
  manualContainer: {
    flex: 1, padding: spacing.lg, paddingTop: spacing.xxl, gap: spacing.md,
  },
  manualTitle: { fontSize: fontSize.xl, fontWeight: '600', color: colors.text },
  input: {
    backgroundColor: colors.card, borderRadius: borderRadius.md,
    padding: spacing.md, color: colors.text, fontSize: fontSize.md,
    minHeight: 100, textAlignVertical: 'top',
    borderWidth: 1, borderColor: colors.border,
  },
})
