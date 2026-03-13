---
title: "Credo-TS PRIMARY Migration — Remaining Phases (Agent Layer + Route Consolidation)"
date: 2026-03-13
module: backend
related_todos: []
---

## Goal

Complete the Credo-TS PRIMARY migration by eliminating remaining Jose usage in backend agents and services. After this, all backend SSI operations (key generation, DID creation, credential signing, VP verification) go through Credo, while Jose stays only in: (1) `didResolver.service.ts` for DID verification utility, (2) `keycloak.service.ts` for JWKS/JWT, (3) `sdjwt.service.ts` for SD-JWT creation, (4) `oauth-bridge.service.ts` for token exchange, (5) client-side wallets.

## Research Findings

### Current Jose Usage in Backend (post-migration)
1. **`base.agent.ts` (279L)** — Full Jose agent: `generateKeyPair()`, `createDidKey()`, `createJwtVc()`, `verifyJwtVc()`, `resolveDidKey()`, `base58btc` encode/decode. Used by issuer, verifier, holder agents for identity.
2. **`issuer.agent.ts` (446L)** — Uses `base.agent.createJwtVc()` for direct credential issuance (`issueCredentialDirect()`, `claimCredential()`). Has its own offer/token/claim flow parallel to `openid4vci.service.ts`.
3. **`verifier.agent.ts` (156L)** — Already a thin wrapper, delegates to `openid4vp.service.ts`. Only uses `base.agent` for DID/key identity.
4. **`openid4vci.service.ts` (1121L)** — Uses Jose for: signing key pair management (L34-58), proof JWT verification (L732), credential signing (L833). Has its own `getSigningKeyPair()` separate from agents.
5. **`openid4vp.service.ts` (818L)** — Uses Jose for: VP signature verification (L575), VC signature verification (L618). Both via `resolvePublicKeyFromDid()` → `jose.jwtVerify()`.

### Key Architectural Decision
- **`openid4vp.service.ts` Jose usage is DID verification** — `jose.jwtVerify(vpToken, publicKey)` with keys from `resolvePublicKeyFromDid()`. This is conceptually a verification utility, not an SSI engine choice. **Keep as-is** — Credo handles VP session creation, Jose handles signature verification at the crypto layer.
- **`openid4vci.service.ts` Jose usage is credential signing** — This IS the core SSI operation that should move to Credo. The `getSigningKeyPair()` and `jose.SignJWT()` in `issueCredential()` should use Credo's `credentialRequestToCredentialMapper`.
- **`issuer.agent.ts` Jose usage** — `issueCredentialDirect()` and `claimCredential()` use `createJwtVc()` from base.agent. These are used by batch issuance and the offer→token→claim flow in `issuer.routes.ts`. This parallel issuance path should delegate to Credo.
- **Boot order** — Jose agents init BEFORE Credo (L124-128 vs L137). This creates separate DID identities. Agents should use Credo DID after Credo is initialized.

### What Can Be Safely Changed vs What Must Stay

| Component | Jose Usage | Action |
|-----------|-----------|--------|
| `base.agent.ts` `generateKeyPair()` | Key generation | **Keep** — still needed for Jose agents init before Credo |
| `base.agent.ts` `createDidKey()` | DID creation | **Keep** — base58btc encoding is reusable utility |
| `base.agent.ts` `createJwtVc()` | VC signing | **Remove callers** — issuer should use Credo |
| `base.agent.ts` `verifyJwtVc()` | VC verify | **Keep** — verification utility |
| `base.agent.ts` `resolveDidKey()` | DID resolve | **Keep** — used in verification paths |
| `issuer.agent.ts` `issueCredentialDirect()` | Direct issuance | **Refactor** — use Credo or delegate to openid4vci.service |
| `issuer.agent.ts` `claimCredential()` | Claim flow | **Refactor** — use Credo or delegate to openid4vci.service |
| `issuer.agent.ts` offer functions | Offer creation | **Keep** — they create offer URIs, not sign credentials |
| `openid4vci.service.ts` `getSigningKeyPair()` | Key mgmt | **Refactor** — use Credo agent's key |
| `openid4vci.service.ts` `jose.SignJWT()` | VC signing | **Refactor** — use Credo credential mapper |
| `openid4vp.service.ts` `jose.jwtVerify()` | Verify | **Keep** — crypto verification utility |
| `verifier.agent.ts` | DID/key only | **No change** — already thin wrapper |

## Implementation Steps

### Faz A — Issuer Agent Credential Signing via Credo (Core Change)

1. **Refactor `issuer.agent.ts` `issueCredentialDirect()`** → Instead of calling `createJwtVc()` from base.agent, call `openid4vci.service.issueCredential()` or use Credo's signing. The function is used by `batchIssuanceService.setIssuer()` callback.
   → `backend/src/agents/issuer.agent.ts`

2. **Refactor `issuer.agent.ts` `claimCredential()`** → Same pattern. Currently uses `createJwtVc()`. Should delegate to `openid4vci.service.issueCredential()` or use the Credo credential mapper signing path.
   → `backend/src/agents/issuer.agent.ts`

3. **Consolidate signing in `openid4vci.service.ts`** — `getSigningKeyPair()` currently generates its own ephemeral Jose key. Refactor to use Credo agent's key (via `getCredoAgent().kms`) or the issuer agent's key. Single key identity, not three separate ones (Credo DID + Jose agent DID + Jose service DID).
   → `backend/src/services/openid4vci.service.ts`

### Faz B — Boot Order Fix

4. **Move Jose agent init AFTER Credo init** — Currently agents init at L124 (before Credo at L137). After Credo is active, Jose agents create a *separate* DID identity. Fix: init Credo first, then have Jose agents optionally get DID from Credo.
   → `backend/src/index.ts`

   **Challenge:** Credo needs Express app (L133) for route registration. Express app is created AFTER agents. Current order: agents → app → Credo → finalize.

   **Solution:** Create Express app FIRST, then init Credo, then init Jose agents (which can now reference Credo DID).

   New order: features → DB → core → services → Express app → Credo → agents → finalize → server

### Faz C — Route Consolidation

5. **Eliminate duplicate `issuer.routes.ts` token/claim flow** — `issuer.routes.ts` imports `exchangePreAuthorizedCode()` and `claimCredential()` from `issuer.agent.ts` (Jose-based). Meanwhile `openid4vci.routes.ts` has the same `/token` and `/credential` endpoints using `openid4vci.service.ts` (which now goes to Credo). These two parallel flows should converge.
   → `backend/src/api/routes/issuer.routes.ts`

6. **Update `base.agent.ts` docstring** — Remove "PRIMARY" and "Credo opsiyonel" references. Mark as "utility agent for DID/key management, Credo is the PRIMARY SSI engine."
   → `backend/src/agents/base.agent.ts`

### Faz D — Cleanup and Verification

7. **Remove dead `import * as jose` from `openid4vci.service.ts`** if all signing moved to Credo. If Jose verification stays (proof JWT verify), keep the import but remove the signing-only code.
   → `backend/src/services/openid4vci.service.ts`

8. **Run TypeScript compilation** — `cd backend && npx tsc --noEmit`

9. **Run tests** — `cd backend && npx vitest run`

10. **Verify Credo flow end-to-end** — credential offer → token → credential works via Credo signing.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `backend/src/agents/issuer.agent.ts` | Modify | Delegate `issueCredentialDirect()` and `claimCredential()` to openid4vci.service instead of Jose `createJwtVc()` |
| `backend/src/agents/base.agent.ts` | Modify | Update docstring, mark as utility (not PRIMARY) |
| `backend/src/services/openid4vci.service.ts` | Modify | Consolidate signing key to use Credo agent key or single identity |
| `backend/src/index.ts` | Modify | Reorder boot: Express app → Credo → agents |
| `backend/src/api/routes/issuer.routes.ts` | Modify | Remove duplicate token/claim imports from issuer.agent, use openid4vci.service |

## Validation

```bash
# TypeScript compile
cd backend && npx tsc --noEmit

# All tests pass
cd backend && npx vitest run

# Boot order verification
cd backend && npm run dev  # Check logs for: Credo init BEFORE agents
```

## Risks

1. **Boot order chicken-and-egg:** Credo needs Express app for routes. Express app creation is currently between agent init and Credo init. Fix: create app before both.
2. **Batch issuance callback:** `batchIssuanceService.setIssuer()` expects a function that returns `{ credentialId, credential }`. If we delegate to openid4vci.service, the return shape must match.
3. **Issuer DID divergence:** Currently 3 DIDs: Credo agent DID, Jose issuer agent DID, Jose service signing key. Consolidating to 1 DID may affect existing credentials (they were signed with the old DID). This is acceptable for development but needs a migration path for production.
4. **Test mocking:** Tests that mock `createJwtVc` or `getSigningKeyPair` will need updating to mock the new delegation path.
