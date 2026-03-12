/**
 * Agent Screen — Agent identity registration and profile
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  Alert, RefreshControl,
} from 'react-native'
import * as Clipboard from 'expo-clipboard'

import { colors, spacing, fontSize, borderRadius } from '../theme'
import { getWalletDid } from '../services/wallet-key.service'
import {
  registerAgent, getAgentIdentity, getAgentActivity,
} from '../services/agent.service'
import type { AgentIdentity, AgentType, AgentActivity } from '../types/agent.types'

const AGENT_TYPES: AgentType[] = ['autonomous', 'semi-autonomous', 'assistant', 'service', 'orchestrator']

export default function AgentScreen() {
  const [did, setDid] = useState('')
  const [agent, setAgent] = useState<AgentIdentity | null>(null)
  const [activities, setActivities] = useState<AgentActivity[]>([])
  const [refreshing, setRefreshing] = useState(false)

  // Registration form
  const [name, setName] = useState('')
  const [agentType, setAgentType] = useState<AgentType>('assistant')
  const [capabilities, setCapabilities] = useState('')

  const loadData = useCallback(async () => {
    try {
      const walletDid = await getWalletDid()
      setDid(walletDid)
      const identity = await getAgentIdentity(walletDid)
      setAgent(identity)
      if (identity) {
        const actData = await getAgentActivity(10, 0)
        setActivities(actData.activities || [])
      }
    } catch {
      // Silent
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

  const handleRegister = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Agent name is required')
      return
    }

    try {
      const result = await registerAgent({
        name: name.trim(),
        type: agentType,
        owner: { did, name: 'Mobile User', type: 'human' },
        capabilities: capabilities.split(',').map((c) => c.trim()).filter(Boolean),
      })
      setAgent(result)
      Alert.alert('Success', 'Agent registered successfully')
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Registration failed')
    }
  }

  const copyDid = async () => {
    if (did) {
      await Clipboard.setStringAsync(did)
      Alert.alert('Copied', 'DID copied to clipboard')
    }
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* DID Display */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Wallet DID</Text>
        <TouchableOpacity onPress={copyDid}>
          <Text style={styles.didText} numberOfLines={2} ellipsizeMode="middle">
            {did || 'Generating...'}
          </Text>
          <Text style={styles.copyHint}>Tap to copy</Text>
        </TouchableOpacity>
      </View>

      {agent ? (
        <>
          {/* Agent Profile */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Agent Profile</Text>
            <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>Name</Text>
              <Text style={styles.profileValue}>{agent.name}</Text>
            </View>
            <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>Type</Text>
              <Text style={styles.profileValue}>{agent.type}</Text>
            </View>
            <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>Status</Text>
              <View style={[styles.badge, agent.status === 'active' ? styles.badgeActive : styles.badgeSuspended]}>
                <Text style={styles.badgeText}>{agent.status}</Text>
              </View>
            </View>
            <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>Trust Level</Text>
              <Text style={styles.profileValue}>{agent.trustLevel}</Text>
            </View>
          </View>

          {/* Activity Log */}
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          {activities.length > 0 ? (
            activities.map((a) => (
              <View key={a.id} style={styles.activityItem}>
                <Text style={styles.activityAction}>{a.action}</Text>
                <Text style={styles.activityTime}>
                  {new Date(a.timestamp).toLocaleString()}
                </Text>
                <Text style={[
                  styles.activityResult,
                  a.result === 'success' ? styles.resultSuccess : styles.resultFailure,
                ]}>
                  {a.result}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No recent activity</Text>
          )}
        </>
      ) : (
        <>
          {/* Registration Form */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Register Agent</Text>

            <Text style={styles.inputLabel}>Agent Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="My AI Agent"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.inputLabel}>Agent Type</Text>
            <View style={styles.typeRow}>
              {AGENT_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeChip, agentType === t && styles.typeChipActive]}
                  onPress={() => setAgentType(t)}
                >
                  <Text style={[styles.typeChipText, agentType === t && styles.typeChipTextActive]}>
                    {t}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>Capabilities (comma-separated)</Text>
            <TextInput
              style={styles.input}
              value={capabilities}
              onChangeText={setCapabilities}
              placeholder="data_read, api_call, compute"
              placeholderTextColor={colors.textMuted}
            />

            <TouchableOpacity style={styles.registerButton} onPress={handleRegister}>
              <Text style={styles.registerText}>Register Agent</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.md },
  card: {
    backgroundColor: colors.card, borderRadius: borderRadius.lg,
    padding: spacing.lg, marginBottom: spacing.md,
  },
  cardLabel: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.xs },
  didText: { fontSize: fontSize.md, color: colors.primary, fontFamily: 'monospace' },
  copyHint: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs },
  sectionTitle: {
    fontSize: fontSize.xl, fontWeight: '600', color: colors.text, marginBottom: spacing.md,
  },
  profileRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  profileLabel: { fontSize: fontSize.md, color: colors.textSecondary },
  profileValue: { fontSize: fontSize.md, color: colors.text, fontWeight: '500' },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm },
  badgeActive: { backgroundColor: colors.success },
  badgeSuspended: { backgroundColor: colors.warning },
  badgeText: { fontSize: fontSize.xs, color: colors.white, fontWeight: '600' },
  activityItem: {
    backgroundColor: colors.card, borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.sm,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  activityAction: { fontSize: fontSize.md, color: colors.text, flex: 1 },
  activityTime: { fontSize: fontSize.xs, color: colors.textMuted, marginHorizontal: spacing.sm },
  activityResult: { fontSize: fontSize.xs, fontWeight: '600' },
  resultSuccess: { color: colors.success },
  resultFailure: { color: colors.error },
  emptyText: { fontSize: fontSize.md, color: colors.textMuted, textAlign: 'center', marginTop: spacing.lg },
  inputLabel: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.surfaceLight, borderRadius: borderRadius.md,
    padding: spacing.md, color: colors.text, fontSize: fontSize.md,
    borderWidth: 1, borderColor: colors.border,
  },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  typeChip: {
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
    borderRadius: borderRadius.round, backgroundColor: colors.surfaceLight,
    borderWidth: 1, borderColor: colors.border,
  },
  typeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeChipText: { fontSize: fontSize.sm, color: colors.textSecondary },
  typeChipTextActive: { color: colors.white, fontWeight: '600' },
  registerButton: {
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
    padding: spacing.md, alignItems: 'center', marginTop: spacing.lg,
  },
  registerText: { fontSize: fontSize.lg, fontWeight: '600', color: colors.white },
})
