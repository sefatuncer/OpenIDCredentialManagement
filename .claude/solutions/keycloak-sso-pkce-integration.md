---
title: "Keycloak SSO with PKCE — Multi-Strategy Auth Chain"
tags: [keycloak, sso, oidc, pkce, auth, middleware, docker]
category: security
difficulty: hard
date: 2026-03-12
---

## Problem
System had only 2 auth strategies (local JWT + API key). Enterprise users needed SSO via Keycloak while maintaining backward compatibility. Key challenges:
1. OIDC Authorization Code Flow with PKCE for browser-based SPA
2. 3-strategy auth chain without breaking existing clients
3. Dual client architecture: public frontend client (PKCE) vs confidential backend client (JWKS validation)
4. Graceful degradation when Keycloak is not configured

## Approach

### Auth Chain: Keycloak → Local JWT → API Key
`authenticateAny()` middleware checks Bearer tokens in order:
1. Decode JWT `iss` claim (no verification) — if matches Keycloak realm URL, validate via JWKS
2. If not Keycloak or validation fails, try local JWT (jsonwebtoken + JWT_SECRET)
3. If no Bearer, try `X-API-Key` header

### PKCE Flow (Frontend → Keycloak → Backend)
```
Frontend                    Keycloak                   Backend
   │                           │                          │
   ├─ GET /auth/keycloak/config ─────────────────────────▶│ (get realmUrl + clientId)
   │◀─ { realmUrl, clientId } ────────────────────────────┤
   │                           │                          │
   ├─ Generate PKCE (verifier + SHA256 challenge)         │
   ├─ Store verifier + state in sessionStorage            │
   ├─ Redirect → Keycloak /auth ──────▶│                  │
   │         (client_id=ssi-frontend,  │                  │
   │          code_challenge=...,      │                  │
   │          code_challenge_method=S256)                  │
   │◀── Redirect back with code+state ─┤                  │
   │                                    │                  │
   ├─ POST /auth/keycloak/callback ───────────────────────▶│
   │  { code, redirectUri, codeVerifier }                  │
   │                                    │◀── POST /token ──┤ (client_id=ssi-frontend,
   │                                    │    code_verifier) │  code_verifier=...)
   │                                    ├── access_token ──▶│
   │                                    │                   ├─ Validate via JWKS
   │                                    │                   ├─ Extract roles
   │◀── { access_token (local JWT), role, sub } ───────────┤ Issue local JWT
```

### Critical: Client ID Separation
- `ssi-frontend` (public, PKCE) — used for auth request URL + code exchange
- `ssi-backend` (confidential, client_secret) — used for JWKS token validation + service-to-service
- **P1 caught in review:** Initial implementation used `ssi-backend` client_id for code exchange, but the code was bound to `ssi-frontend`. Fixed by passing `frontendClientId` + `codeVerifier` through the exchange.

### Keycloak Docker Setup
- Keycloak 25.x with realm auto-import (`--import-realm`)
- Shares PostgreSQL with backend (separate `keycloak` schema via `KC_DB_SCHEMA`)
- Health check with 60s start_period (realm import takes time)
- Test users with realm roles mapped to system roles

## Key Details

- `backend/src/services/keycloak.service.ts` — JWKS cache (10min TTL), `validateKeycloakToken()`, `exchangeAuthorizationCode()`, `isKeycloakToken()` (iss check)
- `backend/src/api/routes/keycloak-auth.routes.ts` — `/config` (public) + `/callback` (rate-limited, Zod-validated)
- `backend/src/api/middleware/auth.middleware.ts` — `authenticateAny()` async 3-strategy chain, `authMethod` field
- `frontend-issuer-verifier/src/services/keycloak.ts` — Native PKCE (crypto.subtle), no keycloak-js dependency
- `frontend-issuer-verifier/src/pages/Login.tsx` — SSO button + API key login coexist
- `backend/docker/keycloak/ssi-realm.json` — Realm with 3 clients, 4 roles, 2 test users
- `docker-compose.dev.yml` — Keycloak service on port 8080

## Lessons Learned

1. **PKCE code_verifier must travel with the code.** Frontend stores it, must send it to backend for exchange. Without it, Keycloak rejects the token request. Always trace the full PKCE flow end-to-end.
2. **Authorization code is bound to requesting client_id.** If frontend auth URL uses `ssi-frontend`, the token exchange MUST also use `ssi-frontend`. Backend cannot swap in its own confidential client_id.
3. **Audience in Keycloak tokens may not include backend client_id.** When token is issued to `ssi-frontend`, `aud` is `ssi-frontend`. Backend validation should retry without audience check or use issuer-only validation.
4. **No extra npm dependencies needed for PKCE.** Native `crypto.subtle.digest('SHA-256', ...)` + `crypto.getRandomValues()` + `crypto.randomUUID()` are sufficient. Avoids keycloak-js (~50KB).
5. **Separate route file when adding significant endpoint group.** Keycloak routes added ~130L — extracting to `keycloak-auth.routes.ts` kept `auth.routes.ts` under 300L.

## Prevention

- When implementing OIDC code exchange, always verify client_id is the same in both auth request and token exchange
- When adding PKCE, trace the code_verifier from generation → storage → transmission → exchange in one pass
- For multi-client setups, clearly separate which client_id is used where: frontend (public, PKCE) vs backend (confidential, JWKS)
- Always add new IdP as optional (env var gated) with graceful fallback to existing auth
