/**
 * Delegations Screen — Manage delegation grants (received/given)
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert,
} from 'react-native'

import { colors, spacing, fontSize, borderRadius } from '../theme'
import { getDelegations, revokeDelegation } from '../services/agent.service'
import type { DelegationGrant } from '../types/agent.types'
import CreateDelegationModal from '../components/CreateDelegationModal'

type Tab = 'received' | 'given'

export default function DelegationsScreen() {
  const [tab, setTab] = useState<Tab>('received')
  const [received, setReceived] = useState<DelegationGrant[]>([])
  const [given, setGiven] = useState<DelegationGrant[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  const loadDelegations = useCallback(async () => {
    try {
      const data = await getDelegations()
      setReceived(data.received || [])
      setGiven(data.given || [])
    } catch {
      // Silent
    }
  }, [])

  useEffect(() => {
    loadDelegations()
  }, [loadDelegations])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadDelegations()
    setRefreshing(false)
  }, [loadDelegations])

  const handleRevoke = (id: string) => {
    Alert.alert('Revoke Delegation', 'Are you sure you want to revoke this delegation?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: async () => {
          try {
            await revokeDelegation(id, 'Revoked by user')
            await loadDelegations()
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Failed to revoke')
          }
        },
      },
    ])
  }

  const data = tab === 'received' ? received : given

  const renderItem = ({ item }: { item: DelegationGrant }) => {
    const d = item.delegation
    const isRevoked = d.revocation?.revokedAt
    return (
      <View style={[styles.card, isRevoked && styles.cardRevoked]}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>
            {tab === 'received' ? `From: ${d.delegator.name}` : `To: ${d.delegatee.name}`}
          </Text>
          {isRevoked ? (
            <View style={[styles.badge, styles.badgeRevoked]}>
              <Text style={styles.badgeText}>Revoked</Text>
            </View>
          ) : (
            <View style={[styles.badge, styles.badgeActive]}>
              <Text style={styles.badgeText}>Active</Text>
            </View>
          )}
        </View>

        <Text style={styles.scopeLabel}>Actions:</Text>
        <Text style={styles.scopeValue}>{d.scope.actions.join(', ') || 'None'}</Text>

        <Text style={styles.scopeLabel}>Resources:</Text>
        <Text style={styles.scopeValue}>{d.scope.resources.join(', ') || 'None'}</Text>

        {d.chain && (
          <Text style={styles.chainInfo}>
            Chain depth: {d.chain.depth}/{d.chain.maxDepth}
          </Text>
        )}

        <Text style={styles.dateText}>
          Expires: {new Date(item.expirationDate).toLocaleDateString()}
        </Text>

        {tab === 'given' && !isRevoked && (
          <TouchableOpacity
            style={styles.revokeButton}
            onPress={() => handleRevoke(item.id)}
          >
            <Text style={styles.revokeText}>Revoke</Text>
          </TouchableOpacity>
        )}
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Delegations</Text>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, tab === 'received' && styles.tabActive]}
          onPress={() => setTab('received')}
        >
          <Text style={[styles.tabText, tab === 'received' && styles.tabTextActive]}>
            Received ({received.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'given' && styles.tabActive]}
          onPress={() => setTab('given')}
        >
          <Text style={[styles.tabText, tab === 'given' && styles.tabTextActive]}>
            Given ({given.length})
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No {tab} delegations</Text>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={() => setShowCreate(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <CreateDelegationModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={loadDelegations}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.md },
  title: {
    fontSize: fontSize.title, fontWeight: 'bold', color: colors.white,
    marginTop: spacing.xxl, marginBottom: spacing.md,
  },
  tabRow: { flexDirection: 'row', marginBottom: spacing.md, gap: spacing.sm },
  tab: {
    flex: 1, padding: spacing.sm, borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight, alignItems: 'center',
  },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: fontSize.md, color: colors.textSecondary },
  tabTextActive: { color: colors.white, fontWeight: '600' },
  list: { paddingBottom: 100 },
  card: {
    backgroundColor: colors.card, borderRadius: borderRadius.lg,
    padding: spacing.lg, marginBottom: spacing.md,
  },
  cardRevoked: { opacity: 0.6 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  cardTitle: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text, flex: 1 },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm },
  badgeActive: { backgroundColor: colors.success },
  badgeRevoked: { backgroundColor: colors.error },
  badgeText: { fontSize: fontSize.xs, color: colors.white, fontWeight: '600' },
  scopeLabel: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.xs },
  scopeValue: { fontSize: fontSize.md, color: colors.text },
  chainInfo: { fontSize: fontSize.sm, color: colors.primaryLight, marginTop: spacing.xs },
  dateText: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.sm },
  revokeButton: {
    marginTop: spacing.md, padding: spacing.sm, borderRadius: borderRadius.md,
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
})
