/**
 * Credentials Screen — List stored credentials with type-based cards
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, Alert,
} from 'react-native'

import { colors, spacing, fontSize, borderRadius } from '../theme'
import { secureGetJSON, secureSetJSON } from '../services/secure-storage.service'
import { apiService } from '../services/api.service'
import { isSDJWT, sdJWTToCredentialData } from '../services/sdjwt.service'
import AgentIdentityCard from '../components/AgentIdentityCard'
import DelegationCard from '../components/DelegationCard'
import CapabilityCard from '../components/CapabilityCard'
import SDJWTCredentialCard from '../components/SDJWTCredentialCard'

const CREDENTIALS_KEY = 'stored_credentials'

interface StoredCredential {
  id: string
  jwt: string
  combined?: string
  isSDJWT?: boolean
  type: string
  issuer: string
  issuedAt: string
  subject: Record<string, unknown>
}

export default function CredentialsScreen() {
  const [credentials, setCredentials] = useState<StoredCredential[]>([])
  const [refreshing, setRefreshing] = useState(false)

  const loadCredentials = useCallback(async () => {
    try {
      // Load from secure storage
      const stored = await secureGetJSON<StoredCredential[]>(CREDENTIALS_KEY)
      if (stored) {
        setCredentials(stored)
        return
      }

      // Fetch from backend
      const data = await apiService.get<{ credentials: Array<Record<string, unknown>> }>(
        '/holder/credentials'
      )
      const creds: StoredCredential[] = (data.credentials || []).map((c: Record<string, unknown>) => ({
        id: (c.id as string) || String(Date.now()),
        jwt: (c.jwt as string) || '',
        combined: c.combined as string | undefined,
        isSDJWT: (c.isSDJWT as boolean) || false,
        type: (c.type as string) || 'VerifiableCredential',
        issuer: (c.issuer as string) || 'Unknown',
        issuedAt: (c.issuedAt as string) || new Date().toISOString(),
        subject: (c.credentialSubject as Record<string, unknown>) || {},
      }))

      setCredentials(creds)
      await secureSetJSON(CREDENTIALS_KEY, creds)
    } catch {
      // Silent fail — empty list
    }
  }, [])

  useEffect(() => {
    loadCredentials()
  }, [loadCredentials])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    // Force refetch from backend
    try {
      const data = await apiService.get<{ credentials: Array<Record<string, unknown>> }>(
        '/holder/credentials'
      )
      const creds: StoredCredential[] = (data.credentials || []).map((c: Record<string, unknown>) => ({
        id: (c.id as string) || String(Date.now()),
        jwt: (c.jwt as string) || '',
        combined: c.combined as string | undefined,
        isSDJWT: (c.isSDJWT as boolean) || false,
        type: (c.type as string) || 'VerifiableCredential',
        issuer: (c.issuer as string) || 'Unknown',
        issuedAt: (c.issuedAt as string) || new Date().toISOString(),
        subject: (c.credentialSubject as Record<string, unknown>) || {},
      }))
      setCredentials(creds)
      await secureSetJSON(CREDENTIALS_KEY, creds)
    } catch {
      Alert.alert('Error', 'Failed to refresh credentials')
    }
    setRefreshing(false)
  }, [])

  const renderCredential = ({ item }: { item: StoredCredential }) => {
    // SD-JWT credential
    if (item.isSDJWT && item.combined) {
      const sdData = sdJWTToCredentialData(item.id, item.combined)
      if (sdData) {
        // Type-based routing
        if (sdData.type.includes('AgentIdentity')) {
          return <AgentIdentityCard credential={item} />
        }
        if (sdData.type.includes('Delegation')) {
          return <DelegationCard credential={item} />
        }
        if (sdData.type.includes('Capability')) {
          return <CapabilityCard credential={item} />
        }
        return <SDJWTCredentialCard credential={item} sdData={sdData} />
      }
    }

    // Plain JWT credential — type-based routing
    if (item.type.includes('AgentIdentity')) {
      return <AgentIdentityCard credential={item} />
    }
    if (item.type.includes('Delegation')) {
      return <DelegationCard credential={item} />
    }
    if (item.type.includes('Capability')) {
      return <CapabilityCard credential={item} />
    }

    // Generic credential card
    return (
      <View style={styles.card}>
        <Text style={styles.cardType}>{item.type}</Text>
        <Text style={styles.cardIssuer}>Issuer: {item.issuer}</Text>
        <Text style={styles.cardDate}>
          Issued: {new Date(item.issuedAt).toLocaleDateString()}
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Credentials</Text>
      <Text style={styles.subtitle}>{credentials.length} credential(s) stored</Text>

      <FlatList
        data={credentials}
        keyExtractor={(item) => item.id}
        renderItem={renderCredential}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No credentials yet</Text>
            <Text style={styles.emptyHint}>
              Scan a QR code to receive credentials
            </Text>
          </View>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.md },
  title: {
    fontSize: fontSize.title, fontWeight: 'bold', color: colors.white,
    marginTop: spacing.xxl,
  },
  subtitle: { fontSize: fontSize.md, color: colors.textSecondary, marginBottom: spacing.md },
  list: { paddingBottom: spacing.xxl },
  card: {
    backgroundColor: colors.card, borderRadius: borderRadius.lg,
    padding: spacing.lg, marginBottom: spacing.md,
  },
  cardType: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text },
  cardIssuer: { fontSize: fontSize.md, color: colors.textSecondary, marginTop: spacing.xs },
  cardDate: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.xs },
  emptyContainer: { alignItems: 'center', paddingTop: spacing.xxl },
  emptyText: { fontSize: fontSize.xl, color: colors.textSecondary },
  emptyHint: { fontSize: fontSize.md, color: colors.textMuted, marginTop: spacing.sm },
})
