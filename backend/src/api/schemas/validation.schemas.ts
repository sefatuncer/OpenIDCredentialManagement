import { z } from 'zod'

// Common schemas
export const didSchema = z.string().regex(
  /^did:[a-z0-9]+:.+$/i,
  'Invalid DID format. Expected format: did:method:identifier'
)

export const isoDateSchema = z.string().datetime({ message: 'Invalid ISO 8601 date format' })

export const trustLevelSchema = z.enum(['basic', 'standard', 'elevated', 'high'])

export const agentTypeSchema = z.enum(['autonomous', 'semi-autonomous', 'supervised', 'tool'])

// Issuer schemas
export const agentIdentityCredentialSchema = z.object({
  holderDid: didSchema,
  agentId: z.string().min(1, 'Agent ID is required'),
  agentType: agentTypeSchema,
  agentName: z.string().optional(),
  agentVersion: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
  ownerDid: didSchema,
  ownerName: z.string().optional(),
  trustLevel: trustLevelSchema.optional(),
  validUntil: isoDateSchema.optional(),
})

export const delegationCredentialSchema = z.object({
  holderDid: didSchema,
  delegatorDid: didSchema,
  delegatorName: z.string().optional(),
  delegateDid: didSchema,
  delegateName: z.string().optional(),
  scope: z.array(z.string()).min(1, 'At least one scope is required'),
  constraints: z.record(z.unknown()).optional(),
  purpose: z.string().optional(),
  validFrom: isoDateSchema.optional(),
  validUntil: isoDateSchema.optional(),
  revocable: z.boolean().optional(),
})

export const capabilityCredentialSchema = z.object({
  holderDid: didSchema,
  capabilityType: z.string().min(1, 'Capability type is required'),
  resource: z.string().min(1, 'Resource is required'),
  actions: z.array(z.string()).min(1, 'At least one action is required'),
  conditions: z.record(z.unknown()).optional(),
  grantedBy: didSchema.optional(),
  validUntil: isoDateSchema.optional(),
})

// Holder schemas
export const credentialReceiveSchema = z.object({
  credentialOfferUri: z.string().url('Invalid credential offer URI'),
})

export const credentialPresentSchema = z.object({
  verificationRequestUri: z.string().url('Invalid verification request URI'),
})

// Verifier schemas (currently no body params needed)

// Path parameter schemas
export const sessionIdParamSchema = z.object({
  sessionId: z.string().uuid('Invalid session ID format'),
})

export const credentialIdParamSchema = z.object({
  credentialId: z.string().min(1, 'Credential ID is required'),
})

// Type exports
export type AgentIdentityCredentialInput = z.infer<typeof agentIdentityCredentialSchema>
export type DelegationCredentialInput = z.infer<typeof delegationCredentialSchema>
export type CapabilityCredentialInput = z.infer<typeof capabilityCredentialSchema>
export type CredentialReceiveInput = z.infer<typeof credentialReceiveSchema>
export type CredentialPresentInput = z.infer<typeof credentialPresentSchema>
