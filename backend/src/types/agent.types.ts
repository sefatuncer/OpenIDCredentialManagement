export enum AgentType {
  CUSTOMER_SUPPORT = 'CustomerSupport',
  DATA_ANALYSIS = 'DataAnalysis',
  DOCUMENT_PROCESSING = 'DocumentProcessing',
  SCHEDULING = 'Scheduling',
  RESEARCH = 'Research',
  CODING = 'Coding',
  GENERAL = 'General',
}

export enum TrustLevel {
  BASIC = 'basic',
  VERIFIED = 'verified',
  CERTIFIED = 'certified',
}

export enum CapabilityType {
  READ = 'read',
  WRITE = 'write',
  EXECUTE = 'execute',
  ADMIN = 'admin',
}

export interface AIAgent {
  id: string
  did: string
  name: string
  type: AgentType
  version: string
  capabilities: string[]
  ownerDid: string
  ownerName: string
  trustLevel: TrustLevel
  createdAt: Date
  validUntil: Date
}

export interface Delegation {
  id: string
  delegatorDid: string
  delegatorName: string
  delegateDid: string
  delegateName: string
  scope: string[]
  constraints: Record<string, any>
  purpose: string
  createdAt: Date
  validFrom: Date
  validUntil: Date
  revocable: boolean
  revoked: boolean
}

export interface AgentCapability {
  id: string
  holderDid: string
  type: CapabilityType
  resource: string
  actions: string[]
  conditions: Record<string, any>
  grantedBy: string
  grantedAt: Date
  validUntil: Date
}
