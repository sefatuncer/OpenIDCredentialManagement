import { z } from 'zod'

// Common schemas
export const didSchema = z.string().regex(
  /^did:[a-z0-9]+:.+$/i,
  'Invalid DID format. Expected format: did:method:identifier'
)

export const isoDateSchema = z.string().datetime({ message: 'Invalid ISO 8601 date format' })

export const trustLevelSchema = z.enum(['basic', 'standard', 'elevated', 'high'])

export const agentTypeSchema = z.enum(['autonomous', 'semi-autonomous', 'supervised', 'tool'])

export const credentialFormatSchema = z.enum(['jwt_vc_json', 'vc+sd-jwt'])

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
  securityDomain: z.string().optional(),
  registrationTimestamp: isoDateSchema.optional(),
  delegationChainPosition: z.number().int().min(0).optional(),
  validUntil: isoDateSchema.optional(),
  format: credentialFormatSchema.optional(),
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
  parentDelegationId: z.string().optional(),
  attenuationLevel: z.number().int().min(0).optional(),
  maxAmount: z.number().positive().optional(),
  allowedServices: z.array(z.string()).optional(),
  geographicRestrictions: z.array(z.string().length(2, 'ISO 3166-1 alpha-2 code')).optional(),
  ttlPolicy: z.object({
    minTTL: z.number().positive().optional(),
    maxTTL: z.number().positive().optional(),
    recommendedTTL: z.number().positive().optional(),
  }).optional(),
  validFrom: isoDateSchema.optional(),
  validUntil: isoDateSchema.optional(),
  revocable: z.boolean().optional(),
  format: credentialFormatSchema.optional(),
})

export const capabilityCredentialSchema = z.object({
  holderDid: didSchema,
  capabilityType: z.string().min(1, 'Capability type is required'),
  resource: z.string().min(1, 'Resource is required'),
  actions: z.array(z.string()).min(1, 'At least one action is required'),
  conditions: z.record(z.unknown()).optional(),
  grantedBy: didSchema.optional(),
  toolAllowList: z.array(z.string()).optional(),
  maxUsageCount: z.number().int().positive().optional(),
  usageResetPeriod: z.number().positive().optional(),
  requiredContext: z.string().optional(),
  validUntil: isoDateSchema.optional(),
  format: credentialFormatSchema.optional(),
})

// Sub-delegation schema (chain delegation)
export const subDelegationSchema = z.object({
  delegatorDid: didSchema,
  delegateeDid: didSchema,
  scope: z.object({
    actions: z.array(z.string()).min(1, 'At least one action required'),
    resources: z.array(z.string()).min(1, 'At least one resource required'),
    constraints: z.record(z.unknown()).optional(),
  }),
  duration: z.string().regex(/^P\d+[DWMY]$/, 'ISO 8601 duration (e.g. P30D)').optional().default('P30D'),
  revocable: z.boolean().optional().default(true),
  maxAmount: z.number().positive().optional(),
  allowedServices: z.array(z.string()).optional(),
  geographicRestrictions: z.array(z.string().length(2)).optional(),
})

export type SubDelegationInput = z.infer<typeof subDelegationSchema>

// Batch issuance schema
export const batchIssuanceSchema = z.object({
  credentialType: z.enum(['AIAgentIdentityCredential', 'DelegationCredential', 'CapabilityCredential']),
  format: credentialFormatSchema.optional().default('jwt_vc_json'),
  recipients: z.array(z.object({
    holderDid: z.string().regex(/^did:(key|web|peer):[a-zA-Z0-9._%-]+$/),
    claims: z.record(z.unknown()),
  })).min(1).max(100),
})

export const batchJobIdParamSchema = z.object({
  jobId: z.string().regex(/^batch-\d+-[a-z0-9]+$/, 'Invalid batch job ID format'),
})

// Batch issuance types
export type BatchIssuanceInput = z.infer<typeof batchIssuanceSchema>
export type BatchJobIdParam = z.infer<typeof batchJobIdParamSchema>

// Credential Schema Registry schemas
const schemaPropertySchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
    description: z.string().optional(),
    required: z.boolean().optional(),
    items: schemaPropertySchema.optional(),
    properties: z.record(schemaPropertySchema).optional(),
    enum: z.array(z.unknown()).optional(),
    default: z.unknown().optional(),
    format: z.string().optional(),
  })
)

export const credentialSchemaCreateSchema = z.object({
  id: z.string().min(1, 'Schema ID is required').max(100),
  name: z.string().min(1, 'Schema name is required').max(200),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be semver (e.g. 1.0.0)'),
  type: z.string().min(1, 'Type is required'),
  description: z.string().min(1, 'Description is required').max(500),
  required: z.array(z.string()).default([]),
  context: z.array(z.string()).default([
    'https://www.w3.org/2018/credentials/v1',
    'https://w3id.org/security/suites/jws-2020/v1',
  ]),
  credentialSubject: z.object({
    type: z.string().min(1),
    properties: z.record(schemaPropertySchema),
  }),
  issuanceConfig: z.object({
    validityPeriod: z.number().positive().optional(),
    revocable: z.boolean().optional(),
    selectiveDisclosure: z.array(z.string()).optional(),
  }).optional(),
  active: z.boolean().default(true),
})

export const credentialSchemaUpdateSchema = credentialSchemaCreateSchema.partial().omit({ id: true })

export type CredentialSchemaCreateInput = z.infer<typeof credentialSchemaCreateSchema>
export type CredentialSchemaUpdateInput = z.infer<typeof credentialSchemaUpdateSchema>

// Schema-based issuance
export const schemaIssueRequestSchema = z.object({
  holderDid: didSchema,
  schemaId: z.string().min(1).max(100),
  claims: z.record(z.unknown()),
  format: credentialFormatSchema.optional(),
  selectiveDisclosureClaims: z.array(z.string()).optional(),
  validityDays: z.number().positive().optional(),
  revocable: z.boolean().optional(),
})

export type SchemaIssueRequestInput = z.infer<typeof schemaIssueRequestSchema>

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

// OAuth 2.0 Bridge — RFC 8693 Token Exchange
export const tokenExchangeSchema = z.object({
  grant_type: z.literal('urn:ietf:params:oauth:grant-type:token-exchange'),
  subject_token: z.string().min(1, 'Subject token (VC JWT) is required'),
  subject_token_type: z.string().min(1, 'Subject token type is required'),
  scope: z.string().optional(),
  resource: z.string().url().optional(),
})

export const bridgeIntrospectSchema = z.object({
  token: z.string().min(1, 'Token is required'),
})

export type TokenExchangeInput = z.infer<typeof tokenExchangeSchema>
export type BridgeIntrospectInput = z.infer<typeof bridgeIntrospectSchema>

// Webhook schemas
const WEBHOOK_EVENT_TYPES = [
  'credential.revoked',
  'credential.unrevoked',
  'credential.issued',
  'verification.completed',
  'delegation.created',
  'delegation.revoked',
] as const

export const webhookCreateSchema = z.object({
  url: z.string().url('Valid URL required').refine(
    (u) => u.startsWith('https://') || process.env.NODE_ENV !== 'production',
    'HTTPS required for webhook URLs in production',
  ),
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1, 'At least one event required'),
  name: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
})

export const webhookUpdateSchema = z.object({
  url: z.string().url('Valid URL required').refine(
    (u) => u.startsWith('https://') || process.env.NODE_ENV !== 'production',
    'HTTPS required for webhook URLs in production',
  ).optional(),
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1).optional(),
  active: z.boolean().optional(),
  name: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
})

export type WebhookCreateInput = z.infer<typeof webhookCreateSchema>
export type WebhookUpdateInput = z.infer<typeof webhookUpdateSchema>

// Keycloak SSO schemas
export const keycloakCallbackSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  redirectUri: z.string().url('Valid redirect URI required'),
  codeVerifier: z.string().min(43, 'PKCE code verifier required').max(128),
  state: z.string().optional(),
})

export type KeycloakCallbackInput = z.infer<typeof keycloakCallbackSchema>

// Type exports
export type AgentIdentityCredentialInput = z.infer<typeof agentIdentityCredentialSchema>
export type DelegationCredentialInput = z.infer<typeof delegationCredentialSchema>
export type CapabilityCredentialInput = z.infer<typeof capabilityCredentialSchema>
export type CredentialReceiveInput = z.infer<typeof credentialReceiveSchema>
export type CredentialPresentInput = z.infer<typeof credentialPresentSchema>
