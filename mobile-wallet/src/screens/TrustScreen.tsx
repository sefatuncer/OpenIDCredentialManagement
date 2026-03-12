/**
 * Trust Screen — Manage trust relationships with other agents
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  RefreshControl, Alert, Modal,
} from 'react-native'

import { colors, spacing, fontSize, borderRadius } from '../theme'
import { getTrustedAgents, establishTrust, revokeTrust, verifyAgent } from '../services/agent.service'
import type { TrustLevel, TrustEstablishmentRequest } from '../types/agent.types'

const TRUST_COLORS: Record<TrustLevel, string> = {
  low: colors.trust.low,
  medium: colors.trust.medium,
  high: colors.trust.high,
  verified: colors.trust.verified,
}

interface TrustedAgent {
  did: string
  name: string
  type: string
  trustLevel: TrustLevel
  establishedAt: string
  lastInteractionAt?: string
}

export default function TrustScreen() {
  const [agents, setAgents] = useState<TrustedAgent[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [targetDid, setTargetDid] = useState('')
  const [trustLevel, setTrustLevel] = useState<TrustLevel>('medium')

  const loadAgents = useCallback(async () => {
    try {
      const data = await getTrustedAgents()
      setAgents(data as TrustedAgent[])
    } catch {
      // Silent
    }
  }, [])

  useEffect(() => {
    loadAgents()
  }, [loadAgents])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadAgents()
    setRefreshing(false)
  }, [loadAgents])

  const handleEstablish = async () => {
    if (!targetDid.trim()) {
      Alert.alert('Error', 'Agent DID is required')
      return
    }

    try {
      const request: TrustEstablishmentRequest = {
        targetAgentDid: targetDid.trim(),
        trustLevel,
        mutualTrust: true,
      }
      await establishTrust(request)
      setShowAdd(false)
      setTargetDid('')
      await loadAgents()
      Alert.alert('Success', 'Trust established')
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to establish trust')
    }
  }

  const handleRevoke = (did: string, name: string) => {
    Alert.alert('Revoke Trust', `Revoke trust for ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: async () => {
          try {
            await revokeTrust(did)
            await loadAgents()
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Failed to revoke')
          }
        },
      },
    ])
  }

  const handleVerify = async (did: string) => {
    try {
      const result = await verifyAgent(did)
      Alert.alert(
        result.valid ? 'Verified' : 'Verification Failed',
        result.valid
          ? `Agent ${result.agent?.name} is valid`
          : `Issues: ${result.errors?.join(', ') || 'Unknown'}`
      )
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Verification failed')
    }
  }

  const renderAgent = ({ item }: { item: TrustedAgent }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.agentName}>{item.name}</Text>
        <View style={[styles.trustBadge, { backgroundColor: TRUST_COLORS[item.trustLevel] }]}>
          <Text style={styles.trustText}>{item.trustLevel}</Text>
        </View>
      </View>
      <Text style={styles.agentDid} numberOfLines={1} ellipsizeMode="middle">
        {item.did}
      </Text>
      <Text style={styles.agentMeta}>
        Type: {item.type} | Since: {new Date(item.establishedAt).toLocaleDateString()}
      </Text>
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.verifyButton}
          onPress={() => handleVerify(item.did)}
        >
          <Text style={styles.verifyText}>Verify</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.revokeButton}
          onPress={() => handleRevoke(item.did, item.name)}
        >
          <Text style={styles.revokeText}>Revoke</Text>
        </TouchableOpacity>
      </View>
    </View>
  )

  return (
    <View style={styles.container}>
      <FlatList
        data={agents}
        keyExtractor={(item) => item.did}
        renderItem={renderAgent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No trusted agents</Text>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={() => setShowAdd(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Establish Trust</Text>

            <Text style={styles.inputLabel}>Agent DID</Text>
            <TextInput
              style={styles.input}
              value={targetDid}
              onChangeText={setTargetDid}
              placeholder="did:key:z..."
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
            />

            <Text style={styles.inputLabel}>Trust Level</Text>
            <View style={styles.levelRow}>
              {(['low', 'medium', 'high'] as TrustLevel[]).map((level) => (
                <TouchableOpacity
                  key={level}
                  style={[
                    styles.levelChip,
                    { borderColor: TRUST_COLORS[level] },
                    trustLevel === level && { backgroundColor: TRUST_COLORS[level] },
                  ]}
                  onPress={() => setTrustLevel(level)}
                >
                  <Text style={[
                    styles.levelText,
                    trustLevel === level && styles.levelTextActive,
                  ]}>
                    {level}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.submitButton} onPress={handleEstablish}>
              <Text style={styles.submitText}>Establish Trust</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setShowAdd(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.md, paddingBottom: 100 },
  card: {
    backgroundColor: colors.card, borderRadius: borderRadius.lg,
    padding: spacing.lg, marginBottom: spacing.md,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  agentName: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text },
  trustBadge: {
    paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm,
  },
  trustText: { fontSize: fontSize.xs, color: colors.white, fontWeight: '600' },
  agentDid: { fontSize: fontSize.sm, color: colors.primaryLight, marginTop: spacing.xs, fontFamily: 'monospace' },
  agentMeta: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.xs },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  verifyButton: {
    flex: 1, padding: spacing.sm, borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: colors.primary, alignItems: 'center',
  },
  verifyText: { fontSize: fontSize.md, color: colors.primary, fontWeight: '600' },
  revokeButton: {
    flex: 1, padding: spacing.sm, borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: colors.error, alignItems: 'center',
  },
  revokeText: { fontSize: fontSize.md, color: colors.error, fontWeight: '600' },
  emptyText: { fontSize: fontSize.lg, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xxl },
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4,
  },
  fabText: { fontSize: 28, color: colors.white, lineHeight: 30 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: {
    backgroundColor: colors.surface, borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl, padding: spacing.lg, paddingBottom: spacing.xxl,
  },
  modalTitle: { fontSize: fontSize.xl, fontWeight: 'bold', color: colors.white, marginBottom: spacing.lg },
  inputLabel: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.card, borderRadius: borderRadius.md,
    padding: spacing.md, color: colors.text, fontSize: fontSize.md,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md,
  },
  levelRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  levelChip: {
    flex: 1, padding: spacing.sm, borderRadius: borderRadius.md,
    borderWidth: 2, alignItems: 'center',
  },
  levelText: { fontSize: fontSize.md, color: colors.textSecondary, fontWeight: '600' },
  levelTextActive: { color: colors.white },
  submitButton: {
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
    padding: spacing.md, alignItems: 'center',
  },
  submitText: { fontSize: fontSize.lg, fontWeight: '600', color: colors.white },
  cancelButton: { padding: spacing.md, alignItems: 'center', marginTop: spacing.xs },
  cancelText: { fontSize: fontSize.md, color: colors.textSecondary },
})
