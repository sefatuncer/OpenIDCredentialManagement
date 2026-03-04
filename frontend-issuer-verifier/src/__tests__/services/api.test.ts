import { describe, it, expect, vi, beforeEach } from 'vitest';
import { issuerApi, verifierApi, revocationApi, healthApi } from '../../services/api';
import { auth } from '../../services/auth';

// Mock auth module
vi.mock('../../services/auth', () => ({
  auth: {
    isAuthenticated: vi.fn(),
    shouldRefreshToken: vi.fn(),
    refreshToken: vi.fn(),
    getToken: vi.fn(),
    logout: vi.fn(),
  },
}));

// Mock env
vi.mock('../../config/env', () => ({
  env: {
    API_BASE_URL: 'http://localhost:3000/api/v1',
    TOKEN_REFRESH_THRESHOLD: 5 * 60 * 1000,
    SESSION_TIMEOUT: 30 * 60 * 1000,
    APP_NAME: 'SSI Dashboard',
  },
}));

// Mock toast
vi.mock('../../hooks/useToast', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('API Service', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;

    // Default: authenticated user
    vi.mocked(auth.isAuthenticated).mockReturnValue(true);
    vi.mocked(auth.shouldRefreshToken).mockReturnValue(false);
    vi.mocked(auth.getToken).mockReturnValue('test-token');
  });

  describe('Token ile request', () => {
    it('Authorization header eklemeli', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ did: 'did:key:test' }),
      });

      await issuerApi.getDID();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/issuer/did',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('token yoksa Authorization header eklememeli', async () => {
      vi.mocked(auth.getToken).mockReturnValue(null);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok' }),
      });

      await healthApi.check();

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].headers.Authorization).toBeUndefined();
    });
  });

  describe('401 Unauthorized handling', () => {
    it('401 response\'da logout yapmalı', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      });

      const result = await issuerApi.getDID();

      expect(auth.logout).toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Session expired');
    });
  });

  describe('Error handling', () => {
    it('API hatası durumunda error dönmeli', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal server error' }),
      });

      const result = await issuerApi.getDID();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Internal server error');
    });

    it('network hatası durumunda error dönmeli', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await issuerApi.getDID();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('bilinmeyen hata durumunda "Connection error" dönmeli', async () => {
      mockFetch.mockRejectedValueOnce('Unknown error');

      const result = await issuerApi.getDID();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection error');
    });
  });

  describe('Invalid session handling', () => {
    it('authenticated değilse ve auth endpoint değilse invalid session dönmeli', async () => {
      vi.mocked(auth.isAuthenticated).mockReturnValue(false);

      const result = await issuerApi.getDID();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid session');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Token refresh', () => {
    it('token refresh gerekiyorsa refresh denemeli', async () => {
      vi.mocked(auth.shouldRefreshToken).mockReturnValue(true);
      vi.mocked(auth.refreshToken).mockResolvedValue(true);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ did: 'did:key:test' }),
      });

      await issuerApi.getDID();

      expect(auth.refreshToken).toHaveBeenCalled();
    });

    it('token refresh başarısız olursa logout yapmalı', async () => {
      vi.mocked(auth.shouldRefreshToken).mockReturnValue(true);
      vi.mocked(auth.refreshToken).mockResolvedValue(false);

      const result = await issuerApi.getDID();

      expect(auth.logout).toHaveBeenCalled();
      expect(result.success).toBe(false);
    });
  });

  describe('Issuer API', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });
    });

    it('getDID çağrısı yapmalı', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ did: 'did:key:issuer' }),
      });

      const result = await issuerApi.getDID();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/issuer/did',
        expect.any(Object)
      );
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ did: 'did:key:issuer' });
    });

    it('issueAgentIdentity POST request yapmalı', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          credentialOfferId: 'offer-123',
          credentialOfferUri: 'openid-credential-offer://...',
        }),
      });

      const data = {
        holderDid: 'did:key:holder',
        agentId: 'agent-001',
        agentType: 'autonomous' as const,
        ownerDid: 'did:key:owner',
      };

      await issuerApi.issueAgentIdentity(data);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/issuer/credentials/agent-identity',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(data),
        })
      );
    });
  });

  describe('Verifier API', () => {
    it('getDID çağrısı yapmalı', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ did: 'did:key:verifier' }),
      });

      const result = await verifierApi.getDID();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/verifier/did',
        expect.any(Object)
      );
      expect(result.data).toEqual({ did: 'did:key:verifier' });
    });

    it('verifyAgentIdentity POST request yapmalı', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          sessionId: 'session-123',
          requestUri: 'openid-vc://...',
          qrData: 'qr-data',
        }),
      });

      await verifierApi.verifyAgentIdentity({ challenge: 'test-challenge' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/verifier/verify/agent-identity',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ challenge: 'test-challenge' }),
        })
      );
    });

    it('getResult çağrısı yapmalı', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          status: 'completed',
          result: { verified: true, credentials: [] },
        }),
      });

      const result = await verifierApi.getResult('session-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/verifier/verify/session-123/result',
        expect.any(Object)
      );
      expect(result.data?.status).toBe('completed');
    });
  });

  describe('Revocation API', () => {
    it('revoke POST request yapmalı', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });

      await revocationApi.revoke({
        credentialId: 'cred-123',
        reason: 'Key compromised',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/revocation/revoke',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            credentialId: 'cred-123',
            reason: 'Key compromised',
          }),
        })
      );
    });

    it('checkStatus GET request yapmalı', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ revoked: false }),
      });

      const result = await revocationApi.checkStatus('cred-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/revocation/status/cred-123',
        expect.any(Object)
      );
      expect(result.data?.revoked).toBe(false);
    });
  });

  describe('Health API', () => {
    it('health check yapmalı', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok' }),
      });

      const result = await healthApi.check();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/health',
        expect.any(Object)
      );
      expect(result.data?.status).toBe('ok');
    });
  });
});
