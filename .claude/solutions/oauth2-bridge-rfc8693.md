---
title: "OAuth 2.0 Bridge — RFC 8693 VC-to-Token Exchange"
tags: [oauth, rfc8693, token-exchange, bridge, scope-mapping, vc, jwt]
category: architecture
difficulty: medium
date: 2026-03-12
---

## Problem

AI agents holding Verifiable Credentials need access to traditional OAuth 2.0 protected APIs. No bridge existed between the VC ecosystem and OAuth token-based authorization.

## Approach

Implemented RFC 8693 Token Exchange: agents present a VC JWT and receive a short-lived OAuth access token with mapped scopes. The VC itself serves as authentication — no prior OAuth credentials needed.

Key design decisions:
1. **Public endpoints** — token-exchange and introspect mounted before `authenticateAny()` middleware, since the VC is the authentication
2. **Scope mapping** — credential type fields map to OAuth scopes: `capabilities` (AIAgent), `scope` (Delegation), `actions` (Capability)
3. **Trust level augmentation** — `trust_level` field adds extra scopes (`trust:basic`, `trust:verified`, `trust:certified`)
4. **Short TTL** — 15-minute bridge tokens limit replay window
5. **Scope intersection** — requested scopes are intersected with credential scopes, never a superset

## Key Details

### Files
- `backend/src/services/oauth-bridge.service.ts` — VC parsing, signature verification, scope mapping, token generation (~215 lines)
- `backend/src/api/routes/oauth-bridge.routes.ts` — 4 endpoints: token-exchange, introspect, scope-mappings, well-known (~125 lines)
- `backend/src/api/schemas/validation.schemas.ts` — `tokenExchangeSchema`, `bridgeIntrospectSchema`
- `frontend-issuer-verifier/src/pages/OAuthBridge.tsx` — 3-tab admin UI (exchange, introspect, mappings)

### Endpoint Mount Pattern
OAuth bridge routes are mounted at `/api/v1/oauth` **before** both `defaultRateLimiter` and `authenticateAny()`. Individual routes apply `authRateLimiter` as needed (token-exchange, introspect).

### Verification Pipeline
`parseVCJwt()` → `verifyVCSignature()` (jose + DID resolution) → `checkExpiration()` → `isCredentialRevoked()` → `mapCredentialToScopes()` → `generateToken()`

### SD-JWT Handling
SD-JWT VCs are detected by `~` separator. Only the JWT part (before first `~`) is parsed and verified. Scope extraction uses the decoded payload directly.

## Lessons Learned

1. **Rate limiting gap with pre-auth routes**: Routes mounted before the global rate limiter bypass it entirely. Each pre-auth endpoint must explicitly add its own rate limiter middleware. Caught in review — introspect endpoint initially had no rate limiting.
2. **Data source duplication**: Trust level definitions were duplicated between service and routes. Fixed by having the service export a single `getScopeMappings()` that includes both credential mappings and trust levels — routes just pass through.
3. **Token verification reuse**: The `generateToken()` function from `auth.middleware.ts` produces standard JWTs that can be verified with plain `jsonwebtoken.verify()`. No need for a separate verification utility — the routes file imports `jsonwebtoken` directly.

## Prevention

- When mounting routes before global middleware (rate limiter, auth), always add per-route rate limiting explicitly
- When the same data is needed in service and routes, export it from the service — never duplicate constants
- When building pre-auth endpoints, add `authRateLimiter` to each endpoint individually during initial implementation, not as a review fix
