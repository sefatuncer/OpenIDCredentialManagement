/**
 * Keycloak OIDC Service for Frontend
 * Handles Authorization Code Flow with PKCE — no keycloak-js dependency.
 */

import { env } from '../config/env';

interface KeycloakConfig {
  enabled: boolean;
  realmUrl: string;
  clientId: string;
}

let cachedConfig: KeycloakConfig | null = null;

/**
 * Fetch Keycloak config from backend
 */
export async function getKeycloakConfig(): Promise<KeycloakConfig> {
  if (cachedConfig) return cachedConfig;

  try {
    const res = await fetch(`${env.API_BASE_URL}/auth/keycloak/config`);
    if (!res.ok) {
      cachedConfig = { enabled: false, realmUrl: '', clientId: '' };
      return cachedConfig;
    }
    const data = await res.json();
    cachedConfig = {
      enabled: data.enabled === true,
      realmUrl: data.realmUrl || '',
      clientId: data.clientId || '',
    };
    return cachedConfig;
  } catch {
    cachedConfig = { enabled: false, realmUrl: '', clientId: '' };
    return cachedConfig;
  }
}

/**
 * Generate PKCE code verifier + challenge
 */
async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const verifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return { verifier, challenge };
}

/**
 * Initiate Keycloak login — redirect to Keycloak auth page
 */
export async function startKeycloakLogin(): Promise<void> {
  const config = await getKeycloakConfig();
  if (!config.enabled) throw new Error('Keycloak SSO not configured');

  const { verifier, challenge } = await generatePKCE();
  const state = crypto.randomUUID();
  const redirectUri = `${window.location.origin}/login`;

  // Store PKCE verifier + state for callback
  sessionStorage.setItem('kc_code_verifier', verifier);
  sessionStorage.setItem('kc_state', state);
  sessionStorage.setItem('kc_redirect_uri', redirectUri);

  const authUrl = new URL(`${config.realmUrl}/protocol/openid-connect/auth`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', config.clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('scope', 'openid profile email');
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  window.location.href = authUrl.toString();
}

/**
 * Handle Keycloak callback — exchange code for tokens via backend
 */
export async function handleKeycloakCallback(
  code: string,
  state: string,
): Promise<{
  accessToken: string;
  role: string;
  sub: string;
  username?: string;
  email?: string;
} | null> {
  // Verify state
  const savedState = sessionStorage.getItem('kc_state');
  if (state !== savedState) {
    console.error('Keycloak state mismatch');
    return null;
  }

  const redirectUri = sessionStorage.getItem('kc_redirect_uri') || `${window.location.origin}/login`;
  const codeVerifier = sessionStorage.getItem('kc_code_verifier');

  // Clean up
  sessionStorage.removeItem('kc_code_verifier');
  sessionStorage.removeItem('kc_state');
  sessionStorage.removeItem('kc_redirect_uri');

  if (!codeVerifier) {
    console.error('Missing PKCE code verifier');
    return null;
  }

  try {
    const res = await fetch(`${env.API_BASE_URL}/auth/keycloak/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirectUri, codeVerifier }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    return {
      accessToken: data.access_token,
      role: data.role,
      sub: data.sub,
      username: data.username,
      email: data.email,
    };
  } catch {
    return null;
  }
}

/**
 * Keycloak logout — redirect to Keycloak end session endpoint
 */
export async function keycloakLogout(): Promise<void> {
  const config = await getKeycloakConfig();
  if (!config.enabled) return;

  const redirectUri = `${window.location.origin}/login`;
  const logoutUrl = `${config.realmUrl}/protocol/openid-connect/logout?post_logout_redirect_uri=${encodeURIComponent(redirectUri)}&client_id=${encodeURIComponent(config.clientId)}`;
  window.location.href = logoutUrl;
}

/**
 * Check if current login was via Keycloak
 */
export function isKeycloakAuth(): boolean {
  return sessionStorage.getItem('ssi_dashboard_auth_method') === 'keycloak';
}

export function setKeycloakAuth(isKc: boolean): void {
  if (isKc) {
    sessionStorage.setItem('ssi_dashboard_auth_method', 'keycloak');
  } else {
    sessionStorage.removeItem('ssi_dashboard_auth_method');
  }
}
