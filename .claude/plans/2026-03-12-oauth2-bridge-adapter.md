---
title: "OAuth 2.0 Bridge Adapter — RFC 8693 Token Exchange"
date: 2026-03-12
module: backend
related_todos: [012]
---

## Goal

Implement an OAuth 2.0 bridge adapter that enables VC ↔ OAuth token exchange per RFC 8693. AI agents can present a Verifiable Credential (JWT-VC or SD-JWT VC) and receive a short-lived OAuth access token with mapped scopes, enabling access to traditional OAuth-protected APIs.

## Research Findings

### Existing Patterns
- **Token generation**: `generateToken()` in `auth.middleware.ts` — uses `jsonwebtoken.sign()` with `JWT_SECRET`, returns JWT with `sub`, `permissions`, `exp`
- **Token introspection**: `POST /auth/introspect` already exists — verifies JWT, returns `{ active, sub, permissions, exp, iat }`
- **VC verification**: `openid4vp.service.ts` lines 602-782 — full VP/VC signature verification with `jose.jwtVerify()`, DID resolution via `resolvePublicKeyFromDid()`, revocation checks
- **Credential types with capabilities/scopes**: `AIAgentIdentityCredential` has `capabilities[]`, `DelegationCredential` has `scope[]`, `CapabilityCredential` has `actions[]`
- **Route mounting**: Auth routes at `/api/v1/auth` before `authenticateAny()` middleware — bridge routes should follow same pattern (token exchange endpoints are public per RFC 8693)
- **Revocation check**: `isCredentialRevoked()` + `getRevocationStatus()` — must check before issuing bridge token

### RFC 8693 Token Exchange
- **Grant type**: `urn:ietf:params:oauth:grant-type:token-exchange`
- **Subject token**: The VC JWT (credential being exchanged)
- **Subject token type**: `urn:ietf:params:oauth:token-type:jwt` (or custom `urn:ietf:params:oauth:token-type:vc+jwt`)
- **Response**: Standard OAuth token response with `access_token`, `token_type`, `expires_in`, `scope`, `issued_token_type`

### Scope Mapping Strategy
Map credential fields to OAuth scopes:
- `AIAgentIdentityCredential.capabilities` → scopes (e.g., `["read", "write"]` → `"read write"`)
- `DelegationCredential.scope` → scopes directly
- `CapabilityCredential.actions` → scopes (e.g., `["read", "execute"]` → `"read execute"`)
- Trust level can add prefixed scopes: `trust:verified`, `trust:certified`

## Implementation Steps

### Step 1: OAuth Bridge Service → `backend/src/services/oauth-bridge.service.ts` (NEW)
Core service with:
- `exchangeVCForToken(vcJwt, requestedScopes?)` — main exchange function
  1. Parse VC JWT (detect SD-JWT by `~` separator)
  2. Verify VC signature via `jose.jwtVerify()` + `resolvePublicKeyFromDid(issuerDid)`
  3. Check expiration (`exp` claim)
  4. Check revocation via `isCredentialRevoked()`
  5. Extract scopes from credential subject (capabilities/scope/actions)
  6. Filter by `requestedScopes` if provided (intersection)
  7. Generate short-lived OAuth token (5-15 min TTL) via `generateToken()`
  8. Return token response
- `mapCredentialToScopes(credentialType, credentialSubject)` — scope mapping logic
- `introspectBridgeToken(token)` — verify + return token metadata including `source_credential_type`
- Interface: `BridgeTokenResponse { access_token, token_type, expires_in, scope, issued_token_type }`
- Configurable scope mapping via `SCOPE_MAPPING` constant (credential type → field name)

### Step 2: Zod Validation Schemas → `backend/src/api/schemas/validation.schemas.ts` (MODIFY)
Add:
- `tokenExchangeSchema` — RFC 8693 request validation:
  - `grant_type: z.literal('urn:ietf:params:oauth:grant-type:token-exchange')`
  - `subject_token: z.string().min(1)` (the VC JWT)
  - `subject_token_type: z.string().min(1)` (token type URI)
  - `scope: z.string().optional()` (space-separated requested scopes)
  - `resource: z.string().url().optional()` (target API resource)
- `bridgeIntrospectSchema` — `{ token: z.string().min(1) }`

### Step 3: OAuth Bridge Routes → `backend/src/api/routes/oauth-bridge.routes.ts` (NEW)
4 endpoints:
- `POST /token-exchange` — RFC 8693 token exchange (VC → OAuth token)
  - Rate limited (authRateLimiter)
  - Validates with `tokenExchangeSchema`
  - Calls `exchangeVCForToken()`
- `POST /introspect` — Bridge token introspection
  - Returns active/inactive + scopes + source credential type
- `GET /scope-mappings` — List available scope mappings (public, informational)
  - Returns which credential types map to which scopes
- `GET /.well-known/oauth-bridge` — Bridge metadata discovery
  - Returns supported grant types, token types, available scopes

### Step 4: Mount Routes → `backend/src/api/server.ts` (MODIFY)
- Import and mount `oauthBridgeRoutes` at `/api/v1/oauth` before `authenticateAny()` middleware
  (token exchange endpoints are public — the VC itself is the authentication)

### Step 5: Frontend Integration → `frontend-issuer-verifier/src/pages/OAuthBridge.tsx` (NEW)
Simple admin UI to:
- Test token exchange (paste VC JWT → get OAuth token)
- View scope mappings
- Introspect bridge tokens
- Show exchange history (from audit log)

### Step 6: Frontend API + Routes → `frontend-issuer-verifier/src/services/api.ts` + `App.tsx` + `Layout.tsx` (MODIFY)
- Add `oauthBridgeApi` methods: `exchangeToken()`, `introspect()`, `getScopeMappings()`
- Add route `/oauth-bridge` with ProtectedRoute
- Add nav item in Layout

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `backend/src/services/oauth-bridge.service.ts` | Create | VC → OAuth token exchange, scope mapping, introspection (~200 lines) |
| `backend/src/api/routes/oauth-bridge.routes.ts` | Create | 4 endpoints: token-exchange, introspect, scope-mappings, well-known (~150 lines) |
| `backend/src/api/schemas/validation.schemas.ts` | Modify | Add tokenExchangeSchema, bridgeIntrospectSchema |
| `backend/src/api/server.ts` | Modify | Import + mount oauthBridgeRoutes before auth middleware |
| `frontend-issuer-verifier/src/pages/OAuthBridge.tsx` | Create | Admin UI for testing token exchange (~250 lines) |
| `frontend-issuer-verifier/src/services/api.ts` | Modify | Add oauthBridgeApi methods |
| `frontend-issuer-verifier/src/App.tsx` | Modify | Add /oauth-bridge route |
| `frontend-issuer-verifier/src/components/Layout.tsx` | Modify | Add nav item |

## Validation

1. **Token exchange with valid VC:**
```bash
# First get a credential (from previous issuance)
# Then exchange it for an OAuth token
curl -X POST http://localhost:3000/api/v1/oauth/token-exchange \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "urn:ietf:params:oauth:grant-type:token-exchange",
    "subject_token": "<VC_JWT_HERE>",
    "subject_token_type": "urn:ietf:params:oauth:token-type:jwt"
  }'
# Expected: { "access_token": "...", "token_type": "Bearer", "expires_in": 900, "scope": "read write", "issued_token_type": "urn:ietf:params:oauth:token-type:access_token" }
```

2. **Token exchange with revoked credential:**
```bash
# Should return 401 with error
curl -X POST http://localhost:3000/api/v1/oauth/token-exchange \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "urn:ietf:params:oauth:grant-type:token-exchange",
    "subject_token": "<REVOKED_VC_JWT>",
    "subject_token_type": "urn:ietf:params:oauth:token-type:jwt"
  }'
# Expected: 401 { "error": "invalid_grant", "error_description": "Credential has been revoked" }
```

3. **Introspect bridge token:**
```bash
curl -X POST http://localhost:3000/api/v1/oauth/introspect \
  -H "Content-Type: application/json" \
  -d '{"token": "<BRIDGE_TOKEN>"}'
# Expected: { "active": true, "sub": "did:key:z...", "scope": "read write", "exp": ..., "source_credential_type": "AIAgentIdentityCredential" }
```

4. **TypeScript**: `cd backend && npx tsc --noEmit` + `cd frontend-issuer-verifier && npx tsc --noEmit`

## Risks

1. **VC signature verification performance**: Each token exchange requires DID resolution + signature verification. DID cache (5 min TTL) mitigates this. Bridge tokens should be reused within their TTL rather than re-exchanged.
2. **Scope escalation**: Requested scopes must be an intersection with credential scopes, never a superset. The service must enforce this strictly.
3. **Bridge token replay**: Short TTL (15 min default) limits replay window. Tokens include `jti` for potential tracking. No nonce needed since the VC itself authenticates the request.
4. **SD-JWT handling**: SD-JWT VCs have disclosures after `~` separators. The service must parse the JWT part for verification while preserving the full combined string for scope extraction from disclosed claims.
