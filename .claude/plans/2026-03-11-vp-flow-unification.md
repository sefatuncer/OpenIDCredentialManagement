---
title: "VP Flow Unification — Consolidate verifier.agent.ts + openid4vp.service.ts"
date: 2026-03-11
module: all
related_todos: [008, 007]
---

## Goal

Consolidate the two separate VP (Verifiable Presentation) implementations into a single unified flow. `openid4vp.service.ts` becomes the sole VP engine; `verifier.agent.ts` becomes a thin wrapper that delegates to it. Frontend and wallet continue to work without API changes.

## Research Findings

### Current State — Two Parallel VP Flows

| Aspect | `verifier.agent.ts` | `openid4vp.service.ts` |
|--------|---------------------|------------------------|
| **Routes** | `/api/v1/verifier/verify/*` | `/api/v1/openid4vp/*` |
| **Used by** | Frontend verifier dashboard | Nothing (unused by frontends) |
| **Storage** | In-memory `Map` (lost on restart) | `IStorageAdapter` (PostgreSQL/memory) |
| **URI format** | `request_uri` pattern | Inline params OR Credo `request_uri` |
| **Spec version** | Draft 11 (`redirect_uri`) | Draft 13+ (`response_uri`, `client_id_scheme`) |
| **Credo support** | Yes (Credo-first) | Yes (Credo-first) |
| **direct_post** | Missing — no submission endpoint | Full `handleDirectPost()` |
| **Session expiry** | None | 5-minute cleanup |
| **Presentation defs** | Hardcoded in file (4 definitions) | `PRESENTATION_DEFINITIONS` map |

### Critical Bugs in Current verifier.agent.ts

1. **Missing route:** `getAuthorizationRequest()` generates `request_uri` pointing to `/api/v1/verifier/request/{sessionId}` but **no route serves this endpoint**. Wallets cannot fetch the authorization request.
2. **No direct_post:** No callback/submission endpoint for wallets to POST VP tokens back.
3. **Ephemeral sessions:** In-memory Map lost on restart, no expiry.

### Why openid4vp.service.ts is the Better Foundation

- Persistent storage (PostgreSQL)
- Spec-compliant Draft 13+ fields
- Complete route coverage (direct_post, sessions, results)
- Session expiry and cleanup
- Credo-first delegation already implemented
- Already has predefined presentation definitions
- Client metadata endpoint

### Frontend API Contract (Must Preserve)

The frontend calls these endpoints (from `frontend-issuer-verifier/src/services/api.ts`):
```typescript
verifierApi.verifyAgentIdentity() → POST /api/v1/verifier/verify/agent-identity
verifierApi.verifyDelegation()    → POST /api/v1/verifier/verify/delegation
verifierApi.verifyCombined()      → POST /api/v1/verifier/verify/combined
verifierApi.getResult(sessionId)  → GET  /api/v1/verifier/verify/{sessionId}/result
```

Expected response shape:
```typescript
{ success: boolean, requestUri: string, verificationSessionId: string }
```

### Wallet API Contract (Must Preserve)

The wallet calls:
```typescript
presentCredential(uri) → POST /api/v1/holder/credentials/present
```
With `verificationRequestUri` from QR scan. The holder.agent.ts handles this.

## Implementation Steps

### Step 1: Merge Presentation Definitions → `openid4vp.service.ts`

Move the 4 hardcoded definitions from `verifier.agent.ts` into `PRESENTATION_DEFINITIONS` in `openid4vp.service.ts`.

**Definitions to add:**
- `agent-identity-verification` (exists as `agent-identity` — verify & merge)
- `delegation-verification`
- `capability-verification`
- `combined-verification`

→ `backend/src/services/openid4vp.service.ts`

### Step 2: Rewire `verifier.agent.ts` as Thin Wrapper

Replace `createVerificationRequest()` in `verifier.agent.ts` to delegate to `openid4vp.service.ts` instead of building its own authorization request. Map the response format.

```typescript
// verifier.agent.ts — new createVerificationRequest
export async function createVerificationRequest(
  presentationDefinition: PresentationDefinition
): Promise<{ requestUri: string; verificationSessionId: string }> {
  const result = await openid4vpCreateAuthRequest(null, {
    customDefinition: presentationDefinition,
  })
  return {
    requestUri: result.authorizationRequestUri,
    verificationSessionId: result.sessionId,
  }
}
```

→ `backend/src/agents/verifier.agent.ts`

### Step 3: Rewire `verifyPresentation()` and `getVerificationSessionById()`

These should look up sessions from `openid4vp.service.ts` instead of the local Map.

```typescript
export async function verifyPresentation(sessionId: string): Promise<VerificationResult> {
  const result = await openid4vpGetResult(sessionId)
  if (!result) return { verified: false, errors: ['Session not found'] }
  return result
}
```

→ `backend/src/agents/verifier.agent.ts`

### Step 4: Remove Dead Code from `verifier.agent.ts`

Remove the now-unused:
- `verificationSessions` Map
- `getAuthorizationRequest()` (never had a route)
- `submitPresentation()` (replaced by direct_post)
- `verifyVpToken()` (replaced by openid4vp.service verification)
- `getVerificationSession()` (replaced by service lookup)
- `getAllVerificationSessions()` (replaced by service list)

Keep:
- `initializeVerifierAgent()`, `getVerifierAgent()`, `getVerifierDid()` (still used)
- All 4 presentation definition exports (used by routes)
- `createVerificationRequest()` (now a thin wrapper)
- `verifyPresentation()` (now delegates to service)

→ `backend/src/agents/verifier.agent.ts`

### Step 5: Update `verifier.routes.ts` Result Endpoint

The result endpoint should use the service's `getVerificationResult()` for unified lookup:

```typescript
verifierRoutes.get('/verify/:sessionId/result', asyncHandler(async (req, res) => {
  const result = await getVerificationResult(req.params.sessionId)
  if (!result) return res.status(404).json({ error: 'Session not found' })
  res.json(result)
}))
```

→ `backend/src/api/routes/verifier.routes.ts`

### Step 6: Update Frontend Response Shape (if needed)

Check if `openid4vp.service.ts` response fields match what frontend expects. The service returns `{ sessionId, authorizationRequest, authorizationRequestUri }` — the wrapper in step 2 maps this to `{ requestUri, verificationSessionId }`.

No frontend changes needed — the wrapper handles the mapping.

### Step 7: Verify holder.agent.ts Compatibility

The `presentCredential()` in `holder.agent.ts` already handles both URI formats:
- Credo-first (handles Credo `request_uri` format)
- Jose fallback parses `request_uri` from `openid4vp://` URI and fetches it

When Credo is active: Credo handles everything end-to-end.
When Jose fallback: The `openid4vp.service.ts` inline URI format embeds `presentation_definition` directly — but `holder.agent.ts` expects `request_uri` to fetch.

**Fix needed:** In Jose fallback mode, `holder.agent.ts` needs to also handle inline params (no `request_uri`). Add parsing for inline `presentation_definition` param.

→ `backend/src/agents/holder.agent.ts`

### Step 8: Clean Up Duplicate direct_post

Remove the duplicate `direct_post` route from `openid4vp.routes.ts` (line 286-331). Keep only the global one in `server.ts` (line 358) which is registered before auth middleware.

→ `backend/src/api/routes/openid4vp.routes.ts`

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `backend/src/services/openid4vp.service.ts` | Modify | Add 4 presentation definitions from verifier.agent |
| `backend/src/agents/verifier.agent.ts` | Modify | Replace with thin wrapper delegating to openid4vp.service |
| `backend/src/api/routes/verifier.routes.ts` | Modify | Update result endpoint to use service |
| `backend/src/api/routes/openid4vp.routes.ts` | Modify | Remove duplicate direct_post route |
| `backend/src/agents/holder.agent.ts` | Modify | Handle inline URI params (no request_uri) for Jose fallback |

**No frontend or wallet changes needed** — API contracts preserved by wrapper mapping.

## Validation

### 1. Frontend Verifier Flow (Credo mode)
```bash
# Create verification request
curl -s -X POST http://localhost:3000/api/v1/verifier/verify/agent-identity \
  -H "x-api-key: dev-api-key-docker-only" | jq '.requestUri, .verificationSessionId'

# Should return: openid4vp:// URI + session ID
# requestUri should be Credo's authorizationRequestUri (not broken request_uri)
```

### 2. OpenID4VP Flow (direct)
```bash
# Create via openid4vp service
curl -s -X POST http://localhost:3000/api/v1/openid4vp/authorization-request \
  -H "Content-Type: application/json" \
  -H "x-api-key: dev-api-key-docker-only" \
  -d '{"presentationDefinitionId":"agent-identity-verification"}' | jq '.'

# Should return: sessionId, authorizationRequest, authorizationRequestUri
```

### 3. Session Lookup Unified
```bash
# Get result via verifier route (should find openid4vp service session)
curl -s http://localhost:3000/api/v1/verifier/verify/{sessionId}/result \
  -H "x-api-key: dev-api-key-docker-only" | jq '.'

# Get result via openid4vp route (same session)
curl -s http://localhost:3000/api/v1/openid4vp/sessions/{sessionId}/result \
  -H "x-api-key: dev-api-key-docker-only" | jq '.'

# Both should return the same result
```

### 4. Wallet VP Presentation
```bash
# Wallet presents credential (should work with Credo URI)
curl -s -X POST http://localhost:3000/api/v1/holder/credentials/present \
  -H "Content-Type: application/json" \
  -H "x-api-key: dev-api-key-docker-only" \
  -d '{"verificationRequestUri":"openid4vp://..."}' | jq '.'
```

### 5. Docker Restart Persistence
```bash
docker compose -f docker-compose.dev.yml restart backend
# Sessions created before restart should still be queryable
```

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Frontend response shape mismatch | High | Step 2 wrapper maps fields precisely; no frontend change needed |
| Wallet URI parsing breaks in Jose mode | Medium | Step 7 adds inline param parsing; Credo mode unaffected |
| Presentation definition ID conflicts | Low | Step 1 checks for duplicates and merges carefully |
| `direct_post` removal from routes breaks something | Low | Global `direct_post` in server.ts already handles all submissions |
| Session storage adapter initialization timing | Low | openid4vp.service lazy-initializes adapter on first use |
