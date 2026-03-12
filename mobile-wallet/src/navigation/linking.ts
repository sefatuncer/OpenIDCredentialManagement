/**
 * Deep linking configuration
 * Handles openid4vp:// and openid-credential-offer:// URI schemes
 */

import { LinkingOptions } from '@react-navigation/native'

export type RootStackParamList = {
  MainTabs: undefined
  PresentCredential: { uri: string }
  AcceptCredential: { uri: string }
  AgentDetail: { did: string }
  TrustManagement: undefined
}

export type MainTabParamList = {
  Home: undefined
  Credentials: undefined
  Scan: undefined
  Delegations: undefined
  Settings: undefined
}

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['openid4vp://', 'openid-credential-offer://', 'ssi-wallet://'],
  config: {
    screens: {
      PresentCredential: {
        path: 'present',
      },
      AcceptCredential: {
        path: 'accept',
      },
      MainTabs: {
        screens: {
          Home: '',
          Credentials: 'credentials',
          Scan: 'scan',
          Delegations: 'delegations',
          Settings: 'settings',
        },
      },
    },
  },
}
