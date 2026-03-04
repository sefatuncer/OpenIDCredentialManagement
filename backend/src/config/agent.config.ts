import dotenv from 'dotenv'

dotenv.config()

export interface AgentConfig {
  name: string
  port: number
  walletId: string
  walletKey: string
  endpoint: string
}

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000'

export const issuerConfig: AgentConfig = {
  name: process.env.ISSUER_AGENT_NAME || 'AI-Agent-Issuer',
  port: parseInt(process.env.API_PORT || '3000'),
  walletId: process.env.ISSUER_WALLET_ID || 'issuer-wallet',
  walletKey: process.env.ISSUER_WALLET_KEY || 'issuer-key',
  endpoint: process.env.ISSUER_ENDPOINT || `${API_BASE_URL}/api/v1/issuer`,
}

export const verifierConfig: AgentConfig = {
  name: process.env.VERIFIER_AGENT_NAME || 'AI-Agent-Verifier',
  port: parseInt(process.env.API_PORT || '3000'),
  walletId: process.env.VERIFIER_WALLET_ID || 'verifier-wallet',
  walletKey: process.env.VERIFIER_WALLET_KEY || 'verifier-key',
  endpoint: process.env.VERIFIER_ENDPOINT || `${API_BASE_URL}/api/v1/verifier`,
}

export const holderConfig: AgentConfig = {
  name: process.env.HOLDER_AGENT_NAME || 'AI-Agent-Holder',
  port: parseInt(process.env.API_PORT || '3000'),
  walletId: process.env.HOLDER_WALLET_ID || 'holder-wallet',
  walletKey: process.env.HOLDER_WALLET_KEY || 'holder-key',
  endpoint: process.env.HOLDER_ENDPOINT || `${API_BASE_URL}/api/v1/holder`,
}

export const mediatorConfig: AgentConfig = {
  name: process.env.MEDIATOR_AGENT_NAME || 'AI-Agent-Mediator',
  port: parseInt(process.env.API_PORT || '3000'),
  walletId: process.env.MEDIATOR_WALLET_ID || 'mediator-wallet',
  walletKey: process.env.MEDIATOR_WALLET_KEY || 'mediator-key',
  endpoint: process.env.MEDIATOR_ENDPOINT || `${API_BASE_URL}/api/v1/mediator`,
}
