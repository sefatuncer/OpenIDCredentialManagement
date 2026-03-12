/**
 * Agent Identity Credential Card
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

export default function AgentIdentityCard({ credential }: Props) {
  const s = credential.subject
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.typeBadge, { backgroundColor: colors.credential.identity }]}>
          <Text style={styles.typeBadgeText}>Agent ID</Text>
        </View>
      </View>
      <Text style={styles.name}>{String(s.agentName || s.name || 'Unknown Agent')}</Text>
      {s.version ? <Text style={styles.meta}>v{String(s.version)}</Text> : null}
      {s.developer ? <Text style={styles.meta}>by {String(s.developer)}</Text> : null}
      {s.model ? <Text style={styles.meta}>Model: {String(s.model)}</Text> : null}
      {Array.isArray(s.capabilities) && s.capabilities.length > 0 && (
        <View style={styles.capsRow}>
          {(s.capabilities as string[]).slice(0, 4).map((c, i) => (
            <View key={i} style={styles.capChip}>
              <Text style={styles.capText}>{c}</Text>
            </View>
          ))}
        </View>
      )}
      <Text style={styles.issuer}>Issuer: {credential.issuer}</Text>
      <Text style={styles.date}>{new Date(credential.issuedAt).toLocaleDateString()}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card, borderRadius: borderRadius.lg,
    padding: spacing.lg, marginBottom: spacing.md,
    borderLeftWidth: 4, borderLeftColor: colors.credential.identity,
  },
  header: { flexDirection: 'row', marginBottom: spacing.sm },
  typeBadge: {
    paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm,
  },
  typeBadgeText: { fontSize: fontSize.xs, color: colors.white, fontWeight: '600' },
  name: { fontSize: fontSize.xl, fontWeight: 'bold', color: colors.text },
  meta: { fontSize: fontSize.md, color: colors.textSecondary, marginTop: 2 },
  capsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  capChip: {
    backgroundColor: colors.surfaceLight, paddingHorizontal: spacing.sm,
    paddingVertical: 2, borderRadius: borderRadius.round,
  },
  capText: { fontSize: fontSize.xs, color: colors.primaryLight },
  issuer: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.sm },
  date: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
})
