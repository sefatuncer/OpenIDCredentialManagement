import request from 'supertest'
import { Express } from 'express'
import {
  createSecurityTestServer,
  authedRequest,
} from '../security/security-helpers'

// Mock schemaRegistry service
vi.mock('../../src/services/schemaRegistry.service', () => {
  const mockSchemas = [
    {
      id: 'AIAgentIdentityCredential',
      name: 'AI Agent Identity',
      version: '1.0.0',
      type: 'AIAgentIdentityCredential',
      description: 'Identity credential for AI agents',
      required: ['agentId', 'agentName'],
      context: ['https://www.w3.org/2018/credentials/v1'],
      credentialSubject: {
        properties: {
          agentId: { type: 'string', description: 'Agent identifier' },
          agentName: { type: 'string', description: 'Agent name' },
        },
      },
      active: true,
      createdAt: '2026-03-12T00:00:00Z',
    },
    {
      id: 'DelegationCredential',
      name: 'Delegation',
      version: '1.0.0',
      type: 'DelegationCredential',
      description: 'Delegation credential',
      required: ['delegatorDid'],
      context: ['https://www.w3.org/2018/credentials/v1'],
      credentialSubject: {
        properties: {
          delegatorDid: { type: 'string' },
        },
      },
      active: true,
      createdAt: '2026-03-12T00:00:00Z',
    },
  ]

  return {
    schemaRegistry: {
      getAllSchemas: vi.fn().mockResolvedValue(mockSchemas),
      getSchema: vi.fn().mockImplementation(async (id: string) => {
        return mockSchemas.find((s) => s.id === id) || null
      }),
      registerSchema: vi.fn().mockImplementation(async (data: any) => {
        if (mockSchemas.find((s) => s.id === data.id)) {
          throw new Error(`Schema '${data.id}' already exists`)
        }
        return {
          ...data,
          active: true,
          createdAt: new Date().toISOString(),
        }
      }),
      updateSchema: vi.fn().mockImplementation(async (id: string, data: any) => {
        const existing = mockSchemas.find((s) => s.id === id)
        if (!existing) throw new Error(`Schema '${id}' not found`)
        return { ...existing, ...data }
      }),
      deactivateSchema: vi.fn().mockImplementation(async (id: string) => {
        return mockSchemas.some((s) => s.id === id)
      }),
      initialize: vi.fn().mockResolvedValue(undefined),
    },
  }
})

describe('Schema Routes', () => {
  let app: Express

  beforeAll(() => {
    app = createSecurityTestServer()
  })

  describe('GET /api/v1/schemas', () => {
    it('should require authentication', async () => {
      const res = await request(app).get('/api/v1/schemas')
      expect(res.status).toBe(401)
    })

    it('should list all schemas', async () => {
      const res = await authedRequest(app).get('/api/v1/schemas')
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('schemas')
      expect(Array.isArray(res.body.schemas)).toBe(true)
      expect(res.body.schemas.length).toBeGreaterThanOrEqual(1)
    })

    it('should accept API key authentication', async () => {
      const res = await request(app)
        .get('/api/v1/schemas')
        .set('X-API-Key', process.env.API_KEY || 'test-api-key-12345')
      expect(res.status).not.toBe(401)
    })
  })

  describe('GET /api/v1/schemas/:id', () => {
    it('should require authentication', async () => {
      const res = await request(app).get('/api/v1/schemas/AIAgentIdentityCredential')
      expect(res.status).toBe(401)
    })

    it('should return a schema by ID', async () => {
      const res = await authedRequest(app).get('/api/v1/schemas/AIAgentIdentityCredential')
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('schema')
      expect(res.body.schema).toHaveProperty('id', 'AIAgentIdentityCredential')
      expect(res.body.schema).toHaveProperty('name')
      expect(res.body.schema).toHaveProperty('version')
    })

    it('should return 404 for nonexistent schema', async () => {
      const res = await authedRequest(app).get('/api/v1/schemas/NonexistentSchema')
      expect(res.status).toBe(404)
      expect(res.body.error).toMatch(/not found/i)
    })

    it('should truncate long schema IDs to 100 chars', async () => {
      const longId = 'A'.repeat(200)
      const res = await authedRequest(app).get(`/api/v1/schemas/${longId}`)
      // Should not crash — the route slices to 100 chars
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/v1/schemas', () => {
    const validSchema = {
      id: 'TestCredential',
      name: 'Test Credential Schema',
      version: '1.0.0',
      type: 'TestCredential',
      description: 'A test schema for unit testing',
      required: ['field1'],
      credentialSubject: {
        type: 'TestSubject',
        properties: {
          field1: { type: 'string', description: 'Test field' },
        },
      },
    }

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/v1/schemas')
        .send(validSchema)
      expect(res.status).toBe(401)
    })

    it('should create a new schema', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/schemas')
        .send(validSchema)
      expect(res.status).toBe(201)
      expect(res.body).toHaveProperty('schema')
      expect(res.body.schema).toHaveProperty('id', 'TestCredential')
    })

    it('should return 409 when schema already exists', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/schemas')
        .send({
          ...validSchema,
          id: 'AIAgentIdentityCredential',
          type: 'AIAgentIdentityCredential',
        })
      expect(res.status).toBe(409)
      expect(res.body.error).toMatch(/already exists/i)
    })

    it('should reject missing id', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/schemas')
        .send({ ...validSchema, id: undefined })
      expect(res.status).toBe(400)
    })

    it('should reject missing name', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/schemas')
        .send({ ...validSchema, name: undefined })
      expect(res.status).toBe(400)
    })

    it('should reject invalid version format', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/schemas')
        .send({ ...validSchema, version: 'not-semver' })
      expect(res.status).toBe(400)
    })

    it('should accept valid semver versions', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/schemas')
        .send({ ...validSchema, id: 'SemverTest', version: '2.1.0' })
      expect(res.status).toBe(201)
    })

    it('should reject empty id', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/schemas')
        .send({ ...validSchema, id: '' })
      expect(res.status).toBe(400)
    })

    it('should reject missing type', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/schemas')
        .send({ ...validSchema, type: undefined })
      expect(res.status).toBe(400)
    })

    it('should reject missing description', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/schemas')
        .send({ ...validSchema, description: undefined })
      expect(res.status).toBe(400)
    })
  })

  describe('PUT /api/v1/schemas/:id', () => {
    it('should require authentication', async () => {
      const res = await request(app)
        .put('/api/v1/schemas/AIAgentIdentityCredential')
        .send({ name: 'Updated Name' })
      expect(res.status).toBe(401)
    })

    it('should update an existing schema', async () => {
      const res = await authedRequest(app)
        .put('/api/v1/schemas/AIAgentIdentityCredential')
        .send({ name: 'Updated AI Agent Identity' })
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('schema')
    })

    it('should return 404 for nonexistent schema', async () => {
      const res = await authedRequest(app)
        .put('/api/v1/schemas/NonexistentSchema')
        .send({ name: 'Updated' })
      expect(res.status).toBe(404)
      expect(res.body.error).toMatch(/not found/i)
    })
  })

  describe('DELETE /api/v1/schemas/:id', () => {
    it('should require authentication', async () => {
      const res = await request(app).delete('/api/v1/schemas/AIAgentIdentityCredential')
      expect(res.status).toBe(401)
    })

    it('should deactivate an existing schema', async () => {
      const res = await authedRequest(app).delete('/api/v1/schemas/AIAgentIdentityCredential')
      expect(res.status).toBe(200)
      expect(res.body).toHaveProperty('success', true)
    })

    it('should return 404 for nonexistent schema', async () => {
      const res = await authedRequest(app).delete('/api/v1/schemas/NonexistentSchema')
      expect(res.status).toBe(404)
      expect(res.body.error).toMatch(/not found/i)
    })

    it('should truncate long IDs to 100 chars', async () => {
      const longId = 'B'.repeat(200)
      const res = await authedRequest(app).delete(`/api/v1/schemas/${longId}`)
      // Should not crash
      expect(res.status).toBe(404)
    })
  })
})
