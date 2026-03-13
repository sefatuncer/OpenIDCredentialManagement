/**
 * DIDComm Service Tests — Agent-to-Agent Messaging
 */

// Mock dependencies before imports
const mockGetCredoAgent = jest.fn()
const mockIsCredoAgentReady = jest.fn()
const mockIsFeatureEnabled = jest.fn()
const mockIsPrivateUrl = jest.fn()

jest.mock('../../src/agents/credo.agent', () => ({
  getCredoAgent: mockGetCredoAgent,
  isCredoAgentReady: mockIsCredoAgentReady,
}))

jest.mock('../../src/core/feature-flags', () => ({
  isFeatureEnabled: mockIsFeatureEnabled,
}))

jest.mock('../../src/utils/url-validation', () => ({
  isPrivateUrl: mockIsPrivateUrl,
}))

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}))

import {
  isDidCommEnabled,
  createDidCommInvitation,
  receiveDidCommInvitation,
  getDidCommConnections,
  getDidCommConnection,
  sendBasicMessage,
  getBasicMessages,
} from '../../src/services/didcomm.service'

// --- Mock Agent Factory ---

function createMockCredoAgent(options: { didCommLoaded?: boolean } = {}) {
  const { didCommLoaded = true } = options

  const mockCreateInvitation = jest.fn().mockResolvedValue({
    id: 'oob-123',
    outOfBandInvitation: {
      toUrl: jest.fn(({ domain }: { domain: string }) => `${domain}?oob=base64data`),
    },
  })

  const mockReceiveInvitationFromUrl = jest.fn().mockResolvedValue({
    connectionRecord: {
      id: 'conn-456',
      state: 'invitation-received',
    },
  })

  const mockGetAll = jest.fn().mockResolvedValue([
    {
      id: 'conn-001',
      state: 'completed',
      role: 'responder',
      theirDid: 'did:key:z6MkPeer1',
      theirLabel: 'Peer Agent',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
    },
    {
      id: 'conn-002',
      state: 'request-sent',
      role: 'requester',
      theirDid: undefined,
      theirLabel: undefined,
      createdAt: new Date('2026-02-01T00:00:00Z'),
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    },
  ])

  const mockFindById = jest.fn().mockImplementation(async (id: string) => {
    if (id === 'conn-001') {
      return {
        id: 'conn-001',
        state: 'completed',
        role: 'responder',
        theirDid: 'did:key:z6MkPeer1',
        theirLabel: 'Peer Agent',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
      }
    }
    return null
  })

  const mockSendMessage = jest.fn().mockResolvedValue({
    id: 'msg-789',
  })

  const mockFindAllByQuery = jest.fn().mockResolvedValue([
    {
      id: 'msg-001',
      connectionId: 'conn-001',
      content: 'Hello from peer',
      sentTime: '2026-01-01T12:00:00Z',
      role: 'receiver',
    },
    {
      id: 'msg-002',
      connectionId: 'conn-001',
      content: 'Hello back',
      sentTime: '2026-01-01T12:01:00Z',
      role: 'sender',
    },
  ])

  const agent: any = {
    modules: didCommLoaded
      ? {
          didComm: {
            outOfBand: {
              createInvitation: mockCreateInvitation,
              receiveInvitationFromUrl: mockReceiveInvitationFromUrl,
            },
            connections: {
              getAll: mockGetAll,
              findById: mockFindById,
            },
            basicMessages: {
              sendMessage: mockSendMessage,
              findAllByQuery: mockFindAllByQuery,
            },
          },
        }
      : {},
  }

  return {
    agent,
    mocks: {
      createInvitation: mockCreateInvitation,
      receiveInvitationFromUrl: mockReceiveInvitationFromUrl,
      getAll: mockGetAll,
      findById: mockFindById,
      sendMessage: mockSendMessage,
      findAllByQuery: mockFindAllByQuery,
    },
  }
}

function enableDidComm(agent: any) {
  mockIsFeatureEnabled.mockReturnValue(true)
  mockIsCredoAgentReady.mockReturnValue(true)
  mockGetCredoAgent.mockReturnValue(agent)
  mockIsPrivateUrl.mockReturnValue(false)
}

function disableDidComm() {
  mockIsFeatureEnabled.mockReturnValue(false)
  mockIsCredoAgentReady.mockReturnValue(false)
  mockGetCredoAgent.mockReturnValue(null)
}

describe('DIDCommService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('isDidCommEnabled', () => {
    it('should return true when feature flag is enabled and agent is ready', () => {
      mockIsFeatureEnabled.mockReturnValue(true)
      mockIsCredoAgentReady.mockReturnValue(true)

      expect(isDidCommEnabled()).toBe(true)
    })

    it('should return false when feature flag is disabled', () => {
      mockIsFeatureEnabled.mockReturnValue(false)
      mockIsCredoAgentReady.mockReturnValue(true)

      expect(isDidCommEnabled()).toBe(false)
    })

    it('should return false when agent is not ready', () => {
      mockIsFeatureEnabled.mockReturnValue(true)
      mockIsCredoAgentReady.mockReturnValue(false)

      expect(isDidCommEnabled()).toBe(false)
    })

    it('should check the module.didcomm feature flag', () => {
      mockIsFeatureEnabled.mockReturnValue(false)
      mockIsCredoAgentReady.mockReturnValue(true)

      isDidCommEnabled()

      expect(mockIsFeatureEnabled).toHaveBeenCalledWith('module.didcomm')
    })
  })

  describe('Feature flag gating', () => {
    beforeEach(() => {
      disableDidComm()
    })

    it('createDidCommInvitation should throw when DIDComm is disabled', async () => {
      await expect(createDidCommInvitation()).rejects.toThrow('DIDComm is not enabled')
    })

    it('receiveDidCommInvitation should throw when DIDComm is disabled', async () => {
      await expect(
        receiveDidCommInvitation('https://example.com?oob=data')
      ).rejects.toThrow('DIDComm is not enabled')
    })

    it('getDidCommConnections should throw when DIDComm is disabled', async () => {
      await expect(getDidCommConnections()).rejects.toThrow('DIDComm is not enabled')
    })

    it('getDidCommConnection should throw when DIDComm is disabled', async () => {
      await expect(getDidCommConnection('conn-001')).rejects.toThrow('DIDComm is not enabled')
    })

    it('sendBasicMessage should throw when DIDComm is disabled', async () => {
      await expect(sendBasicMessage('conn-001', 'hello')).rejects.toThrow('DIDComm is not enabled')
    })

    it('getBasicMessages should throw when DIDComm is disabled', async () => {
      await expect(getBasicMessages('conn-001')).rejects.toThrow('DIDComm is not enabled')
    })
  })

  describe('Credo agent dependency', () => {
    it('should throw when Credo agent is null', async () => {
      mockIsFeatureEnabled.mockReturnValue(true)
      mockIsCredoAgentReady.mockReturnValue(true)
      mockGetCredoAgent.mockReturnValue(null)

      await expect(createDidCommInvitation()).rejects.toThrow('Credo agent not available')
    })

    it('should throw when DIDComm module is not loaded', async () => {
      const { agent } = createMockCredoAgent({ didCommLoaded: false })
      mockIsFeatureEnabled.mockReturnValue(true)
      mockIsCredoAgentReady.mockReturnValue(true)
      mockGetCredoAgent.mockReturnValue(agent)

      await expect(createDidCommInvitation()).rejects.toThrow('DIDComm module not loaded')
    })
  })

  describe('createDidCommInvitation', () => {
    it('should create an OOB invitation and return URL + outOfBandId', async () => {
      const { agent, mocks } = createMockCredoAgent()
      enableDidComm(agent)

      const result = await createDidCommInvitation()

      expect(result.invitationUrl).toBeDefined()
      expect(result.invitationUrl).toContain('oob=')
      expect(result.outOfBandId).toBe('oob-123')
      expect(mocks.createInvitation).toHaveBeenCalledWith({})
    })

    it('should use ISSUER_BASE_URL env var for invitation domain', async () => {
      const { agent, mocks } = createMockCredoAgent()
      enableDidComm(agent)

      process.env.ISSUER_BASE_URL = 'https://example.com'

      await createDidCommInvitation()

      const toUrlCall = mocks.createInvitation.mock.results[0].value
      const invitation = await toUrlCall
      expect(invitation.outOfBandInvitation.toUrl).toHaveBeenCalledWith({
        domain: 'https://example.com',
      })

      delete process.env.ISSUER_BASE_URL
    })

    it('should propagate errors from Credo agent', async () => {
      const { agent } = createMockCredoAgent()
      enableDidComm(agent)

      agent.modules.didComm.outOfBand.createInvitation.mockRejectedValue(
        new Error('Agent internal error')
      )

      await expect(createDidCommInvitation()).rejects.toThrow('Agent internal error')
    })
  })

  describe('receiveDidCommInvitation', () => {
    it('should receive an invitation and return connectionId + state', async () => {
      const { agent, mocks } = createMockCredoAgent()
      enableDidComm(agent)

      const result = await receiveDidCommInvitation('https://example.com?oob=base64data')

      expect(result.connectionId).toBe('conn-456')
      expect(result.state).toBe('invitation-received')
      expect(mocks.receiveInvitationFromUrl).toHaveBeenCalledWith(
        'https://example.com?oob=base64data'
      )
    })

    it('should block private/internal URLs (SSRF protection)', async () => {
      const { agent } = createMockCredoAgent()
      enableDidComm(agent)
      mockIsPrivateUrl.mockReturnValue(true)

      await expect(
        receiveDidCommInvitation('http://169.254.169.254/oob')
      ).rejects.toThrow('Private/internal URLs are not allowed')
    })

    it('should allow inline OOB URLs even when URL is private', async () => {
      const { agent } = createMockCredoAgent()
      enableDidComm(agent)
      mockIsPrivateUrl.mockReturnValue(true)

      // The ?oob= parameter contains the invitation inline — no fetch needed
      const result = await receiveDidCommInvitation('http://192.168.1.1?oob=inlinebase64data')

      expect(result.connectionId).toBe('conn-456')
    })

    it('should throw when no connection record is created', async () => {
      const { agent } = createMockCredoAgent()
      enableDidComm(agent)

      agent.modules.didComm.outOfBand.receiveInvitationFromUrl.mockResolvedValue({
        connectionRecord: null,
      })

      await expect(
        receiveDidCommInvitation('https://example.com?oob=data')
      ).rejects.toThrow('No connection record created from invitation')
    })
  })

  describe('getDidCommConnections', () => {
    it('should list all connections mapped to DIDCommConnection format', async () => {
      const { agent } = createMockCredoAgent()
      enableDidComm(agent)

      const connections = await getDidCommConnections()

      expect(connections).toHaveLength(2)

      expect(connections[0]).toEqual({
        id: 'conn-001',
        state: 'completed',
        role: 'responder',
        theirDid: 'did:key:z6MkPeer1',
        theirLabel: 'Peer Agent',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      })

      expect(connections[1]).toEqual({
        id: 'conn-002',
        state: 'request-sent',
        role: 'requester',
        theirDid: undefined,
        theirLabel: undefined,
        createdAt: '2026-02-01T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z',
      })
    })

    it('should return empty array when no connections exist', async () => {
      const { agent } = createMockCredoAgent()
      enableDidComm(agent)
      agent.modules.didComm.connections.getAll.mockResolvedValue([])

      const connections = await getDidCommConnections()

      expect(connections).toEqual([])
    })
  })

  describe('getDidCommConnection', () => {
    it('should return a single connection by ID', async () => {
      const { agent } = createMockCredoAgent()
      enableDidComm(agent)

      const connection = await getDidCommConnection('conn-001')

      expect(connection).not.toBeNull()
      expect(connection!.id).toBe('conn-001')
      expect(connection!.state).toBe('completed')
      expect(connection!.theirDid).toBe('did:key:z6MkPeer1')
    })

    it('should return null when connection not found', async () => {
      const { agent } = createMockCredoAgent()
      enableDidComm(agent)

      const connection = await getDidCommConnection('non-existent')

      expect(connection).toBeNull()
    })
  })

  describe('sendBasicMessage', () => {
    it('should send a message and return messageId', async () => {
      const { agent, mocks } = createMockCredoAgent()
      enableDidComm(agent)

      const result = await sendBasicMessage('conn-001', 'Hello, world!')

      expect(result.messageId).toBe('msg-789')
      expect(mocks.sendMessage).toHaveBeenCalledWith('conn-001', 'Hello, world!')
    })

    it('should propagate errors from basic messages API', async () => {
      const { agent } = createMockCredoAgent()
      enableDidComm(agent)

      agent.modules.didComm.basicMessages.sendMessage.mockRejectedValue(
        new Error('Connection not ready')
      )

      await expect(sendBasicMessage('conn-001', 'test')).rejects.toThrow('Connection not ready')
    })
  })

  describe('getBasicMessages', () => {
    it('should return messages for a connection', async () => {
      const { agent, mocks } = createMockCredoAgent()
      enableDidComm(agent)

      const messages = await getBasicMessages('conn-001')

      expect(messages).toHaveLength(2)
      expect(messages[0]).toEqual({
        id: 'msg-001',
        connectionId: 'conn-001',
        content: 'Hello from peer',
        sentTime: '2026-01-01T12:00:00Z',
        role: 'receiver',
      })
      expect(messages[1]).toEqual({
        id: 'msg-002',
        connectionId: 'conn-001',
        content: 'Hello back',
        sentTime: '2026-01-01T12:01:00Z',
        role: 'sender',
      })
      expect(mocks.findAllByQuery).toHaveBeenCalledWith({ connectionId: 'conn-001' })
    })

    it('should return empty array when no messages exist', async () => {
      const { agent } = createMockCredoAgent()
      enableDidComm(agent)
      agent.modules.didComm.basicMessages.findAllByQuery.mockResolvedValue([])

      const messages = await getBasicMessages('conn-001')

      expect(messages).toEqual([])
    })

    it('should handle records with createdAt fallback for sentTime', async () => {
      const { agent } = createMockCredoAgent()
      enableDidComm(agent)

      agent.modules.didComm.basicMessages.findAllByQuery.mockResolvedValue([
        {
          id: 'msg-fallback',
          connectionId: 'conn-001',
          content: 'Fallback time',
          sentTime: undefined,
          createdAt: new Date('2026-03-01T10:00:00Z'),
          role: 'receiver',
        },
      ])

      const messages = await getBasicMessages('conn-001')

      expect(messages[0].sentTime).toBe('2026-03-01T10:00:00.000Z')
    })
  })
})
