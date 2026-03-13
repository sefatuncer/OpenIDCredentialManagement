import { Express } from 'express';
import request from 'supertest';
import { createServer } from '../src/api/server';
import { generateToken } from '../src/api/middleware/auth.middleware';

/**
 * Create a test server instance
 */
export function createTestServer(): Express {
  return createServer();
}

/**
 * Generate a valid JWT token for testing
 */
export function getTestToken(
  permissions: string[] = ['*'],
  sub: string = 'test-user'
): string {
  return generateToken({ sub, permissions });
}

/**
 * Create an authenticated request agent
 */
export function authenticatedRequest(app: Express) {
  const token = getTestToken();
  return {
    get: (url: string) =>
      request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string) =>
      request(app).post(url).set('Authorization', `Bearer ${token}`),
    put: (url: string) =>
      request(app).put(url).set('Authorization', `Bearer ${token}`),
    delete: (url: string) =>
      request(app).delete(url).set('Authorization', `Bearer ${token}`),
  };
}

/**
 * Create an API key authenticated request agent
 */
export function apiKeyRequest(app: Express, apiKey: string = 'test-api-key-12345') {
  return {
    get: (url: string) => request(app).get(url).set('X-API-Key', apiKey),
    post: (url: string) => request(app).post(url).set('X-API-Key', apiKey),
    put: (url: string) => request(app).put(url).set('X-API-Key', apiKey),
    delete: (url: string) => request(app).delete(url).set('X-API-Key', apiKey),
  };
}

/**
 * Test data generators
 */
export const testData = {
  validDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
  invalidDid: 'not-a-valid-did',

  agentIdentityCredential: {
    holderDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    agentId: 'test-agent-001',
    agentType: 'autonomous' as const,
    agentName: 'Test Agent',
    agentVersion: '1.0.0',
    capabilities: ['text-generation'],
    ownerDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    ownerName: 'Test Owner',
    trustLevel: 'basic' as const,
  },

  delegationCredential: {
    holderDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    delegatorDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    delegatorName: 'Test Delegator',
    delegateDid: 'did:key:z6MkpTHR8VNs5zYQ3B5LdTKzXHE5g5hFz4Z9vWbGHcJ8KfNL',
    delegateName: 'Test Delegate',
    scope: ['read:documents'],
    purpose: 'Testing',
  },

  capabilityCredential: {
    holderDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    capabilityType: 'api-access',
    resource: '/api/test/*',
    actions: ['read', 'write'],
  },
};
