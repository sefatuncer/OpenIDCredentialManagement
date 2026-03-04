import { storage, UserRole } from './storage';
import { env } from '../config/env';

export interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  role: UserRole | null;
  did: string | null;
}

let refreshPromise: Promise<boolean> | null = null;
let sessionCheckInterval: number | null = null;

export const auth = {
  getState(): AuthState {
    const token = storage.getToken();
    const role = storage.getRole();
    const did = storage.getDID();

    // Check token expiry
    if (token && storage.isTokenExpired()) {
      this.logout();
      return {
        isAuthenticated: false,
        token: null,
        role: null,
        did: null,
      };
    }

    return {
      isAuthenticated: !!token,
      token,
      role,
      did,
    };
  },

  login(token: string, role: UserRole, did: string, expiresInMs?: number): void {
    storage.setToken(token, expiresInMs || 60 * 60 * 1000); // Default 1 hour
    storage.setRole(role);
    storage.setDID(did);
    storage.updateLastActivity();
    this.startSessionCheck();
  },

  logout(): void {
    this.stopSessionCheck();
    storage.clearAll();
  },

  switchRole(role: UserRole): void {
    storage.setRole(role);
  },

  isAuthenticated(): boolean {
    const token = storage.getToken();
    if (!token) return false;
    if (storage.isTokenExpired()) {
      this.logout();
      return false;
    }
    return true;
  },

  getToken(): string | null {
    return storage.getToken();
  },

  getRole(): UserRole | null {
    return storage.getRole();
  },

  getDID(): string | null {
    return storage.getDID();
  },

  // Token refresh
  async refreshToken(): Promise<boolean> {
    // Prevent multiple simultaneous refresh attempts
    if (refreshPromise) {
      return refreshPromise;
    }

    refreshPromise = this._doRefresh();
    try {
      return await refreshPromise;
    } finally {
      refreshPromise = null;
    }
  },

  async _doRefresh(): Promise<boolean> {
    // Backend does not have /auth/refresh endpoint
    // Token refresh is not supported - user must re-login
    return false;
  },

  shouldRefreshToken(): boolean {
    return storage.isTokenExpiringSoon(env.TOKEN_REFRESH_THRESHOLD);
  },

  // Session management
  startSessionCheck(): void {
    if (sessionCheckInterval) return;

    sessionCheckInterval = window.setInterval(() => {
      // Check session timeout
      if (storage.isSessionExpired(env.SESSION_TIMEOUT)) {
        this.logout();
        window.location.href = '/login?reason=session_expired';
        return;
      }

      // Check token expiry and refresh if needed
      if (this.shouldRefreshToken()) {
        this.refreshToken();
      }
    }, 60 * 1000); // Check every minute
  },

  stopSessionCheck(): void {
    if (sessionCheckInterval) {
      clearInterval(sessionCheckInterval);
      sessionCheckInterval = null;
    }
  },

  // Update activity on user interaction
  trackActivity(): void {
    storage.updateLastActivity();
  },
};

// Track activity on window events
if (typeof window !== 'undefined') {
  ['click', 'keypress', 'scroll', 'mousemove'].forEach((event) => {
    window.addEventListener(event, () => auth.trackActivity(), { passive: true });
  });
}
