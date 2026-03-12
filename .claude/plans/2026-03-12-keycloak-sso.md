---
title: "Keycloak OAuth2/OIDC SSO + VC-Based Machine Authentication"
date: 2026-03-12
module: all
related_todos: [030]
---

## Goal
Keycloak'ı SSO identity provider olarak entegre et. İnsan kullanıcılar OIDC login ile, makine istemciler VC-based client_credentials ile authenticate olsun. Mevcut API key + JWT dual-auth korunsun (backward compat).

## Research Findings

### Mevcut Auth Mimarisi
- **`auth.middleware.ts`**: `authenticateAny()` → JWT first, then API key fallback. `AuthenticatedRequest` interface (agentDid, role, permissions)
- **`auth.routes.ts`**: `POST /auth/token` (client_credentials grant), `POST /auth/introspect` — env-based client secrets
- **`server.ts`**: Mount order: OAuth bridge (no auth, line ~380) → rate limiter → `authenticateAny` → all routes
- **`Login.tsx`**: API key login with role selector (issuer/verifier), no SSO option
- **`auth.ts` (frontend service)**: `login()` → `POST /auth/login`, sessionStorage token, no refresh support
- **`docker-compose.dev.yml`**: postgres, backend, web-wallet, issuer-verifier — no Keycloak

### Keycloak Entegrasyon Stratejisi
- **Keycloak 25.x** Docker container, realm auto-import via JSON
- Backend: OIDC token validation (Keycloak public key / JWKS endpoint)
- Frontend: OIDC Authorization Code Flow with PKCE (keycloak-js veya openid-client)
- Backward compat: `authenticateAny()` → 3 strategy chain: Keycloak JWT → local JWT → API key

### İlgili Patterns
- `setIssuer()` callback pattern (circular dep avoidance) — Keycloak service de aynı pattern kullanabilir
- OAuth 2.0 Bridge (`.claude/solutions/oauth2-bridge-rfc8693.md`) — token exchange zaten var, Keycloak token'ları da exchange edilebilir
- Envelope encryption — Keycloak client secret'ları da env var'dan gelmeli

## Implementation Steps

### Step 1: Keycloak Docker Setup → `docker-compose.dev.yml`, `backend/docker/keycloak/`
- Keycloak 25.x service ekle (port 8080)
- Realm import JSON: `ssi-realm` with 2 clients (`ssi-backend`, `ssi-frontend`)
- Default roles: `issuer`, `verifier`, `holder`
- 2 test user: `issuer-admin` (issuer role), `verifier-admin` (verifier role)

### Step 2: Backend Keycloak Service → `backend/src/services/keycloak.service.ts`
- JWKS endpoint'ten Keycloak public key fetch (cache with TTL)
- `validateKeycloakToken(token: string)` → decode + verify + role extraction
- Realm role → system role mapping (`realm_access.roles`)
- Config: `KEYCLOAK_REALM_URL`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET` env vars

### Step 3: Auth Middleware Extension → `backend/src/api/middleware/auth.middleware.ts`
- `authenticateAny()` chain: Keycloak JWT → local JWT → API key (3-strategy)
- Keycloak JWT detection: `iss` claim matches `KEYCLOAK_REALM_URL`
- `AuthenticatedRequest` genişlet: `authMethod: 'keycloak' | 'jwt' | 'apikey'`
- Token refresh: backend-side token introspection for Keycloak tokens

### Step 4: Auth Routes Extension → `backend/src/api/routes/auth.routes.ts`
- `GET /auth/keycloak/config` → public endpoint returning realm URL, client ID (frontend config)
- `POST /auth/keycloak/callback` → authorization code → token exchange → local session
- `POST /auth/token` güncelle: Keycloak service account tokens da kabul edilsin

### Step 5: Frontend OIDC Integration → `frontend-issuer-verifier/src/`
- `services/keycloak.ts` → Keycloak JS adapter init, login/logout/token refresh
- `Login.tsx` → "SSO ile Giriş" butonu + mevcut API key login korunsun
- `App.tsx` → `KeycloakProvider` wrapper, auto-refresh token
- `services/auth.ts` → `isKeycloakAuth()` check, dual session support
- `services/api.ts` → Bearer token source: Keycloak token || local token

### Step 6: Web Wallet Keycloak (Optional/Light) → `web-wallet/src/`
- Wallet holder'lar için Keycloak opsiyonel (DID-based auth birincil)
- `services/api.service.ts` → Keycloak token support if configured
- Login page'e "Kurumsal Giriş" seçeneği

### Step 7: Validation & Zod Schemas → `backend/src/api/schemas/validation.schemas.ts`
- `keycloakConfigSchema` (env var validation)
- `keycloakCallbackSchema` (authorization code + state + nonce)

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `docker-compose.dev.yml` | Modify | Keycloak service + volume ekle |
| `backend/docker/keycloak/ssi-realm.json` | Create | Realm import (clients, roles, test users) |
| `backend/src/services/keycloak.service.ts` | Create | JWKS fetch, token validation, role mapping |
| `backend/src/api/middleware/auth.middleware.ts` | Modify | 3-strategy auth chain |
| `backend/src/api/routes/auth.routes.ts` | Modify | Keycloak config + callback endpoints |
| `backend/src/api/schemas/validation.schemas.ts` | Modify | Keycloak Zod schemas |
| `frontend-issuer-verifier/src/services/keycloak.ts` | Create | Keycloak JS adapter |
| `frontend-issuer-verifier/src/pages/Login.tsx` | Modify | SSO login button |
| `frontend-issuer-verifier/src/App.tsx` | Modify | KeycloakProvider |
| `frontend-issuer-verifier/src/services/auth.ts` | Modify | Dual session support |
| `frontend-issuer-verifier/src/services/api.ts` | Modify | Token source selection |
| `frontend-issuer-verifier/package.json` | Modify | keycloak-js dependency |
| `backend/.env.example` | Modify | Keycloak env vars |

## Validation

1. `docker compose -f docker-compose.dev.yml up keycloak` → Keycloak admin console http://localhost:8080
2. Keycloak'ta `ssi-realm` otomatik import edilmiş olmalı
3. Frontend'de "SSO ile Giriş" → Keycloak login page → redirect back → dashboard
4. API key login hâlâ çalışmalı (backward compat)
5. `curl -H "Authorization: Bearer <keycloak-token>" http://localhost:3000/api/agents` → 200
6. `curl -H "X-API-Key: <api-key>" http://localhost:3000/api/agents` → 200 (eski yol)
7. TypeScript: `cd backend && npx tsc --noEmit` + `cd frontend-issuer-verifier && npx tsc --noEmit`

## Risks

1. **Keycloak boot time**: İlk başlatmada realm import 10-15s sürebilir → health check + depends_on
2. **Token format çakışması**: Keycloak JWT ile local JWT aynı `iss` kullanırsa ayırt edilemez → Keycloak `iss` her zaman realm URL içerir, local JWT `iss` farklı
3. **Frontend bundle size**: keycloak-js ~50KB → lazy load ile minimize et
4. **CORS**: Keycloak redirects için frontend origin'in Keycloak'ta Web Origins'e eklenmesi gerekir
5. **Offline**: Keycloak down ise sadece API key auth çalışır — graceful degradation gerekli
