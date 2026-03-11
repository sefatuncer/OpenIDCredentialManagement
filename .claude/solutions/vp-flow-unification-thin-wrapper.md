---
title: "VP Flow Unification via Thin Wrapper Pattern"
tags: [openid4vp, architecture, refactoring, credo, session-management]
category: architecture
difficulty: medium
date: 2026-03-11
---

## Problem

Two separate VP (Verifiable Presentation) implementations existed:
- `verifier.agent.ts` — Used by frontend, in-memory Map sessions, Draft 11 spec, missing `request_uri` route
- `openid4vp.service.ts` — Spec-compliant Draft 13+, PostgreSQL sessions, full route coverage, unused by frontends

Dual implementation caused: maintenance burden, inconsistent session storage (ephemeral vs persistent), missing routes (wallet couldn't fetch authorization request), and two different URI formats.

## Approach

**Thin Wrapper pattern:** Keep the existing route structure (`/verifier/verify/*`) but make `verifier.agent.ts` delegate all VP logic to `openid4vp.service.ts`. This preserves the frontend API contract while consolidating implementation.

Key decisions:
1. **Don't change frontend code** — Map response shapes in the wrapper instead
2. **Remove duplicate logic** — Delete in-memory Map, VP token verification, session management from verifier.agent
3. **Keep presentation definitions as exports** — Routes still import them from verifier.agent
4. **Handle both URI formats in holder** — Add inline params parsing alongside request_uri fetch

## Key Details

### Files Changed
- `verifier.agent.ts` — 385→155 lines (-60%). Only keeps: agent lifecycle, DID, presentation definition exports, two wrapper functions
- `holder.agent.ts` — Added inline URI params parsing for Jose fallback (Draft 13+ compatibility)
- `openid4vp.routes.ts` — Removed duplicate `direct_post` (kept global one in server.ts)
- `verifier.routes.ts` — Minimal change (removed unused import)

### Wrapper Implementation
```typescript
// verifier.agent.ts delegates to openid4vp.service.ts
export async function createVerificationRequest(pd: PresentationDefinition) {
  const result = await openid4vpCreateAuthRequest('', { customDefinition: pd })
  return {
    requestUri: result.authorizationRequestUri,      // Map field name
    verificationSessionId: result.sessionId,          // Map field name
  }
}
```

### Holder Inline Params Support
```typescript
if (requestUri) {
  // request_uri pattern: fetch from endpoint
  const response = await fetch(requestUri)
  // ...parse authRequest
} else {
  // Inline params pattern (Draft 13+)
  presentationDefinition = JSON.parse(url.searchParams.get('presentation_definition'))
  nonce = url.searchParams.get('nonce')
  submitUrl = url.searchParams.get('response_uri')
}
```

## Lessons Learned

1. **Test route existence before generating URIs** — The old `verifier.agent.ts` generated `request_uri` pointing to `/api/v1/verifier/request/{sessionId}` but no route existed. Always verify that generated URLs have matching route handlers.

2. **Wrapper pattern preserves API contracts** — When consolidating parallel implementations, a thin wrapper that maps field names is simpler and safer than changing all consumers.

3. **Session storage must persist** — In-memory Map sessions are lost on restart. Use the storage adapter (PostgreSQL) for anything that crosses request boundaries (VP sessions, credential offers).

4. **`direct_post` must be unauthenticated and unique** — OpenID4VP spec requires wallets to POST without auth. Having two `direct_post` routes (one global, one under auth middleware) was confusing.

## Prevention

- When adding a new protocol flow, always implement it in ONE service file (not agent + service)
- Agent files should manage identity (DID, keys) only — delegate protocol logic to services
- Before generating URIs with endpoint paths, grep for the route handler to confirm it exists
- Always use `asyncHandler()` for async Express route handlers — caught by review as P1
