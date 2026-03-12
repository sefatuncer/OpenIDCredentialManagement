---
title: "Client-Side VP Flow — Wallet-Local Key Pair + Direct Post"
tags: [openid4vp, wallet, vp, jose, ed25519, did-key, selective-disclosure, sd-jwt, presentation]
category: openid4vp
difficulty: medium
date: 2026-03-12
---

## Problem

VP flow was entirely backend-driven: wallet passed `openid4vp://` URI to backend, which handled request fetching, credential matching, VP creation, signing, and `direct_post` submission. The wallet couldn't present credentials on its own or select which SD-JWT claims to disclose.

## Approach

### Key Management Decision

Three options for giving the wallet a signing key:
1. Export backend holder key → security risk
2. Generate wallet-local key pair → clean, self-contained
3. Keep backend-driven → no client-side capability

**Chose option 2**: Wallet generates its own Ed25519 key pair via `jose.generateKeyPair('EdDSA')`. The key derives a `did:key` (multicodec 0xed01 + base58btc). This DID is ephemeral (session-scoped) and different from the backend holder DID.

Why this works: VP token's `iss` identifies the presenter. The verifier resolves `did:key` to verify the signature — `did:key` is self-contained (no external resolution). Credentials can be presented by any holder who possesses them; VP `iss` doesn't need to match `credentialSubject.id`.

### Architecture: Dual Mode

Backend and client-side VP flows coexist with a UI toggle. This preserves backward compatibility while enabling client-side autonomy.

## Key Details

### Files Created
- `web-wallet/src/services/wallet-key.service.ts` — Key gen, DID derivation, AES-GCM encrypted sessionStorage, JWT signing
- `web-wallet/src/services/vp.service.ts` — URI parsing, auth request fetch, credential matching, VP creation, direct_post submission
- `web-wallet/src/services/sdjwt-presentation.service.ts` — SD-JWT disclosure filtering for selective presentation
- `web-wallet/src/utils/uuid.ts` — Browser-native `crypto.randomUUID()` wrapper

### Files Modified
- `web-wallet/src/pages/PresentCredential.tsx` — Dual mode UI (client/backend), credential selection, SD-JWT claim picker
- `web-wallet/src/api.ts` — `getHolderCredentialsRaw()` with jwt/combined fields
- `backend/src/agents/holder.agent.ts` — `jwt` field added to `getStoredCredentials()` response

### Security Pattern: Encrypted Key Storage
Private key JWK is encrypted with AES-GCM-256 before storing in sessionStorage. The encryption key itself lives in sessionStorage (same pattern as `Credentials.tsx` credential encryption). Both are lost on tab close — acceptable for ephemeral VP signing keys.

### SD-JWT Presentation
`buildSDJWTPresentation(combined, selectedClaimNames)` rebuilds the SD-JWT string with only selected disclosures. Format: `jwt~disclosure1~disclosure2~...~` (trailing `~` required by spec).

### Credential Freshness
Credentials are fresh-loaded from backend at flow start (`loadCredentials()` called in `handleClientFlowStart`) to avoid stale data from initial page load.

## Lessons Learned

1. **Private keys in browser storage must be encrypted.** Even in sessionStorage (ephemeral), XSS can read plaintext. Use the same AES-GCM-256 pattern already established for credential storage.
2. **Fresh-load data before matching.** React state from a `useEffect` on mount can be stale by the time the user acts. Re-fetch at action time for critical matching operations.
3. **jose `KeyLike` type isn't exported in browser bundle.** Use `CryptoKey` instead of `jose.KeyLike` for type assertions in browser context.
4. **`did:key` is ideal for ephemeral wallet identities.** Self-contained (no resolution needed), no registration required, works immediately. The verifier's `resolvePublicKeyFromDid()` handles it natively.

## Prevention

- When storing any key material in browser storage, always encrypt first
- When depending on React state loaded via useEffect, consider whether the data could be stale at usage time
- When adding jose to a browser project, check type exports — browser bundle differs from Node bundle
