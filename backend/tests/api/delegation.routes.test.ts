import request from 'supertest';
import { Express } from 'express';
import {
  createSecurityTestServer,
  authedRequest,
  apiKeyReq,
} from '../security/security-helpers';

// Mock delegation service
vi.mock('../../src/services/delegation.service', () => ({
  createDelegation: vi.fn(),
  getDelegationById: vi.fn(),
  getDelegations: vi.fn(),
  revokeDelegation: vi.fn(),
  verifyDelegation: vi.fn(),
  createSubDelegation: vi.fn(),
  getDelegationChain: vi.fn(),
}));

import * as delegationService from '../../src/services/delegation.service';

const mockedService = delegationService as anyed<typeof delegationService>;

const VALID_DID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
const VALID_DID_2 = 'did:key:z6MkpTHR8VNs5zYQ3B5LdTKzXHE5g5hFz4Z9vWbGHcJ8KfNL';

const validDelegationBody = {
  delegatorDid: VALID_DID,
  delegateeToDid: VALID_DID_2,
  scope: {
    actions: ['read', 'write'],
    resources: ['/data/*'],
  },
  duration: 'P30D',
  revocable: true,
};

const mockDelegation = {
  id: 'deleg-001',
  delegatorDid: VALID_DID,
  delegateeToDid: VALID_DID_2,
  scope: validDelegationBody.scope,
  duration: 'P30D',
  revocable: true,
  status: 'active',
  createdAt: new Date().toISOString(),
};

describe('Delegation Routes', () => {
  let app: Express;

  beforeAll(() => {
    app = createSecurityTestServer();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── POST /api/v1/delegations ──────────────────────────────────────────

  describe('POST /api/v1/delegations', () => {
    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/v1/delegations')
        .send(validDelegationBody);
      expect(res.status).toBe(401);
    });

    it('should create a delegation with valid body', async () => {
      mockedService.createDelegation.mockResolvedValue(mockDelegation as any);

      const res = await authedRequest(app)
        .post('/api/v1/delegations')
        .send(validDelegationBody);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.delegation).toBeDefined();
      expect(mockedService.createDelegation).toHaveBeenCalledWith(
        VALID_DID,
        expect.objectContaining({ delegateeToDid: VALID_DID_2 }),
      );
    });

    it('should accept API key authentication', async () => {
      mockedService.createDelegation.mockResolvedValue(mockDelegation as any);

      const res = await apiKeyReq(app)
        .post('/api/v1/delegations')
        .send(validDelegationBody);

      expect(res.status).not.toBe(401);
    });

    it('should return 400 when delegatorDid is missing', async () => {
      const { delegatorDid, ...body } = validDelegationBody;

      const res = await authedRequest(app)
        .post('/api/v1/delegations')
        .send(body);

      expect(res.status).toBe(400);
    });

    it('should return 400 when delegateeToDid is missing', async () => {
      const { delegateeToDid, ...body } = validDelegationBody;

      const res = await authedRequest(app)
        .post('/api/v1/delegations')
        .send(body);

      expect(res.status).toBe(400);
    });

    it('should return 400 when scope.actions is empty', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/delegations')
        .send({
          ...validDelegationBody,
          scope: { actions: [], resources: ['/data/*'] },
        });

      expect(res.status).toBe(400);
    });

    it('should return 400 when scope.resources is empty', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/delegations')
        .send({
          ...validDelegationBody,
          scope: { actions: ['read'], resources: [] },
        });

      expect(res.status).toBe(400);
    });

    it('should return 400 when duration format is invalid', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/delegations')
        .send({ ...validDelegationBody, duration: '30days' });

      expect(res.status).toBe(400);
    });

    it('should return 404 when delegator agent not found', async () => {
      mockedService.createDelegation.mockRejectedValue(
        new Error('Delegator agent not found'),
      );

      const res = await authedRequest(app)
        .post('/api/v1/delegations')
        .send(validDelegationBody);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('not_found');
    });
  });

  // ── GET /api/v1/delegations/:id ───────────────────────────────────────

  describe('GET /api/v1/delegations/:id', () => {
    it('should require authentication', async () => {
      const res = await request(app).get('/api/v1/delegations/deleg-001');
      expect(res.status).toBe(401);
    });

    it('should return delegation by ID', async () => {
      mockedService.getDelegationById.mockResolvedValue(mockDelegation as any);

      const res = await authedRequest(app).get('/api/v1/delegations/deleg-001');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('deleg-001');
    });

    it('should return 404 when delegation not found', async () => {
      mockedService.getDelegationById.mockResolvedValue(null as any);

      const res = await authedRequest(app).get('/api/v1/delegations/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('not_found');
    });
  });

  // ── GET /api/v1/delegations/agent/:did ────────────────────────────────

  describe('GET /api/v1/delegations/agent/:did', () => {
    it('should require authentication', async () => {
      const res = await request(app).get(
        `/api/v1/delegations/agent/${encodeURIComponent(VALID_DID)}`,
      );
      expect(res.status).toBe(401);
    });

    it('should list delegations for an agent', async () => {
      mockedService.getDelegations.mockResolvedValue({
        given: [mockDelegation],
        received: [],
      } as any);

      const res = await authedRequest(app).get(
        `/api/v1/delegations/agent/${encodeURIComponent(VALID_DID)}`,
      );

      expect(res.status).toBe(200);
      expect(res.body.given).toHaveLength(1);
      expect(res.body.received).toHaveLength(0);
    });
  });

  // ── POST /api/v1/delegations/:id/revoke ───────────────────────────────

  describe('POST /api/v1/delegations/:id/revoke', () => {
    const revokeBody = { revokedBy: VALID_DID, reason: 'test revocation' };

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/v1/delegations/deleg-001/revoke')
        .send(revokeBody);
      expect(res.status).toBe(401);
    });

    it('should revoke a delegation', async () => {
      mockedService.revokeDelegation.mockResolvedValue(true as any);

      const res = await authedRequest(app)
        .post('/api/v1/delegations/deleg-001/revoke')
        .send(revokeBody);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when revokedBy is missing', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/delegations/deleg-001/revoke')
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 400 when revoke fails (not authorized)', async () => {
      mockedService.revokeDelegation.mockResolvedValue(false as any);

      const res = await authedRequest(app)
        .post('/api/v1/delegations/deleg-001/revoke')
        .send(revokeBody);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('revoke_failed');
    });

    it('should return 400 when delegation is not revocable', async () => {
      mockedService.revokeDelegation.mockRejectedValue(
        new Error('This delegation is not revocable'),
      );

      const res = await authedRequest(app)
        .post('/api/v1/delegations/deleg-001/revoke')
        .send(revokeBody);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('not_revocable');
    });

    it('should support cascade revocation', async () => {
      mockedService.revokeDelegation.mockResolvedValue(true as any);

      const res = await authedRequest(app)
        .post('/api/v1/delegations/deleg-001/revoke')
        .send({ ...revokeBody, cascade: true });

      expect(res.status).toBe(200);
      expect(mockedService.revokeDelegation).toHaveBeenCalledWith(
        'deleg-001',
        VALID_DID,
        'test revocation',
        true,
      );
    });
  });

  // ── POST /api/v1/delegations/:id/verify ───────────────────────────────

  describe('POST /api/v1/delegations/:id/verify', () => {
    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/v1/delegations/deleg-001/verify')
        .send({ action: 'read' });
      expect(res.status).toBe(401);
    });

    it('should verify a delegation for an action', async () => {
      mockedService.verifyDelegation.mockResolvedValue({
        valid: true,
        delegationId: 'deleg-001',
      } as any);

      const res = await authedRequest(app)
        .post('/api/v1/delegations/deleg-001/verify')
        .send({ action: 'read', resource: '/data/reports' });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
    });

    it('should return 400 when action is missing', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/delegations/deleg-001/verify')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // ── POST /api/v1/delegations/:id/sub-delegate ────────────────────────

  describe('POST /api/v1/delegations/:id/sub-delegate', () => {
    const subDelegateBody = {
      delegatorDid: VALID_DID_2,
      delegateeDid: VALID_DID,
      scope: {
        actions: ['read'],
        resources: ['/data/*'],
      },
      duration: 'P7D',
    };

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/v1/delegations/deleg-001/sub-delegate')
        .send(subDelegateBody);
      expect(res.status).toBe(401);
    });

    it('should create a sub-delegation', async () => {
      mockedService.createSubDelegation.mockResolvedValue({
        id: 'deleg-002',
        parentDelegationId: 'deleg-001',
        ...subDelegateBody,
      } as any);

      const res = await authedRequest(app)
        .post('/api/v1/delegations/deleg-001/sub-delegate')
        .send(subDelegateBody);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.delegation).toBeDefined();
    });

    it('should return 400 when parent delegation not found', async () => {
      mockedService.createSubDelegation.mockRejectedValue(
        new Error('Parent delegation not found'),
      );

      const res = await authedRequest(app)
        .post('/api/v1/delegations/deleg-001/sub-delegate')
        .send(subDelegateBody);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('sub_delegation_error');
    });

    it('should return 400 when scope exceeds parent scope', async () => {
      mockedService.createSubDelegation.mockRejectedValue(
        new Error('Action "delete" not in parent scope'),
      );

      const res = await authedRequest(app)
        .post('/api/v1/delegations/deleg-001/sub-delegate')
        .send(subDelegateBody);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('sub_delegation_error');
    });

    it('should return 400 when max delegation depth exceeded', async () => {
      mockedService.createSubDelegation.mockRejectedValue(
        new Error('Maximum delegation depth exceeded'),
      );

      const res = await authedRequest(app)
        .post('/api/v1/delegations/deleg-001/sub-delegate')
        .send(subDelegateBody);

      expect(res.status).toBe(400);
    });

    it('should return 400 when parent delegation is revoked', async () => {
      mockedService.createSubDelegation.mockRejectedValue(
        new Error('Parent delegation has been revoked'),
      );

      const res = await authedRequest(app)
        .post('/api/v1/delegations/deleg-001/sub-delegate')
        .send(subDelegateBody);

      expect(res.status).toBe(400);
    });

    it('should return 400 when scope actions is empty', async () => {
      const res = await authedRequest(app)
        .post('/api/v1/delegations/deleg-001/sub-delegate')
        .send({
          ...subDelegateBody,
          scope: { actions: [], resources: ['/data/*'] },
        });

      expect(res.status).toBe(400);
    });
  });

  // ── GET /api/v1/delegations/:id/chain ─────────────────────────────────

  describe('GET /api/v1/delegations/:id/chain', () => {
    it('should require authentication', async () => {
      const res = await request(app).get('/api/v1/delegations/deleg-001/chain');
      expect(res.status).toBe(401);
    });

    it('should return delegation chain', async () => {
      const chain = [mockDelegation, { ...mockDelegation, id: 'deleg-002' }];
      mockedService.getDelegationChain.mockResolvedValue(chain as any);

      const res = await authedRequest(app).get('/api/v1/delegations/deleg-001/chain');

      expect(res.status).toBe(200);
      expect(res.body.chain).toHaveLength(2);
      expect(res.body.depth).toBe(2);
    });

    it('should return 404 when chain is empty (delegation not found)', async () => {
      mockedService.getDelegationChain.mockResolvedValue([]);

      const res = await authedRequest(app).get('/api/v1/delegations/nonexistent/chain');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('not_found');
    });
  });
});
