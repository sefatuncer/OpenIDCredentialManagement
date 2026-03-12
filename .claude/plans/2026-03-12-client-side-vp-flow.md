---
title: "Client-Side VP Flow (Wallet-Only Credentials)"
date: 2026-03-12
module: all
related_todos: [007]
---

## Goal

Enable the web wallet to create and submit Verifiable Presentations (VP) client-side using jose, without routing through the backend holder agent. This allows the wallet to present credentials it holds locally, with SD-JWT selective disclosure support.

## Research Findings

### Current Architecture
- **Backend-driven VP flow**: Wallet passes `openid4vp://` URI to `POST /holder/credentials/present` → backend `holder.agent.ts` does everything (fetch request, match credentials, create VP, submit to `direct_post`)
- **Wallet has NO private key**: All keys are in backend `holder.agent.ts` (Ed25519 via jose)
- **direct_post endpoint** at `POST /direct_post` (no auth, spec requirement) accepts `vp_token` + `presentation_submission` + `state` as URL-encoded form data
- **Wallet credentials**: Fetched via `GET /holder/credentials` → returns `id`, `type`, `format`, `combined`, `isSDJWT`, `credentialSubject`
- **SD-JWT client-side parsing**: `sdjwt.service.ts` already parses disclosures, but crypto operations (signing) are server-side

### Key Design Decision: Key Management

**Problem**: Wallet needs a private key to sign VP tokens. Options:
1. **Export holder key from backend** — security risk, defeats purpose of backend key management
2. **Generate wallet-specific key pair in browser** — clean, but requires DID registration
3. **Backend signs VP on behalf of wallet** — already what we have (current flow)

**Chosen approach: Option 2 — Wallet-local key pair**

The wallet generates an Ed25519 key pair using `jose.generateKeyPair('EdDSA')`. The key pair is stored in sessionStorage (encrypted). The wallet derives a `did:key` from the public key. This DID is different from the backend holder DID — it's the wallet's own identity.

This approach is correct for "client-side VP flow" because:
- The VP token's `iss` claim identifies the presenter — it should be the wallet, not the backend
- The verifier resolves the DID to verify the VP signature — wallet DID works
- Credentials were issued to the backend holder DID, but VP wrapping doesn't require matching `iss`
- The wallet can present any VC it possesses, regardless of who the `credentialSubject.id` is

### Related Solutions
- `.claude/solutions/vp-flow-unification-thin-wrapper.md` — VP architecture
- `.claude/solutions/sdjwt-selective-disclosure-ui.md` — SD-JWT UI pattern
- `.claude/solutions/did-key-multibase-encoding.md` — DID:key encoding from Ed25519

## Implementation Steps

### Step 1: Wallet Key Service → `web-wallet/src/services/wallet-key.service.ts` (NEW)
- `generateWalletKeyPair()` — Ed25519 via `jose.generateKeyPair('EdDSA')`
- `getOrCreateWalletKey()` — lazy init, store JWK in sessionStorage
- `getWalletDid()` — derive `did:key` from public key (multicodec 0xed01 + base58btc)
- `getWalletKid()` — `did:key#did:key` format
- `signJwt(payload, header)` — wrapper around `jose.SignJWT`
- `clearWalletKey()` — for logout
- Dependencies: `jose` (already in web-wallet's transitive deps, add direct)

### Step 2: VP Service → `web-wallet/src/services/vp.service.ts` (NEW)
- `fetchAuthorizationRequest(requestUri)` — fetch presentation definition from request_uri
- `parseVerificationRequest(uri)` — parse `openid4vp://` URI, extract params (reuse from current code)
- `matchCredentials(presentationDefinition, credentials)` — match wallet credentials against input_descriptors
- `createVpToken(credentials, nonce, audience)` — create VP JWT using wallet key
- `submitPresentation(submitUrl, vpToken, presentationSubmission, state)` — POST to direct_post
- `buildPresentationSubmission(definitionId, descriptors, credentials)` — build descriptor map

### Step 3: SD-JWT Presentation Service → `web-wallet/src/services/sdjwt-presentation.service.ts` (NEW)
- `selectDisclosures(combined, selectedClaims)` — filter SD-JWT disclosures to include only selected claims
- `buildSDJWTPresentationToken(combined, selectedClaims)` — rebuild SD-JWT string with only selected disclosures
- Reuses existing `parseSDJWT()` and `getSelectableDisclosures()` from `sdjwt.service.ts`

### Step 4: Update PresentCredential Page → `web-wallet/src/pages/PresentCredential.tsx` (MODIFY)
Add new flow states and UI:
- **Flow mode toggle**: "Backend (default)" vs "Client-side"
- After URI scan → fetch authorization request → show presentation definition details
- **Credential matching step**: Show matched credentials, let user select if multiple
- **SD-JWT claim selection step**: If SD-JWT credential, show selectable disclosures with checkboxes
- **Preview step**: Show what will be presented
- **Submit**: Client-side VP creation + direct_post submission
- Keep existing backend flow as fallback option

### Step 5: Add jose dependency to web-wallet → `web-wallet/package.json` (MODIFY)
- `npm install jose` in web-wallet (for Ed25519 key gen + JWT signing in browser)

### Step 6: Wallet Credentials API Enhancement → `web-wallet/src/api.ts` (MODIFY)
- `getHolderCredentialsRaw()` — new function that returns `combined` (SD-JWT string) and `jwt` fields needed for VP creation
- Current `getHolderCredentials()` doesn't return raw JWT/combined strings

### Step 7: Backend — Expose raw credential data → `backend/src/api/routes/holder.routes.ts` (MODIFY)
- Update `GET /holder/credentials` to include `jwt` and `combined` fields in response
- Or add `GET /holder/credentials/:id/raw` endpoint for individual credential JWT

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `web-wallet/src/services/wallet-key.service.ts` | Create | Ed25519 key pair gen, DID:key derivation, JWT signing |
| `web-wallet/src/services/vp.service.ts` | Create | VP token creation, direct_post submission, credential matching |
| `web-wallet/src/services/sdjwt-presentation.service.ts` | Create | SD-JWT disclosure selection for presentation |
| `web-wallet/src/pages/PresentCredential.tsx` | Modify | Client-side VP flow UI with credential/claim selection |
| `web-wallet/src/api.ts` | Modify | Add raw credential fetch |
| `web-wallet/package.json` | Modify | Add jose dependency |
| `backend/src/agents/holder.agent.ts` | Modify | Expose jwt/combined in getStoredCredentials response |

## Validation

1. **Key generation**: Wallet generates Ed25519 key, derives valid `did:key`
```bash
# Verify wallet DID resolves
curl http://localhost:3000/api/v1/did/resolve?did=<wallet-did>
```

2. **End-to-end VP flow**:
```bash
# 1. Create verification request (verifier)
curl -X POST http://localhost:3000/api/v1/verifier/authorization-request \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"presentationDefinitionId": "agent-identity"}'

# 2. In wallet: scan QR → select client-side mode → select credential → submit
# 3. Check verification result
curl http://localhost:3000/api/v1/verifier/sessions/{sessionId}/result \
  -H "x-api-key: $API_KEY"
```

3. **SD-JWT selective disclosure**: Present SD-JWT credential with subset of claims, verify only selected claims visible in VP
4. **TypeScript compilation**: `cd web-wallet && npx tsc --noEmit`

## Risks

1. **Browser Ed25519 support**: `jose` uses Web Crypto API for Ed25519. Most modern browsers support it (Chrome 113+, Firefox 118+, Safari 17+). Fallback: ECDSA P-256 if needed, but Ed25519 preferred for consistency.
2. **VP token verification at direct_post**: Backend `handleDirectPost` → `verifyVpToken()` resolves the `iss` DID to get the public key. The wallet's `did:key` must be resolvable by backend's `resolvePublicKeyFromDid()`. Since it's `did:key`, it's self-contained — no external resolution needed.
3. **Session key loss**: Wallet key in sessionStorage is lost on tab close. This is acceptable — VP signing is ephemeral, no credential is lost. User just generates a new key next session.
4. **CORS**: Wallet direct_post submission goes to backend origin — same-origin if proxied by Vite, otherwise CORS must allow wallet origin.
