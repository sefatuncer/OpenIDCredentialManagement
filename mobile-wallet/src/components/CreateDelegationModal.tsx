/**
 * Create Delegation Modal — extracted from DelegationsScreen
 */

import React, { useState } from 'react'
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Modal, Alert } from 'react-native'
import { colors, spacing, fontSize, borderRadius } from '../theme'
import { createDelegation } from '../services/agent.service'
import type { DelegationRequest } from '../types/agent.types'

const DID_PATTERN = /^did:[a-z0-9]+:.+$/i

interface Props {
  visible: boolean
  onClose: () => void
  onCreated: () => void
}

export default function CreateDelegationModal({ visible, onClose, onCreated }: Props) {
  const [delegateeDid, setDelegateeDid] = useState('')
  const [actions, setActions] = useState('')
  const [resources, setResources] = useState('')
  const [duration, setDuration] = useState('P30D')

  const handleCreate = async () => {
    const did = delegateeDid.trim()
    if (!did) {
      Alert.alert('Error', 'Delegatee DID is required')
      return
    }
    if (!DID_PATTERN.test(did)) {
      Alert.alert('Error', 'Invalid DID format. Expected: did:method:identifier')
      return
    }

    try {
      const request: DelegationRequest = {
        delegateeToDid: did,
        scope: {
          actions: actions.split(',').map((a) => a.trim()).filter(Boolean),
          resources: resources.split(',').map((r) => r.trim()).filter(Boolean),
        },
        duration,
        revocable: true,
      }
      await createDelegation(request)
      onClose()
      setDelegateeDid('')
      setActions('')
      setResources('')
      onCreated()
      Alert.alert('Success', 'Delegation created')
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to create delegation')
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <Text style={styles.title}>Create Delegation</Text>

          <Text style={styles.label}>Delegatee DID</Text>
          <TextInput
            style={styles.input}
            value={delegateeDid}
            onChangeText={setDelegateeDid}
            placeholder="did:key:z..."
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
          />

          <Text style={styles.label}>Actions (comma-separated)</Text>
          <TextInput
            style={styles.input}
            value={actions}
            onChangeText={setActions}
            placeholder="read, write, execute"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.label}>Resources (comma-separated)</Text>
          <TextInput
            style={styles.input}
            value={resources}
            onChangeText={setResources}
            placeholder="api://, file://"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.label}>Duration (ISO 8601)</Text>
          <TextInput
            style={styles.input}
            value={duration}
            onChangeText={setDuration}
            placeholder="P30D"
            placeholderTextColor={colors.textMuted}
          />

          <TouchableOpacity style={styles.createBtn} onPress={handleCreate}>
            <Text style={styles.createText}>Create</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  content: {
    backgroundColor: colors.surface, borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl, padding: spacing.lg, paddingBottom: spacing.xxl,
  },
  title: { fontSize: fontSize.xl, fontWeight: 'bold', color: colors.white, marginBottom: spacing.lg },
  label: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.card, borderRadius: borderRadius.md,
    padding: spacing.md, color: colors.text, fontSize: fontSize.md,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md,
  },
  createBtn: {
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
    padding: spacing.md, alignItems: 'center', marginTop: spacing.sm,
  },
  createText: { fontSize: fontSize.lg, fontWeight: '600', color: colors.white },
  cancelBtn: { padding: spacing.md, alignItems: 'center', marginTop: spacing.xs },
  cancelText: { fontSize: fontSize.md, color: colors.textSecondary },
})
