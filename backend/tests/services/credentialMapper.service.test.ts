/**
 * Credential Mapper Service Tests — config IDs, display configs, mapping
 */

import {
  CREDENTIAL_CONFIGURATION_IDS,
  CREDENTIAL_DISPLAY_CONFIGS,
} from '../../src/services/credential-mapper.service'

describe('CredentialMapperService', () => {
  describe('CREDENTIAL_CONFIGURATION_IDS', () => {
    it('should define agent identity config ID', () => {
      expect(CREDENTIAL_CONFIGURATION_IDS.AGENT_IDENTITY).toBe('AIAgentIdentityCredential')
    })

    it('should define delegation config ID', () => {
      expect(CREDENTIAL_CONFIGURATION_IDS.DELEGATION).toBe('DelegationCredential')
    })

    it('should define capability config ID', () => {
      expect(CREDENTIAL_CONFIGURATION_IDS.CAPABILITY).toBe('CapabilityCredential')
    })
  })

  describe('CREDENTIAL_DISPLAY_CONFIGS', () => {
    it('should have display config for each credential type', () => {
      expect(CREDENTIAL_DISPLAY_CONFIGS[CREDENTIAL_CONFIGURATION_IDS.AGENT_IDENTITY]).toBeDefined()
      expect(CREDENTIAL_DISPLAY_CONFIGS[CREDENTIAL_CONFIGURATION_IDS.DELEGATION]).toBeDefined()
      expect(CREDENTIAL_DISPLAY_CONFIGS[CREDENTIAL_CONFIGURATION_IDS.CAPABILITY]).toBeDefined()
    })

    it('should have name and description for agent identity', () => {
      const config = CREDENTIAL_DISPLAY_CONFIGS[CREDENTIAL_CONFIGURATION_IDS.AGENT_IDENTITY]
      expect(config.name).toBeDefined()
      expect(config.description).toBeDefined()
      expect(config.backgroundColor).toMatch(/^#/)
      expect(config.textColor).toMatch(/^#/)
    })

    it('should have colors for all credential types', () => {
      Object.values(CREDENTIAL_DISPLAY_CONFIGS).forEach((config) => {
        expect(config.backgroundColor).toBeDefined()
        expect(config.textColor).toBeDefined()
      })
    })
  })
})
