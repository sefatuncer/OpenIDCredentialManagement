import { describe, it, expect, vi, beforeEach } from 'vitest';
import { auth } from '../../services/auth';
import { storage } from '../../services/storage';

// Mock storage module
vi.mock('../../services/storage', () => ({
  storage: {
    getToken: vi.fn(),
    setToken: vi.fn(),
    removeToken: vi.fn(),
    getTokenExpiry: vi.fn(),
    isTokenExpired: vi.fn(),
    isTokenExpiringSoon: vi.fn(),
    getRole: vi.fn(),
    setRole: vi.fn(),
    removeRole: vi.fn(),
    getDID: vi.fn(),
    setDID: vi.fn(),
    removeDID: vi.fn(),
    updateLastActivity: vi.fn(),
    getLastActivity: vi.fn(),
    isSessionExpired: vi.fn(),
    clearAll: vi.fn(),
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

describe('auth service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('login()', () => {
    it('token, role ve DID kaydetmeli', () => {
      const token = 'test-token-123';
      const role = 'issuer' as const;
      const did = 'did:key:z6MkTest';
      const expiresInMs = 3600000;

      auth.login(token, role, did, expiresInMs);

      expect(storage.setToken).toHaveBeenCalledWith(token, expiresInMs);
      expect(storage.setRole).toHaveBeenCalledWith(role);
      expect(storage.setDID).toHaveBeenCalledWith(did);
      expect(storage.updateLastActivity).toHaveBeenCalled();
    });

    it('expiresInMs verilmezse default 1 saat kullanmalı', () => {
      auth.login('token', 'verifier', 'did:key:test');

      expect(storage.setToken).toHaveBeenCalledWith('token', 60 * 60 * 1000);
    });
  });

  describe('logout()', () => {
    it('tüm storage verilerini temizlemeli', () => {
      auth.logout();

      expect(storage.clearAll).toHaveBeenCalled();
    });
  });

  describe('isAuthenticated()', () => {
    it('token varsa ve expire olmamışsa true dönmeli', () => {
      vi.mocked(storage.getToken).mockReturnValue('valid-token');
      vi.mocked(storage.isTokenExpired).mockReturnValue(false);

      expect(auth.isAuthenticated()).toBe(true);
    });

    it('token yoksa false dönmeli', () => {
      vi.mocked(storage.getToken).mockReturnValue(null);

      expect(auth.isAuthenticated()).toBe(false);
    });

    it('token expire olmuşsa false dönmeli ve logout yapmalı', () => {
      vi.mocked(storage.getToken).mockReturnValue('expired-token');
      vi.mocked(storage.isTokenExpired).mockReturnValue(true);

      expect(auth.isAuthenticated()).toBe(false);
      expect(storage.clearAll).toHaveBeenCalled();
    });
  });

  describe('getState()', () => {
    it('authenticated state dönmeli', () => {
      vi.mocked(storage.getToken).mockReturnValue('test-token');
      vi.mocked(storage.getRole).mockReturnValue('issuer');
      vi.mocked(storage.getDID).mockReturnValue('did:key:test');
      vi.mocked(storage.isTokenExpired).mockReturnValue(false);

      const state = auth.getState();

      expect(state).toEqual({
        isAuthenticated: true,
        token: 'test-token',
        role: 'issuer',
        did: 'did:key:test',
      });
    });

    it('token expire olmuşsa logout state dönmeli', () => {
      vi.mocked(storage.getToken).mockReturnValue('expired-token');
      vi.mocked(storage.isTokenExpired).mockReturnValue(true);

      const state = auth.getState();

      expect(state).toEqual({
        isAuthenticated: false,
        token: null,
        role: null,
        did: null,
      });
      expect(storage.clearAll).toHaveBeenCalled();
    });
  });

  describe('getToken()', () => {
    it('storage\'dan token dönmeli', () => {
      vi.mocked(storage.getToken).mockReturnValue('my-token');

      expect(auth.getToken()).toBe('my-token');
    });
  });

  describe('getRole()', () => {
    it('storage\'dan role dönmeli', () => {
      vi.mocked(storage.getRole).mockReturnValue('verifier');

      expect(auth.getRole()).toBe('verifier');
    });
  });

  describe('getDID()', () => {
    it('storage\'dan DID dönmeli', () => {
      vi.mocked(storage.getDID).mockReturnValue('did:key:z6MkTest');

      expect(auth.getDID()).toBe('did:key:z6MkTest');
    });
  });

  describe('switchRole()', () => {
    it('role\'ü değiştirmeli', () => {
      auth.switchRole('verifier');

      expect(storage.setRole).toHaveBeenCalledWith('verifier');
    });
  });

  describe('shouldRefreshToken()', () => {
    it('token yakında expire olacaksa true dönmeli', () => {
      vi.mocked(storage.isTokenExpiringSoon).mockReturnValue(true);

      expect(auth.shouldRefreshToken()).toBe(true);
    });

    it('token henüz expire olmayacaksa false dönmeli', () => {
      vi.mocked(storage.isTokenExpiringSoon).mockReturnValue(false);

      expect(auth.shouldRefreshToken()).toBe(false);
    });
  });

  describe('refreshToken()', () => {
    it('backend refresh desteklemediği için false dönmeli', async () => {
      const result = await auth.refreshToken();

      expect(result).toBe(false);
    });
  });

  describe('trackActivity()', () => {
    it('storage\'da last activity güncellemeli', () => {
      auth.trackActivity();

      expect(storage.updateLastActivity).toHaveBeenCalled();
    });
  });
});
