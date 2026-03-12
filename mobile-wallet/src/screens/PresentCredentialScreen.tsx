/**
 * Present Credential Screen — VP flow
 * Fetches authorization request, matches credentials, handles disclosure selection,
 * signs VP token, and submits via direct_post.
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, ActivityIndicator, Alert,
} from 'react-native'
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native'

import { colors, spacing, fontSize, borderRadius } from '../theme'
import { RootStackParamList } from '../navigation/linking'
import { secureGetJSON } from '../services/secure-storage.service'
import {
  parseVerificationUri, fetchAuthorizationRequest, matchCredentials,
  createVpToken, buildPresentationSubmission, submitPresentation,
  AuthorizationRequest, WalletCredential,
} from '../services/vp.service'
import { getSelectableDisclosures, buildSDJWTPresentation } from '../services/sdjwt-presentation.service'
import type { SelectableDisclosure } from '../services/sdjwt-presentation.service'

type Route = RouteProp<RootStackParamList, 'PresentCredential'>

type FlowState = 'loading' | 'review' | 'submitting' | 'success' | 'error'

export default function PresentCredentialScreen() {
  const route = useRoute<Route>()
  const navigation = useNavigation()
  const { uri } = route.params

  const [state, setState] = useState<FlowState>('loading')
  const [authRequest, setAuthRequest] = useState<AuthorizationRequest | null>(null)
  const [matches, setMatches] = useState<{ descriptorId: string; credential: WalletCredential }[]>([])
  const [disclosures, setDisclosures] = useState<SelectableDisclosure[]>([])
  const [errorMsg, setErrorMsg] = useState('')

  const loadRequest = useCallback(async () => {
    try {
      const parsed = parseVerificationUri(uri)
      if (!parsed.valid) {
        setErrorMsg('Invalid verification URI')
        setState('error')
        return
      }

      let request: AuthorizationRequest
      if (parsed.inlineParams) {
        request = { ...parsed.inlineParams, clientId: parsed.clientId! }
      } else if (parsed.requestUri) {
        request = await fetchAuthorizationRequest(parsed.requestUri, parsed.clientId!)
      } else {
        setErrorMsg('No presentation definition found')
        setState('error')
        return
      }

      setAuthRequest(request)

      // Load credentials from secure storage
      const stored = await secureGetJSON<WalletCredential[]>('stored_credentials') || []
      const matched = matchCredentials(request.presentationDefinition, stored)

      if (matched.length === 0) {
        setErrorMsg('No matching credentials found in your wallet')
        setState('error')
        return
      }

      setMatches(matched)

      // Load SD-JWT disclosures for first matched credential
      const firstMatch = matched[0]
      if (firstMatch.credential.isSDJWT && firstMatch.credential.combined) {
        const selectable = getSelectableDisclosures(firstMatch.credential.combined)
        setDisclosures(selectable)
      }

      setState('review')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to process request')
      setState('error')
    }
  }, [uri])

  useEffect(() => {
    loadRequest()
  }, [loadRequest])

  const toggleDisclosure = (index: number) => {
    setDisclosures((prev) =>
      prev.map((d, i) => (i === index ? { ...d, selected: !d.selected } : d))
    )
  }

  const handleSubmit = async () => {
    if (!authRequest || matches.length === 0) return

    setState('submitting')
    try {
      // Build credential JWTs (with SD-JWT disclosure filtering)
      const credentialJwts = matches.map((m) => {
        if (m.credential.isSDJWT && m.credential.combined) {
          const selected = disclosures.filter((d) => d.selected).map((d) => d.claimName)
          return buildSDJWTPresentation(m.credential.combined!, selected)
        }
        return m.credential.jwt
      })

      // Create VP token
      const vpToken = await createVpToken(
        credentialJwts,
        authRequest.nonce,
        authRequest.clientId
      )

      // Build submission
      const submission = buildPresentationSubmission(
        authRequest.presentationDefinition.id,
        matches
      )

      // Submit
      const result = await submitPresentation(
        authRequest.responseUri,
        vpToken,
        submission,
        authRequest.state
      )

      if (result.success) {
        setState('success')
      } else {
        setErrorMsg(result.error || 'Presentation submission failed')
        setState('error')
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to submit presentation')
      setState('error')
    }
  }

  if (state === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Processing verification request...</Text>
      </View>
    )
  }

  if (state === 'submitting') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Signing and submitting presentation...</Text>
      </View>
    )
  }

  if (state === 'success') {
    return (
      <View style={styles.centered}>
        <Text style={styles.successIcon}>{'\u2714'}</Text>
        <Text style={styles.successText}>Presentation Submitted</Text>
        <Text style={styles.successHint}>Your credentials were successfully verified</Text>
        <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()}>
          <Text style={styles.buttonText}>Done</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (state === 'error') {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorIcon}>{'\u2718'}</Text>
        <Text style={styles.errorText}>{errorMsg}</Text>
        <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()}>
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // Review state
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Review Presentation</Text>

      {authRequest && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Verifier</Text>
          <Text style={styles.cardValue}>{authRequest.clientId}</Text>
          {authRequest.presentationDefinition.purpose && (
            <>
              <Text style={[styles.cardLabel, { marginTop: spacing.sm }]}>Purpose</Text>
              <Text style={styles.cardValue}>
                {authRequest.presentationDefinition.purpose}
              </Text>
            </>
          )}
        </View>
      )}

      <Text style={styles.sectionTitle}>
        Matching Credentials ({matches.length})
      </Text>
      {matches.map((m, i) => (
        <View key={i} style={styles.card}>
          <Text style={styles.credType}>{m.credential.type}</Text>
          <Text style={styles.credId}>ID: {m.credential.id}</Text>
        </View>
      ))}

      {disclosures.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Select Claims to Disclose</Text>
          {disclosures.map((d, i) => (
            <View key={i} style={styles.disclosureRow}>
              <View style={styles.disclosureInfo}>
                <Text style={styles.disclosureName}>{d.claimName}</Text>
                <Text style={styles.disclosureValue}>
                  {typeof d.claimValue === 'string' ? d.claimValue : JSON.stringify(d.claimValue)}
                </Text>
              </View>
              <Switch
                value={d.selected}
                onValueChange={() => toggleDisclosure(i)}
                trackColor={{ false: colors.border, true: colors.primaryLight }}
                thumbColor={d.selected ? colors.primary : colors.textMuted}
              />
            </View>
          ))}
        </>
      )}

      <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
        <Text style={styles.submitText}>Present Credentials</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.md },
  centered: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.background, padding: spacing.lg,
  },
  loadingText: { fontSize: fontSize.lg, color: colors.textSecondary, marginTop: spacing.md },
  successIcon: { fontSize: 60, color: colors.success },
  successText: { fontSize: fontSize.xxl, fontWeight: 'bold', color: colors.success, marginTop: spacing.md },
  successHint: { fontSize: fontSize.md, color: colors.textSecondary, marginTop: spacing.sm },
  errorIcon: { fontSize: 60, color: colors.error },
  errorText: { fontSize: fontSize.lg, color: colors.error, textAlign: 'center', marginTop: spacing.md },
  title: { fontSize: fontSize.xxl, fontWeight: 'bold', color: colors.white, marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.card, borderRadius: borderRadius.lg,
    padding: spacing.lg, marginBottom: spacing.md,
  },
  cardLabel: { fontSize: fontSize.sm, color: colors.textSecondary },
  cardValue: { fontSize: fontSize.md, color: colors.text, marginTop: 2 },
  sectionTitle: {
    fontSize: fontSize.lg, fontWeight: '600', color: colors.text,
    marginTop: spacing.md, marginBottom: spacing.sm,
  },
  credType: { fontSize: fontSize.lg, fontWeight: '600', color: colors.primary },
  credId: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.xs },
  disclosureRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.card, borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  disclosureInfo: { flex: 1, marginRight: spacing.md },
  disclosureName: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  disclosureValue: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  button: {
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
    padding: spacing.md, alignItems: 'center', marginTop: spacing.lg,
  },
  buttonText: { fontSize: fontSize.lg, fontWeight: '600', color: colors.white },
  submitButton: {
    backgroundColor: colors.success, borderRadius: borderRadius.md,
    padding: spacing.lg, alignItems: 'center', marginTop: spacing.lg,
  },
  submitText: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.white },
  cancelButton: {
    borderRadius: borderRadius.md, padding: spacing.md,
    alignItems: 'center', marginTop: spacing.sm, marginBottom: spacing.xxl,
  },
  cancelText: { fontSize: fontSize.lg, color: colors.textSecondary },
})
