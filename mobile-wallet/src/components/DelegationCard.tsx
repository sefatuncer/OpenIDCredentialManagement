/**
 * Delegation Credential Card
 */

import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { colors, spacing, fontSize, borderRadius } from '../theme'

interface Props {
  credential: {
    id: string
    type: string
    issuer: string
    issuedAt: string
    subject: Record<string, unknown>
  }
}

export default function DelegationCard({ credential }: Props) {
  const s = credential.subject
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.typeBadge, { backgroundColor: colors.credential.delegation }]}>
          <Text style={styles.typeBadgeText}>Delegation</Text>
        </View>
      </View>
      <Text style={styles.scope}>
        {Array.isArray(s.actions) ? (s.actions as string[]).join(', ') : 'No actions'}
      </Text>
      {s.delegator ? (
        <Text style={styles.meta}>From: {String(s.delegator)}</Text>
      ) : null}
      {s.delegatee ? (
        <Text style={styles.meta}>To: {String(s.delegatee)}</Text>
      ) : null}
      {s.maxDepth ? (
        <Text style={styles.chain}>Max chain depth: {String(s.maxDepth)}</Text>
      ) : null}
      <Text style={styles.issuer}>Issuer: {credential.issuer}</Text>
      <Text style={styles.date}>{new Date(credential.issuedAt).toLocaleDateString()}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card, borderRadius: borderRadius.lg,
    padding: spacing.lg, marginBottom: spacing.md,
    borderLeftWidth: 4, borderLeftColor: colors.credential.delegation,
  },
  header: { flexDirection: 'row', marginBottom: spacing.sm },
  typeBadge: {
    paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm,
  },
  typeBadgeText: { fontSize: fontSize.xs, color: colors.white, fontWeight: '600' },
  scope: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text },
  meta: { fontSize: fontSize.md, color: colors.textSecondary, marginTop: 2 },
  chain: { fontSize: fontSize.sm, color: colors.primaryLight, marginTop: spacing.xs },
  issuer: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.sm },
  date: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
})
