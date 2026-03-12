import { ExpoConfig, ConfigContext } from 'expo/config'

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'SSI Mobile Wallet',
  slug: 'ssi-mobile-wallet',
  extra: {
    apiUrl: process.env.API_URL || 'http://localhost:3000',
    wsUrl: process.env.WS_URL || 'ws://localhost:3000/ws',
  },
})
