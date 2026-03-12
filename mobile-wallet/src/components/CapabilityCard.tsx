/**
 * Capability Credential Card
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

export default function CapabilityCard({ credential }: Props) {
  const s = credential.subject
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.typeBadge, { backgroundColor: colors.credential.capability }]}>
          <Text style={styles.typeBadgeText}>Capability</Text>
        </View>
      </View>
      <Text style={styles.name}>{String(s.capabilityName || s.name || 'Capability')}</Text>
      {s.description ? <Text style={styles.desc}>{String(s.description)}</Text> : null}
      {Array.isArray(s.tools) && (s.tools as string[]).length > 0 && (
        <View style={styles.toolsRow}>
          {(s.tools as string[]).slice(0, 5).map((t, i) => (
            <View key={i} style={styles.toolChip}>
              <Text style={styles.toolText}>{t}</Text>
            </View>
          ))}
        </View>
      )}
      {s.rateLimit ? (
        <Text style={styles.constraint}>Rate limit: {String(s.rateLimit)}/hr</Text>
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
    borderLeftWidth: 4, borderLeftColor: colors.credential.capability,
  },
  header: { flexDirection: 'row', marginBottom: spacing.sm },
  typeBadge: {
    paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm,
  },
  typeBadgeText: { fontSize: fontSize.xs, color: colors.white, fontWeight: '600' },
  name: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text },
  desc: { fontSize: fontSize.md, color: colors.textSecondary, marginTop: 2 },
  toolsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  toolChip: {
    backgroundColor: colors.surfaceLight, paddingHorizontal: spacing.sm,
    paddingVertical: 2, borderRadius: borderRadius.round,
  },
  toolText: { fontSize: fontSize.xs, color: colors.credential.capability },
  constraint: { fontSize: fontSize.sm, color: colors.warning, marginTop: spacing.xs },
  issuer: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.sm },
  date: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
})
