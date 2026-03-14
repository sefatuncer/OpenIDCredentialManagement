---
title: "Service File Splitting — Oversized Services Below 300L Guideline"
date: 2026-03-13
module: backend
related_todos: []
---

## Goal

Split 5 oversized service files that violate the ~300 line guideline. Focus on the top offenders in `backend/src/services/` — extracting concern-based sub-modules while preserving public API via re-exports (thin wrapper pattern from `.claude/solutions/credo-ts-primary-migration.md`).

## Research Findings

### Current File Sizes (sorted by severity)

| File | Lines | Concerns | Split Strategy |
|------|-------|----------|----------------|
| `openid4vci.service.ts` | 1150 | metadata+offers+tokens+signing+batch+cleanup | 3-way split |
| `openid4vp.service.ts` | 818 | config+authrequest+directpost+verification+cleanup | 2-way split |
| `didResolver.service.ts` | 716 | DID doc resolution + key extraction + multi-method | 2-way split |
| `sdjwt.service.ts` | 723 | creation + verification + disclosure + class | 2-way split |
| `credo.agent.ts` | 670 | init + API wrappers (issuer/verifier/holder) | 2-way split |

### Pattern from CLAUDE.md
> "Servis dosyası ~300L'yi aşınca concern'e göre böl (CRUD vs engine). 'Thin wrapper + re-export' pattern public API'yi değiştirmeden iç yapıyı temizler."

### Existing Pattern Reference
- `.claude/solutions/map-to-storage-adapter-migration.md` — re-export pattern
- `.claude/solutions/vp-flow-unification-thin-wrapper.md` — thin wrapper + re-export

### Strategy: Thin Wrapper + Re-export
Each split produces:
1. **Sub-module file** with the extracted concern
2. **Original file** becomes a thin re-export barrel (preserves all imports from consumers)

This means **zero changes to any importing file** — all consumers continue importing from the original path.

## Implementation Steps

### 1. Split `openid4vci.service.ts` (1150L → 3 files)

**A. Extract signing/credential logic → `openid4vci-signing.service.ts` (~250L)**
- `getSigningKeyPair()` (L37-58)
- `signCredentialDirect()` (L838-918)
- `buildCredentialSubject()` (L919-978)
- `issueCredential()` signing delegation section (L616-835)
- `issueBatchCredentials()` (L983-1013)
- `getDeferredCredential()` (L1014-1057)
- Constants: `SD_CLAIMS_BY_TYPE`

**B. Extract storage/offer/token logic → `openid4vci-offers.service.ts` (~300L)**
- All storage adapters: `getOffersStorage()`, `getTokensStorage()`, `getDeferredStorage()`, `getNonceStorage()` (L70-140)
- Storage types: `StoredCredentialOffer`, `StoredAccessToken`, etc. (L62-109)
- `createCredentialOffer()` (L400-449)
- `getCredentialOffer()` (L450-467)
- `exchangePreAuthorizedCode()` (L468-597)
- `validateAccessToken()` (L598-615)
- `listCredentialOffers()` (L1058-1081)
- `cleanupExpired()` + `startCleanupInterval()` + `stopCleanupInterval()` (L1082-1150)

**C. Keep in `openid4vci.service.ts` (~200L) — metadata + re-exports**
- Types/interfaces (L140-233)
- `getIssuerBaseUrl()` (L234-251)
- `buildCredentialConfigurations()` (L252-359)
- `getIssuerMetadata()` (L360-384)
- `getAuthorizationServerMetadata()` (L385-399)
- Re-export everything from sub-modules

### 2. Split `openid4vp.service.ts` (818L → 2 files)

**A. Extract verification engine → `openid4vp-verification.service.ts` (~400L)**
- `handleDirectPost()` (L458-721) — the 260-line VP verification engine
- `getVerificationResult()` (L722-747)
- Helper: `isCredentialRevoked()` import

**B. Keep in `openid4vp.service.ts` (~300L) — config, sessions, re-exports**
- Types, constants, storage (L1-100)
- Config functions: `getVerifierBaseUrl()`, `getVerifierClientMetadata()` (L328-356)
- `createAuthorizationRequest()` (L357-428)
- `getSessionByState()` (L429-439)
- `getVerificationSession()` (L440-457)
- `listVerificationSessions()` (L748-771)
- `getAvailablePresentationDefinitions()` (L772-786)
- `cleanupExpiredSessions()` (L787-818)
- Re-export from verification sub-module

### 3. Split `didResolver.service.ts` (716L → 2 files)

**A. Extract DID document building → `didResolver-documents.service.ts` (~350L)**
- `resolveDidDocument()` (the big switch-case for did:key, did:web, did:peer)
- `buildDidKeyDocument()`, `buildDidWebDocument()`, `buildDidPeerDocument()`
- All the DID document construction helpers

**B. Keep in `didResolver.service.ts` (~300L) — public API + key resolution**
- `resolveDid()` — public entry point
- `resolvePublicKeyFromDid()` — the most-used function
- Re-export from documents sub-module

### 4. Split `sdjwt.service.ts` (723L → 2 files)

**A. Extract verification → `sdjwt-verification.service.ts` (~250L)**
- `verifySDJWTVC()` — SD-JWT verification logic
- `createKeyBindingJWT()` — key binding
- Verification helpers

**B. Keep in `sdjwt.service.ts` (~350L) — creation + class + re-exports**
- `SDJWTService` class — creation methods
- `createSDJWTVC()` — SD-JWT creation
- `parseSDJWT()` — parsing utility
- Re-export from verification sub-module

### 5. Split `credo.agent.ts` (670L → 2 files)

**A. Extract API wrappers → `credo-api.agent.ts` (~250L)**
- `createCredoCredentialOffer()` — issuer API
- `createCredoVerificationRequest()` — verifier API
- `getCredoVerificationSession()` — session lookup
- `acceptCredoCredentialOffer()` — holder API
- `submitCredoPresentation()` — holder API

**B. Keep in `credo.agent.ts` (~350L) — lifecycle + init + re-exports**
- `initializeCredoAgent()` — agent creation + module setup
- `getCredoAgent()`, `isCredoAgentReady()`, `getAgentDid()`
- `shutdownCredoAgent()`, `checkAskarAvailability()`
- Re-export from API sub-module

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `services/openid4vci-signing.service.ts` | Create | Signing + credential building (~250L) |
| `services/openid4vci-offers.service.ts` | Create | Offer/token/storage management (~300L) |
| `services/openid4vci.service.ts` | Modify | Metadata + re-exports (~200L) |
| `services/openid4vp-verification.service.ts` | Create | VP verification engine (~400L) |
| `services/openid4vp.service.ts` | Modify | Config/sessions + re-exports (~300L) |
| `services/didResolver-documents.service.ts` | Create | DID document building (~350L) |
| `services/didResolver.service.ts` | Modify | Public API + re-exports (~300L) |
| `services/sdjwt-verification.service.ts` | Create | SD-JWT verification (~250L) |
| `services/sdjwt.service.ts` | Modify | Creation + class + re-exports (~350L) |
| `agents/credo-api.agent.ts` | Create | Credo API wrappers (~250L) |
| `agents/credo.agent.ts` | Modify | Lifecycle + re-exports (~350L) |

## Validation

```bash
# TypeScript compile — zero errors expected (re-exports preserve API)
cd backend && npx tsc --noEmit

# All tests pass — no consumer changes needed
cd backend && npx vitest run

# Verify no file exceeds ~400L after split
find src/services src/agents -name "*.ts" -exec wc -l {} + | sort -rn | head -20
```

## Risks

1. **Circular imports** — Sub-modules may need shared types. Mitigation: put shared types in the parent file and import from there, or create a types file.
2. **Storage adapter sharing** — `getOffersStorage()` is used by both signing and offer functions. Mitigation: export storage getters from the offers sub-module, import in signing sub-module.
3. **Test mocking** — Tests that mock the original module path will still work since the barrel re-exports. Tests that mock individual functions from sub-modules would need path updates, but this shouldn't be needed.
4. **Re-export barrel size** — The barrel file must re-export everything. If missing, TS will catch it at compile time.
