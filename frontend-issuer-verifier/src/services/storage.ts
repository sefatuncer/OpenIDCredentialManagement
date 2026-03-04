/**
 * Secure Session Storage
 * Uses sessionStorage instead of localStorage for XSS protection.
 * Token automatically cleared when tab/browser is closed.
 */

const STORAGE_KEYS = {
  AUTH_TOKEN: 'ssi_dashboard_token',
  TOKEN_EXPIRY: 'ssi_dashboard_token_expiry',
  USER_ROLE: 'ssi_dashboard_role',
  USER_DID: 'ssi_dashboard_did',
  LAST_ACTIVITY: 'ssi_dashboard_last_activity',
} as const;

export type UserRole = 'issuer' | 'verifier';

// Use sessionStorage for sensitive data (cleared on tab close)
// This provides better XSS protection than localStorage
const secureStorage = sessionStorage;

export const storage = {
  getToken(): string | null {
    return secureStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
  },

  setToken(token: string, expiresInMs?: number): void {
    secureStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
    if (expiresInMs) {
      const expiry = Date.now() + expiresInMs;
      secureStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRY, expiry.toString());
    }
  },

  removeToken(): void {
    secureStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
    secureStorage.removeItem(STORAGE_KEYS.TOKEN_EXPIRY);
  },

  getTokenExpiry(): number | null {
    const expiry = secureStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRY);
    return expiry ? parseInt(expiry, 10) : null;
  },

  isTokenExpired(): boolean {
    const expiry = this.getTokenExpiry();
    if (!expiry) return false;
    return Date.now() > expiry;
  },

  isTokenExpiringSoon(thresholdMs: number): boolean {
    const expiry = this.getTokenExpiry();
    if (!expiry) return false;
    return Date.now() > expiry - thresholdMs;
  },

  getRole(): UserRole | null {
    return secureStorage.getItem(STORAGE_KEYS.USER_ROLE) as UserRole | null;
  },

  setRole(role: UserRole): void {
    secureStorage.setItem(STORAGE_KEYS.USER_ROLE, role);
  },

  removeRole(): void {
    secureStorage.removeItem(STORAGE_KEYS.USER_ROLE);
  },

  getDID(): string | null {
    return secureStorage.getItem(STORAGE_KEYS.USER_DID);
  },

  setDID(did: string): void {
    secureStorage.setItem(STORAGE_KEYS.USER_DID, did);
  },

  removeDID(): void {
    secureStorage.removeItem(STORAGE_KEYS.USER_DID);
  },

  // Session activity tracking
  updateLastActivity(): void {
    secureStorage.setItem(STORAGE_KEYS.LAST_ACTIVITY, Date.now().toString());
  },

  getLastActivity(): number | null {
    const activity = secureStorage.getItem(STORAGE_KEYS.LAST_ACTIVITY);
    return activity ? parseInt(activity, 10) : null;
  },

  isSessionExpired(timeoutMs: number): boolean {
    const lastActivity = this.getLastActivity();
    if (!lastActivity) return false;
    return Date.now() - lastActivity > timeoutMs;
  },

  clearAll(): void {
    secureStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
    secureStorage.removeItem(STORAGE_KEYS.TOKEN_EXPIRY);
    secureStorage.removeItem(STORAGE_KEYS.USER_ROLE);
    secureStorage.removeItem(STORAGE_KEYS.USER_DID);
    secureStorage.removeItem(STORAGE_KEYS.LAST_ACTIVITY);
  },
};
