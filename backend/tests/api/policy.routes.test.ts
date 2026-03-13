import request from 'supertest'
import { Express } from 'express'
import {
  createSecurityTestServer,
  authedRequest,
  validToken,
} from '../security/security-helpers'
import { setFeature } from '../../src/core/feature-flags'

// Mock the policy service
vi.mock('../../src/services/policy.service', () => {
  const mockPolicies = [
    {
      id: 'policy-admin',
      name: 'Admin Full Access',
      description: 'Admin wildcard',
      effect: 'allow',
      principals: { roles: ['admin'] },
      actions: ['*'],
      resources: ['*'],
      priority: 100,
      builtIn: true,
      createdAt: '2026-03-12T00:00:00Z',
    },
    {
      id: 'policy-custom',
      name: 'Custom Read',
      description: 'Custom read-only',
      effect: 'allow',
      principals: { roles: ['viewer'] },
      actions: ['read'],
      resources: ['credentials'],
      priority: 50,
      builtIn: false,
      createdAt: '2026-03-12T00:00:00Z',
    },
  ]

  return {
    listPolicies: vi.fn().mockResolvedValue(mockPolicies),
    getPolicy: vi.fn().mockImplementation(async (id: string) => {
      return mockPolicies.find((p) => p.id === id) || null
    }),
    createPolicy: vi.fn().mockImplementation(async (data: any) => ({
      id: 'policy-new-123',
      ...data,
      builtIn: false,
      createdAt: new Date().toISOString(),
    })),
    updatePolicy: vi.fn().mockImplementation(async (id: string, data: any) => {
      const existing = mockPolicies.find((p) => p.id === id)
      if (!existing) return null
      if (existing.builtIn) throw new Error('Cannot modify built-in policy')
      return { ...existing, ...data }
    }),
    deletePolicy: vi.fn().mockImplementation(async (id: string) => {
      const existing = mockPolicies.find((p) => p.id === id)
      if (!existing) return false
      if (existing.builtIn) throw new Error('Cannot delete built-in policy')
      return true
    }),
    initializePolicies: vi.fn().mockResolvedValue(undefined),
    evaluatePolicy: vi.fn().mockReturnValue({ allowed: true, reason: 'wildcard' }),
  }
})

describe('Policy Routes', () => {
  let app: Express

  beforeAll(() => {
    app = createSecurityTestServer()
    // Enable policy engine feature flag
    setFeature('security.policy-engine', true)
  })

  afterAll(() => {
    setFeature('security.policy-engine', false)
  })

  describe('Feature flag gating', () => {
    it('should return 404 when policy engine is disabled', async () => {
      setFeature('security.policy-engine', false)
      try {
        const res = await authedRequest(app).get('/api/v1/policies')
        expect(res.status).toBe(404)
        expect(res.body.error).toMatch(/not enabled/i)
      } finally {
        setFeature('security.policy-engine', true)
      }
    })
  })

  describe('GET /api/v1/policies', () => {
    it('should require authentication', async () => {
      const res = await request(app).get('/api/v1/policies')
      expect(res.status).toBe(401)
    })

    it('should list all policies', async () => {
      const res = await authedRequest(app).get('/api/v1/policies')
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('policies')
      expect(Array.isArray(res.body.policies)).toBe(true)
      expect(res.body.policies.length).toBeGreaterThanOrEqual(1)
    })

    it('should accept API key authentication', async () => {
      const res = await request(app)
        .get('/api/v1/policies')
        .set('X-API-Key', process.env.API_KEY || 'test-api-key-12345')
      expect(res.status).not.toBe(401)
    })
  })

  describe('GET /api/v1/policies/:id', () => {
    it('should require authentication', async () => {
      const res = await request(app).get('/api/v1/policies/policy-admin')
      expect(res.status).toBe(401)
    })

    it('should return a policy by ID', async () => {
      const res = await authedRequest(app).get('/api/v1/policies/policy-admin')
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('id', 'policy-admin')
      expect(res.body).toHaveProperty('name')
      expect(res.body).toHaveProperty('effect')
    })

    it('should return 404 for nonexistent policy', async () => {
      const res = await authedRequest(app).get('/api/v1/policies/nonexistent-id')
      expect(res.status).toBe(404)
      expect(res.body.error).toMatch(/not found/i)
    })
  })

  describe('POST /api/v1/policies', () => {
    const validPolicy = {
      name: 'Test Policy',
      description: 'A test policy',
      effect: 'allow',
      principals: { roles: ['issuer'] },
      actions: ['issue'],
      resources: ['credentials'],
      priority: 50,
    }

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/v1/policies')
        .send(validPolicy)
      expect(res.status).toBe(401)
    })

    it('should require admin permission', async () => {
      const limitedToken = validToken('test-user', ['read'])
      const res = await request(app)
        .post('/api/v1/policies')
        .set('Authorization', `Bearer ${limitedToken}`)
        .send(validPolicy)
      expect(res.status).toBe(403)
    })

    it('should create a new policy', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/policies')
        .send(validPolicy)
      expect(res.status).toBe(201)
      expect(res.body).toHaveProperty('id')
      expect(res.body).toHaveProperty('name', 'Test Policy')
      expect(res.body).toHaveProperty('effect', 'allow')
    })

    it('should reject missing name', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/policies')
        .send({ ...validPolicy, name: undefined })
      expect(res.status).toBe(400)
    })

    it('should reject missing effect', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/policies')
        .send({ ...validPolicy, effect: undefined })
      expect(res.status).toBe(400)
    })

    it('should reject invalid effect value', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/policies')
        .send({ ...validPolicy, effect: 'maybe' })
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/effect/i)
    })

    it('should reject missing actions', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/policies')
        .send({ ...validPolicy, actions: undefined })
      expect(res.status).toBe(400)
    })

    it('should reject empty actions array', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/policies')
        .send({ ...validPolicy, actions: [] })
      expect(res.status).toBe(400)
    })

    it('should reject missing resources', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/policies')
        .send({ ...validPolicy, resources: undefined })
      expect(res.status).toBe(400)
    })

    it('should reject empty resources array', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/policies')
        .send({ ...validPolicy, resources: [] })
      expect(res.status).toBe(400)
    })
  })

  describe('PUT /api/v1/policies/:id', () => {
    it('should require authentication', async () => {
      const res = await request(app)
        .put('/api/v1/policies/policy-custom')
        .send({ name: 'Updated' })
      expect(res.status).toBe(401)
    })

    it('should require admin permission', async () => {
      const limitedToken = validToken('test-user', ['read'])
      const res = await request(app)
        .put('/api/v1/policies/policy-custom')
        .set('Authorization', `Bearer ${limitedToken}`)
        .send({ name: 'Updated' })
      expect(res.status).toBe(403)
    })

    it('should update a custom policy', async () => {
      const res = await authedRequest(app)
        .put('/api/v1/policies/policy-custom')
        .send({ name: 'Updated Custom Read' })
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('name')
    })

    it('should return 404 for nonexistent policy', async () => {
      const res = await authedRequest(app)
        .put('/api/v1/policies/nonexistent-id')
        .send({ name: 'Updated' })
      expect(res.status).toBe(404)
    })

    it('should return 400 when updating built-in policy', async () => {
      const res = await authedRequest(app)
        .put('/api/v1/policies/policy-admin')
        .send({ name: 'Hacked Admin' })
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/built-in/i)
    })
  })

  describe('DELETE /api/v1/policies/:id', () => {
    it('should require authentication', async () => {
      const res = await request(app).delete('/api/v1/policies/policy-custom')
      expect(res.status).toBe(401)
    })

    it('should require admin permission', async () => {
      const limitedToken = validToken('test-user', ['read'])
      const res = await request(app)
        .delete('/api/v1/policies/policy-custom')
        .set('Authorization', `Bearer ${limitedToken}`)
      expect(res.status).toBe(403)
    })

    it('should delete a custom policy', async () => {
      const res = await authedRequest(app).delete('/api/v1/policies/policy-custom')
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('success', true)
    })

    it('should return 404 for nonexistent policy', async () => {
      const res = await authedRequest(app).delete('/api/v1/policies/nonexistent-id')
      expect(res.status).toBe(404)
    })

    it('should return 400 when deleting built-in policy', async () => {
      const res = await authedRequest(app).delete('/api/v1/policies/policy-admin')
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/built-in/i)
    })
  })
})
