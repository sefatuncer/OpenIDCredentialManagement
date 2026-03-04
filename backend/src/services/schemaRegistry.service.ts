/**
 * Credential Schema Registry Service
 *
 * Manages credential schemas and definitions
 */

import { logger } from '../utils/logger'

export interface CredentialSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description?: string
  required?: boolean
  items?: CredentialSchemaProperty
  properties?: Record<string, CredentialSchemaProperty>
  enum?: any[]
  default?: any
  format?: string
}

export interface CredentialSchema {
  id: string
  name: string
  version: string
  type: string
  description: string
  properties: Record<string, CredentialSchemaProperty>
  required: string[]
  context: string[]
  credentialSubject: {
    type: string
    properties: Record<string, CredentialSchemaProperty>
  }
  issuanceConfig?: {
    validityPeriod?: number // seconds
    revocable?: boolean
    selectiveDisclosure?: string[] // claims that support SD
  }
  createdAt: string
  updatedAt: string
  active: boolean
}

// Built-in schemas
const builtInSchemas: CredentialSchema[] = [
  {
    id: 'AIAgentIdentityCredential',
    name: 'AI Agent Identity Credential',
    version: '1.0.0',
    type: 'AIAgentIdentityCredential',
    description: 'Credential for AI agent identity verification',
    properties: {},
    required: ['agentId', 'agentType', 'agentName', 'ownerDid'],
    context: [
      'https://www.w3.org/2018/credentials/v1',
      'https://w3id.org/security/suites/jws-2020/v1',
    ],
    credentialSubject: {
      type: 'AIAgent',
      properties: {
        agentId: { type: 'string', description: 'Unique agent identifier', required: true },
        agentType: { type: 'string', enum: ['autonomous', 'assistive', 'hybrid'], required: true },
        agentName: { type: 'string', description: 'Human-readable agent name', required: true },
        agentVersion: { type: 'string', description: 'Agent software version' },
        capabilities: { type: 'array', items: { type: 'string' }, description: 'Agent capabilities' },
        ownerDid: { type: 'string', description: 'DID of the agent owner', required: true },
        ownerName: { type: 'string', description: 'Name of the agent owner' },
        trustLevel: { type: 'string', enum: ['basic', 'elevated', 'high'], default: 'basic' },
      },
    },
    issuanceConfig: {
      validityPeriod: 365 * 24 * 60 * 60, // 1 year
      revocable: true,
      selectiveDisclosure: ['capabilities', 'trustLevel', 'ownerName'],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    active: true,
  },
  {
    id: 'DelegationCredential',
    name: 'Delegation Credential',
    version: '1.0.0',
    type: 'DelegationCredential',
    description: 'Credential for delegating permissions between agents',
    properties: {},
    required: ['delegatorDid', 'delegateDid', 'scope'],
    context: [
      'https://www.w3.org/2018/credentials/v1',
      'https://w3id.org/security/suites/jws-2020/v1',
    ],
    credentialSubject: {
      type: 'Delegation',
      properties: {
        delegatorDid: { type: 'string', required: true },
        delegatorName: { type: 'string' },
        delegateDid: { type: 'string', required: true },
        delegateName: { type: 'string' },
        scope: { type: 'array', items: { type: 'string' }, required: true },
        purpose: { type: 'string' },
        constraints: { type: 'object' },
      },
    },
    issuanceConfig: {
      validityPeriod: 30 * 24 * 60 * 60, // 30 days
      revocable: true,
      selectiveDisclosure: ['purpose', 'constraints'],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    active: true,
  },
  {
    id: 'CapabilityCredential',
    name: 'Capability Credential',
    version: '1.0.0',
    type: 'CapabilityCredential',
    description: 'Credential granting specific capabilities to an agent',
    properties: {},
    required: ['capabilityType', 'resource', 'actions'],
    context: [
      'https://www.w3.org/2018/credentials/v1',
      'https://w3id.org/security/suites/jws-2020/v1',
    ],
    credentialSubject: {
      type: 'Capability',
      properties: {
        capabilityType: { type: 'string', required: true },
        resource: { type: 'string', required: true },
        actions: { type: 'array', items: { type: 'string' }, required: true },
        conditions: { type: 'object' },
        maxUsage: { type: 'number' },
      },
    },
    issuanceConfig: {
      validityPeriod: 7 * 24 * 60 * 60, // 7 days
      revocable: true,
      selectiveDisclosure: ['conditions', 'maxUsage'],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    active: true,
  },
]

class SchemaRegistryService {
  private schemas: Map<string, CredentialSchema> = new Map()

  constructor() {
    // Initialize with built-in schemas
    for (const schema of builtInSchemas) {
      this.schemas.set(schema.id, schema)
    }
    logger.info(`Schema registry initialized with ${this.schemas.size} schemas`)
  }

  // Get all schemas
  getAllSchemas(): CredentialSchema[] {
    return Array.from(this.schemas.values()).filter((s) => s.active)
  }

  // Get schema by ID
  getSchema(id: string): CredentialSchema | undefined {
    return this.schemas.get(id)
  }

  // Register new schema
  registerSchema(schema: Omit<CredentialSchema, 'createdAt' | 'updatedAt'>): CredentialSchema {
    if (this.schemas.has(schema.id)) {
      throw new Error(`Schema ${schema.id} already exists`)
    }

    const now = new Date().toISOString()
    const fullSchema: CredentialSchema = {
      ...schema,
      createdAt: now,
      updatedAt: now,
    }

    this.schemas.set(schema.id, fullSchema)
    logger.info(`Schema registered: ${schema.id}`)
    return fullSchema
  }

  // Update schema
  updateSchema(id: string, updates: Partial<CredentialSchema>): CredentialSchema {
    const existing = this.schemas.get(id)
    if (!existing) {
      throw new Error(`Schema ${id} not found`)
    }

    const updated: CredentialSchema = {
      ...existing,
      ...updates,
      id: existing.id, // Prevent ID change
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    }

    this.schemas.set(id, updated)
    logger.info(`Schema updated: ${id}`)
    return updated
  }

  // Deactivate schema (soft delete)
  deactivateSchema(id: string): boolean {
    const schema = this.schemas.get(id)
    if (!schema) {
      return false
    }

    schema.active = false
    schema.updatedAt = new Date().toISOString()
    logger.info(`Schema deactivated: ${id}`)
    return true
  }

  // Validate claims against schema
  validateClaims(schemaId: string, claims: Record<string, any>): {
    valid: boolean
    errors: string[]
  } {
    const schema = this.schemas.get(schemaId)
    if (!schema) {
      return { valid: false, errors: [`Schema ${schemaId} not found`] }
    }

    const errors: string[] = []

    // Check required fields
    for (const field of schema.required) {
      if (claims[field] === undefined || claims[field] === null) {
        errors.push(`Missing required field: ${field}`)
      }
    }

    // Validate property types
    for (const [key, value] of Object.entries(claims)) {
      const propDef = schema.credentialSubject.properties[key]
      if (propDef) {
        const typeError = this.validateType(key, value, propDef)
        if (typeError) {
          errors.push(typeError)
        }
      }
    }

    return { valid: errors.length === 0, errors }
  }

  private validateType(key: string, value: any, propDef: CredentialSchemaProperty): string | null {
    const actualType = Array.isArray(value) ? 'array' : typeof value

    if (propDef.type !== actualType) {
      return `Field ${key}: expected ${propDef.type}, got ${actualType}`
    }

    if (propDef.enum && !propDef.enum.includes(value)) {
      return `Field ${key}: value must be one of ${propDef.enum.join(', ')}`
    }

    return null
  }

  // Get schema for OpenID4VCI
  getCredentialConfiguration(schemaId: string): any {
    const schema = this.schemas.get(schemaId)
    if (!schema) return null

    return {
      format: 'jwt_vc_json',
      scope: schemaId,
      cryptographic_binding_methods_supported: ['did:key', 'did:web'],
      credential_signing_alg_values_supported: ['ES256', 'EdDSA'],
      credential_definition: {
        type: ['VerifiableCredential', schema.type],
        credentialSubject: schema.credentialSubject,
      },
      display: [
        {
          name: schema.name,
          description: schema.description,
          locale: 'en',
        },
      ],
    }
  }

  // Get all credential configurations for metadata
  getAllCredentialConfigurations(): Record<string, any> {
    const configs: Record<string, any> = {}

    for (const schema of this.getAllSchemas()) {
      configs[schema.id] = this.getCredentialConfiguration(schema.id)
    }

    return configs
  }
}

export const schemaRegistry = new SchemaRegistryService()
