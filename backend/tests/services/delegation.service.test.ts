/**
 * Delegation Service Tests
 */

import {
  createDelegation,
  getDelegations,
  getDelegationById,
  revokeDelegation,
  verifyDelegation,
  CreateDelegationInput,
} from '../../src/services/delegation.service'
import { query, queryOne } from '../../src/database/connection'
import { getAgentByDid, logAgentActivity } from '../../src/services/agent.service'

// Mock dependencies
jest.mock('../../src/database/connection')
jest.mock('../../src/services/agent.service')
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

const mockQuery = query as jest.MockedFunction<typeof query>
const mockQueryOne = queryOne as jest.MockedFunction<typeof queryOne>
const mockGetAgentByDid = getAgentByDid as jest.MockedFunction<typeof getAgentByDid>
const mockLogAgentActivity = logAgentActivity as jest.MockedFunction<typeof logAgentActivity>

// Helper to create mock QueryResult
const mockQueryResult = (rows: any[], rowCount?: number) =>
  ({ rows, rowCount: rowCount ?? rows.length, command: '', oid: 0, fields: [] } as any)

describe('DelegationService', () => {
  const testDelegatorDid = 'did:example:delegator123'
  const testDelegateeDid = 'did:example:delegatee456'
  const testAgentId = 'agent-uuid-123'

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('createDelegation', () => {
    const validInput: CreateDelegationInput = {
      delegateeToDid: testDelegateeDid,
      scope: {
        actions: ['read', 'write'],
        resources: ['credentials/*'],
      },
      duration: 'P30D',
      revocable: true,
    }

    it('should create a delegation successfully', async () => {
      mockGetAgentByDid.mockResolvedValue({
        id: testAgentId,
        did: testDelegatorDid,
        name: 'Test Agent',
      } as any)
      mockQuery.mockResolvedValue(mockQueryResult([], 1))
      mockLogAgentActivity.mockResolvedValue(undefined)

      const result = await createDelegation(testDelegatorDid, validInput)

      expect(result).toMatchObject({
        delegatorDid: testDelegatorDid,
        delegateeDid: testDelegateeDid,
        scope: validInput.scope,
        chainDepth: 0,
        maxDepth: 3,
        revocable: true,
        revokedAt: null,
      })
      expect(result.id).toBeDefined()
      expect(result.issuedAt).toBeInstanceOf(Date)
      expect(result.expiresAt).toBeInstanceOf(Date)
      expect(mockLogAgentActivity).toHaveBeenCalledWith(
        testAgentId,
        'delegation_created',
        'success',
        testDelegateeDid
      )
    })

    it('should throw error if delegator agent not found', async () => {
      mockGetAgentByDid.mockResolvedValue(null)

      await expect(createDelegation(testDelegatorDid, validInput)).rejects.toThrow(
        'Delegator agent not found'
      )
    })

    it('should calculate expiration for days (P30D)', async () => {
      mockGetAgentByDid.mockResolvedValue({ id: testAgentId } as any)
      mockQuery.mockResolvedValue(mockQueryResult([], 1))
      mockLogAgentActivity.mockResolvedValue(undefined)

      const result = await createDelegation(testDelegatorDid, {
        ...validInput,
        duration: 'P30D',
      })

      const expectedExpiry = new Date()
      expectedExpiry.setDate(expectedExpiry.getDate() + 30)

      // Allow 1 second tolerance
      expect(Math.abs(result.expiresAt.getTime() - expectedExpiry.getTime())).toBeLessThan(1000)
    })

    it('should calculate expiration for weeks (P2W)', async () => {
      mockGetAgentByDid.mockResolvedValue({ id: testAgentId } as any)
      mockQuery.mockResolvedValue(mockQueryResult([], 1))
      mockLogAgentActivity.mockResolvedValue(undefined)

      const result = await createDelegation(testDelegatorDid, {
        ...validInput,
        duration: 'P2W',
      })

      const expectedExpiry = new Date()
      expectedExpiry.setDate(expectedExpiry.getDate() + 14)

      expect(Math.abs(result.expiresAt.getTime() - expectedExpiry.getTime())).toBeLessThan(1000)
    })

    it('should calculate expiration for months (P3M)', async () => {
      mockGetAgentByDid.mockResolvedValue({ id: testAgentId } as any)
      mockQuery.mockResolvedValue(mockQueryResult([], 1))
      mockLogAgentActivity.mockResolvedValue(undefined)

      const result = await createDelegation(testDelegatorDid, {
        ...validInput,
        duration: 'P3M',
      })

      const expectedExpiry = new Date()
      expectedExpiry.setMonth(expectedExpiry.getMonth() + 3)

      expect(Math.abs(result.expiresAt.getTime() - expectedExpiry.getTime())).toBeLessThan(1000)
    })

    it('should default to 30 days for invalid duration', async () => {
      mockGetAgentByDid.mockResolvedValue({ id: testAgentId } as any)
      mockQuery.mockResolvedValue(mockQueryResult([], 1))
      mockLogAgentActivity.mockResolvedValue(undefined)

      const result = await createDelegation(testDelegatorDid, {
        ...validInput,
        duration: 'invalid',
      })

      const expectedExpiry = new Date()
      expectedExpiry.setDate(expectedExpiry.getDate() + 30)

      expect(Math.abs(result.expiresAt.getTime() - expectedExpiry.getTime())).toBeLessThan(1000)
    })
  })

  describe('getDelegations', () => {
    it('should return given and received delegations', async () => {
      const givenDelegations = [
        {
          id: 'del-1',
          delegator_did: testDelegatorDid,
          delegatee_did: testDelegateeDid,
          scope: JSON.stringify({ actions: ['read'], resources: ['*'] }),
          chain_depth: 0,
          max_depth: 3,
          revocable: true,
          issued_at: new Date(),
          expires_at: new Date(),
          revoked_at: null,
        },
      ]

      const receivedDelegations = [
        {
          id: 'del-2',
          delegator_did: 'did:example:other',
          delegatee_did: testDelegatorDid,
          scope: JSON.stringify({ actions: ['write'], resources: ['*'] }),
          chain_depth: 0,
          max_depth: 3,
          revocable: false,
          issued_at: new Date(),
          expires_at: new Date(),
          revoked_at: null,
        },
      ]

      mockQuery
        .mockResolvedValueOnce(mockQueryResult(givenDelegations))
        .mockResolvedValueOnce(mockQueryResult(receivedDelegations))

      const result = await getDelegations(testDelegatorDid)

      expect(result.given).toHaveLength(1)
      expect(result.received).toHaveLength(1)
      expect(result.given[0].delegatorDid).toBe(testDelegatorDid)
      expect(result.received[0].delegateeDid).toBe(testDelegatorDid)
    })

    it('should return empty arrays when no delegations exist', async () => {
      mockQuery.mockResolvedValue(mockQueryResult([]))

      const result = await getDelegations(testDelegatorDid)

      expect(result.given).toEqual([])
      expect(result.received).toEqual([])
    })
  })

  describe('getDelegationById', () => {
    it('should return delegation when found', async () => {
      const mockDelegation = {
        id: 'del-123',
        delegator_did: testDelegatorDid,
        delegatee_did: testDelegateeDid,
        scope: JSON.stringify({ actions: ['read'], resources: ['*'] }),
        chain_depth: 0,
        max_depth: 3,
        revocable: true,
        issued_at: new Date(),
        expires_at: new Date(),
        revoked_at: null,
      }

      mockQueryOne.mockResolvedValue(mockDelegation)

      const result = await getDelegationById('del-123')

      expect(result).not.toBeNull()
      expect(result?.id).toBe('del-123')
      expect(result?.scope.actions).toEqual(['read'])
    })

    it('should return null when not found', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await getDelegationById('non-existent')

      expect(result).toBeNull()
    })
  })

  describe('revokeDelegation', () => {
    const mockDelegation = {
      id: 'del-123',
      delegator_did: testDelegatorDid,
      delegatee_did: testDelegateeDid,
      scope: JSON.stringify({ actions: ['read'], resources: ['*'] }),
      chain_depth: 0,
      max_depth: 3,
      revocable: true,
      issued_at: new Date(),
      expires_at: new Date(Date.now() + 86400000),
      revoked_at: null,
    }

    it('should revoke a delegation successfully', async () => {
      mockQueryOne.mockResolvedValue(mockDelegation)
      mockQuery.mockResolvedValue(mockQueryResult([{ id: 'del-123' }]))
      mockGetAgentByDid.mockResolvedValue({ id: testAgentId } as any)
      mockLogAgentActivity.mockResolvedValue(undefined)

      const result = await revokeDelegation('del-123', testDelegatorDid, 'No longer needed')

      expect(result).toBe(true)
      expect(mockLogAgentActivity).toHaveBeenCalledWith(
        testAgentId,
        'delegation_revoked',
        'success',
        'del-123',
        { reason: 'No longer needed' }
      )
    })

    it('should return false if delegation not found', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await revokeDelegation('non-existent', testDelegatorDid)

      expect(result).toBe(false)
    })

    it('should return false if not delegator', async () => {
      mockQueryOne.mockResolvedValue(mockDelegation)

      const result = await revokeDelegation('del-123', 'did:example:other')

      expect(result).toBe(false)
    })

    it('should throw error if delegation is not revocable', async () => {
      mockQueryOne.mockResolvedValue({
        ...mockDelegation,
        revocable: false,
      })

      await expect(revokeDelegation('del-123', testDelegatorDid)).rejects.toThrow(
        'This delegation is not revocable'
      )
    })
  })

  describe('verifyDelegation', () => {
    const activeDelegation = {
      id: 'del-123',
      delegator_did: testDelegatorDid,
      delegatee_did: testDelegateeDid,
      scope: JSON.stringify({ actions: ['read', 'write'], resources: ['credentials/*'] }),
      chain_depth: 0,
      max_depth: 3,
      revocable: true,
      issued_at: new Date(Date.now() - 86400000),
      expires_at: new Date(Date.now() + 86400000),
      revoked_at: null,
    }

    it('should verify a valid delegation', async () => {
      mockQueryOne.mockResolvedValue(activeDelegation)

      const result = await verifyDelegation('del-123', 'read', 'credentials/vc-1')

      expect(result.valid).toBe(true)
      expect(result.inScope).toBe(true)
      expect(result.errors).toBeUndefined()
    })

    it('should return invalid if delegation not found', async () => {
      mockQueryOne.mockResolvedValue(null)

      const result = await verifyDelegation('non-existent', 'read')

      expect(result.valid).toBe(false)
      expect(result.inScope).toBe(false)
      expect(result.errors).toContain('Delegation not found')
    })

    it('should return invalid if delegation is revoked', async () => {
      mockQueryOne.mockResolvedValue({
        ...activeDelegation,
        revoked_at: new Date(),
      })

      const result = await verifyDelegation('del-123', 'read')

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Delegation has been revoked')
    })

    it('should return invalid if delegation has expired', async () => {
      mockQueryOne.mockResolvedValue({
        ...activeDelegation,
        expires_at: new Date(Date.now() - 1000),
      })

      const result = await verifyDelegation('del-123', 'read')

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Delegation has expired')
    })

    it('should return invalid if action is not in scope', async () => {
      mockQueryOne.mockResolvedValue(activeDelegation)

      const result = await verifyDelegation('del-123', 'delete')

      expect(result.valid).toBe(false)
      expect(result.inScope).toBe(false)
      expect(result.errors).toContain("Action 'delete' is not in scope")
    })

    it('should return invalid if resource is not in scope', async () => {
      mockQueryOne.mockResolvedValue(activeDelegation)

      const result = await verifyDelegation('del-123', 'read', 'agents/agent-1')

      expect(result.valid).toBe(false)
      expect(result.inScope).toBe(false)
      expect(result.errors).toContain("Resource 'agents/agent-1' is not in scope")
    })

    it('should allow wildcard actions', async () => {
      mockQueryOne.mockResolvedValue({
        ...activeDelegation,
        scope: JSON.stringify({ actions: ['*'], resources: ['*'] }),
      })

      const result = await verifyDelegation('del-123', 'any-action', 'any-resource')

      expect(result.valid).toBe(true)
      expect(result.inScope).toBe(true)
    })

    it('should match resource prefix patterns', async () => {
      mockQueryOne.mockResolvedValue({
        ...activeDelegation,
        scope: JSON.stringify({ actions: ['read'], resources: ['api/*'] }),
      })

      const result = await verifyDelegation('del-123', 'read', 'api/v1/credentials')

      expect(result.valid).toBe(true)
      expect(result.inScope).toBe(true)
    })
  })
})
