/**
 * SD-JWT Credential Card — Shows disclosed and hidden claims
 */

import React, { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { colors, spacing, fontSize, borderRadius } from '../theme'
import type { SDJWTCredentialData } from '../types/sdjwt.types'

interface Props {
  credential: {
    id: string
    type: string
    issuer: string
    issuedAt: string
    subject: Record<string, unknown>
  }
  sdData: SDJWTCredentialData
}

export default function SDJWTCredentialCard({ credential, sdData }: Props) {
  const [expanded, setExpanded] = useState(false)

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.typeBadge, { backgroundColor: colors.credential.sdjwt }]}>
          <Text style={styles.typeBadgeText}>SD-JWT</Text>
        </View>
        <Text style={styles.typeName}>{sdData.type}</Text>
      </View>

      <Text style={styles.claimCount}>
        {sdData.disclosures.length} disclosed claims
      </Text>

      {/* Show first few claims */}
      {sdData.disclosures.slice(0, expanded ? undefined : 3).map((d, i) => (
        <View key={i} style={styles.claimRow}>
          <Text style={styles.claimName}>{d.claimName}</Text>
          <Text style={styles.claimValue} numberOfLines={1}>
            {typeof d.claimValue === 'string' ? d.claimValue : JSON.stringify(d.claimValue)}
          </Text>
        </View>
      ))}

      {sdData.disclosures.length > 3 && (
        <TouchableOpacity onPress={() => setExpanded(!expanded)}>
          <Text style={styles.expandText}>
            {expanded ? 'Show less' : `+ ${sdData.disclosures.length - 3} more claims`}
          </Text>
        </TouchableOpacity>
      )}

      <Text style={styles.issuer}>Issuer: {sdData.issuer}</Text>
      <Text style={styles.date}>
        Issued: {new Date(sdData.issuanceDate).toLocaleDateString()}
        {sdData.expirationDate &&
          ` | Expires: ${new Date(sdData.expirationDate).toLocaleDateString()}`}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card, borderRadius: borderRadius.lg,
    padding: spacing.lg, marginBottom: spacing.md,
    borderLeftWidth: 4, borderLeftColor: colors.credential.sdjwt,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  typeBadge: {
    paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: borderRadius.sm,
  },
  typeBadgeText: { fontSize: fontSize.xs, color: colors.black, fontWeight: '600' },
  typeName: { fontSize: fontSize.lg, fontWeight: '600', color: colors.text },
  claimCount: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.sm },
  claimRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  claimName: { fontSize: fontSize.md, color: colors.textSecondary, flex: 1 },
  claimValue: { fontSize: fontSize.md, color: colors.text, flex: 2, textAlign: 'right' },
  expandText: { fontSize: fontSize.sm, color: colors.primary, marginTop: spacing.sm },
  issuer: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.sm },
  date: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
})
