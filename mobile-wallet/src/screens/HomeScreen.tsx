/**
 * Home Screen — Dashboard with agent identity summary and quick actions
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'

import { colors, spacing, fontSize, borderRadius } from '../theme'
import { RootStackParamList } from '../navigation/linking'
import { getWalletDid } from '../services/wallet-key.service'
import { getAgentIdentity } from '../services/agent.service'
import type { AgentIdentity } from '../types/agent.types'
import { useWebSocket } from '../hooks/useWebSocket'

type Nav = NativeStackNavigationProp<RootStackParamList>

export default function HomeScreen() {
  const navigation = useNavigation<Nav>()
  const [did, setDid] = useState<string>('')
  const [agent, setAgent] = useState<AgentIdentity | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const { connected } = useWebSocket()

  const loadData = useCallback(async () => {
    try {
      const walletDid = await getWalletDid()
      setDid(walletDid)
      const identity = await getAgentIdentity(walletDid)
      setAgent(identity)
    } catch {
      // Wallet key will be created on first access
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }, [loadData])

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>SSI Mobile Wallet</Text>
        <View style={[styles.statusDot, connected && styles.statusConnected]} />
      </View>

      {/* DID Card */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Your DID</Text>
        <Text style={styles.didText} numberOfLines={2} ellipsizeMode="middle">
          {did || 'Generating...'}
        </Text>
        {agent && (
          <View style={styles.agentInfo}>
            <Text style={styles.agentName}>{agent.name}</Text>
            <View style={[styles.badge, agent.status === 'active' ? styles.badge_active : agent.status === 'suspended' ? styles.badge_suspended : styles.badge_revoked]}>
              <Text style={styles.badgeText}>{agent.status}</Text>
            </View>
          </View>
        )}
      </View>

      {/* Quick Actions */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionCard, { backgroundColor: colors.credential.identity }]}
          onPress={() => navigation.navigate('MainTabs' as never)}
        >
          <Text style={styles.actionIcon}>{'\u2b1a'}</Text>
          <Text style={styles.actionLabel}>Credentials</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionCard, { backgroundColor: colors.credential.delegation }]}
          onPress={() => navigation.navigate('MainTabs' as never)}
        >
          <Text style={styles.actionIcon}>{'\u2194'}</Text>
          <Text style={styles.actionLabel}>Delegations</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionCard, { backgroundColor: colors.credential.capability }]}
          onPress={() => navigation.navigate('AgentDetail', { did: did })}
        >
          <Text style={styles.actionIcon}>{'\u2726'}</Text>
          <Text style={styles.actionLabel}>Agent Profile</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionCard, { backgroundColor: colors.credential.sdjwt }]}
          onPress={() => navigation.navigate('TrustManagement')}
        >
          <Text style={styles.actionIcon}>{'\u2714'}</Text>
          <Text style={styles.actionLabel}>Trust</Text>
        </TouchableOpacity>
      </View>

      {/* Info */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Supported Credentials</Text>
        <Text style={styles.infoText}>AI Agent Identity (SD-JWT VC)</Text>
        <Text style={styles.infoText}>Delegation Grant (SD-JWT VC)</Text>
        <Text style={styles.infoText}>Capability Credential (SD-JWT VC)</Text>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.md },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.xxl, marginBottom: spacing.lg,
  },
  title: { fontSize: fontSize.title, fontWeight: 'bold', color: colors.white },
  statusDot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: colors.error,
  },
  statusConnected: { backgroundColor: colors.success },
  card: {
    backgroundColor: colors.card, borderRadius: borderRadius.lg,
    padding: spacing.lg, marginBottom: spacing.lg,
  },
  cardLabel: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.xs },
  didText: { fontSize: fontSize.md, color: colors.primary, fontFamily: 'monospace' },
  agentInfo: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  agentName: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text },
  badge: {
    paddingHorizontal: spacing.sm, paddingVertical: 2,
    borderRadius: borderRadius.sm, backgroundColor: colors.textMuted,
  },
  badge_active: { backgroundColor: colors.success },
  badge_suspended: { backgroundColor: colors.warning },
  badge_revoked: { backgroundColor: colors.error },
  badgeText: { fontSize: fontSize.xs, color: colors.white, fontWeight: '600' },
  sectionTitle: {
    fontSize: fontSize.xl, fontWeight: '600', color: colors.text,
    marginBottom: spacing.md,
  },
  actionsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  actionCard: {
    flex: 1, borderRadius: borderRadius.lg, padding: spacing.lg,
    alignItems: 'center', justifyContent: 'center', minHeight: 100,
  },
  actionIcon: { fontSize: 28, color: colors.white, marginBottom: spacing.sm },
  actionLabel: { fontSize: fontSize.md, fontWeight: '600', color: colors.white },
  infoCard: {
    backgroundColor: colors.surfaceLight, borderRadius: borderRadius.lg,
    padding: spacing.lg, marginBottom: spacing.xxl,
  },
  infoTitle: {
    fontSize: fontSize.lg, fontWeight: '600', color: colors.text, marginBottom: spacing.sm,
  },
  infoText: { fontSize: fontSize.md, color: colors.textSecondary, marginBottom: spacing.xs },
})
