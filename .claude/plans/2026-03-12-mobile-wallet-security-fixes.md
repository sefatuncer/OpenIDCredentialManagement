---
title: "Mobile Wallet P1+P2 Security & Architecture Fixes"
date: 2026-03-12
module: mobile-wallet
related_todos: [037, 038]
---

## Goal

Fix 3 P1 CRITICAL and 6 P2 IMPORTANT security/architecture findings from the mobile wallet review. All P1 issues block merge.

## Research Findings

- Web wallet already has AES-GCM-256 encryption for private keys (`web-wallet/src/services/wallet-key.service.ts:28-61`) — adapt for RN
- `crypto.subtle` is available in React Native (Hermes engine supports Web Crypto API)
- `expo-secure-store` has 2048 byte value limit — encrypted key data fits within this
- DelegationsScreen is 307 lines — modal extraction drops it below 240
- `useWebSocket` already uses `useRef` for `onMessageRef` correctly (line 23, 28) — the `connect` callback empty deps is actually fine since it reads wsUrl from Constants (static). Re-review: P2-5 is a false positive, `connect` doesn't depend on any changing state. Skip.

## Implementation Steps

### P1 Fixes (CRITICAL)

**Step 1: clientSecret validation** → `mobile-wallet/src/services/api.service.ts`
- Remove empty string default for `clientSecret`
- If `clientSecret` is missing, `getAuthToken()` returns null (already does at line 32)
- Change `getClientCredentials()` to throw if clientSecret is empty when auth is attempted
- Add `isConfigured()` export so screens can show warning

```typescript
function getClientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = extra.clientId || 'web-wallet'
  const clientSecret = extra.clientSecret || ''
  if (!clientSecret) {
    throw new Error('API client secret not configured. Set clientSecret in app.config.ts extra.')
  }
  return { clientId, clientSecret }
}
```

**Step 2: URL validation for VP fetch** → `mobile-wallet/src/services/vp.service.ts`
- Add `validateUrl()` helper that rejects private IPs and non-HTTPS (production)
- Apply to `fetchAuthorizationRequest()` before `fetch(requestUri)`
- Apply to `submitPresentation()` before `fetch(responseUri)`
- Pattern: reuse SSRF check logic from backend `webhookDelivery.service.ts`

```typescript
function validateUrl(url: string): void {
  const parsed = new URL(url)
  // Block private/reserved IPs
  const hostname = parsed.hostname
  const privatePatterns = [
    /^localhost$/i, /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./, /^0\./, /^::1$/, /^fe80:/i, /^fc00:/i, /^fd/i,
  ]
  if (privatePatterns.some(p => p.test(hostname))) {
    throw new Error('Request to private/reserved IP is not allowed')
  }
  // Allow http only in dev
  if (__DEV__ !== true && parsed.protocol !== 'https:') {
    throw new Error('HTTPS required for authorization requests')
  }
}
```

**Step 3: Presentation definition validation** → `mobile-wallet/src/services/vp.service.ts`
- Add runtime validation for parsed `presentation_definition` in `parseVerificationUri()`
- Validate structure: must have `id` (string) and `input_descriptors` (array with at least 1 entry)
- Each input_descriptor must have `id` and `constraints.fields`
- Also validate in `fetchAuthorizationRequest()` response

```typescript
function validatePresentationDefinition(pd: unknown): pd is PresentationDefinition {
  if (!pd || typeof pd !== 'object') return false
  const obj = pd as Record<string, unknown>
  if (typeof obj.id !== 'string') return false
  if (!Array.isArray(obj.input_descriptors) || obj.input_descriptors.length === 0) return false
  return obj.input_descriptors.every((d: unknown) => {
    if (!d || typeof d !== 'object') return false
    const desc = d as Record<string, unknown>
    return typeof desc.id === 'string'
  })
}
```

### P2 Fixes (IMPORTANT)

**Step 4: Encrypted private key storage** → `mobile-wallet/src/services/wallet-key.service.ts`
- Add AES-GCM-256 encrypt/decrypt helpers using `crypto.subtle`
- Encrypt private JWK before storing in expo-secure-store
- Decrypt on load
- Encryption key derived from a random AES key stored separately in secure store
- Pattern: adapted from `web-wallet/src/services/wallet-key.service.ts:22-62`

```typescript
const WALLET_ENC_KEY = 'wallet_enc_key'

async function getEncryptionKey(): Promise<CryptoKey> {
  const stored = await secureGet(WALLET_ENC_KEY)
  if (stored) {
    const jwk = JSON.parse(stored)
    return crypto.subtle.importKey('jwk', jwk, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const exported = await crypto.subtle.exportKey('jwk', key)
  await secureSet(WALLET_ENC_KEY, JSON.stringify(exported))
  return key
}

async function encryptData(data: string): Promise<string> { /* iv + ciphertext → base64 */ }
async function decryptData(encrypted: string): Promise<string> { /* base64 → decrypt */ }
```

**Step 5: Token TTL tracking** → `mobile-wallet/src/services/api.service.ts`
- Parse JWT exp claim from cached token
- Before returning cached token, check if it's within 60s of expiry
- If near-expiry, clear cache and fetch fresh token

```typescript
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return !payload.exp || (payload.exp - 60) < Math.floor(Date.now() / 1000)
  } catch {
    return true
  }
}
```

**Step 6: Extract CreateDelegationModal** → new `mobile-wallet/src/components/CreateDelegationModal.tsx`
- Move lines 186-236 (Modal) + form state (lines 25-28) + handleCreate (lines 68-94) to separate component
- DelegationsScreen drops from 307 → ~220 lines
- Props: `visible`, `onClose`, `onCreated`

**Step 7: DID format validation** → `mobile-wallet/src/screens/DelegationsScreen.tsx` (or in new CreateDelegationModal)
- Add DID format check before calling `createDelegation()`
- Regex: `/^did:[a-z0-9]+:.+$/i`

```typescript
const DID_PATTERN = /^did:[a-z0-9]+:.+$/i
if (!DID_PATTERN.test(delegateeDid.trim())) {
  Alert.alert('Error', 'Invalid DID format. Expected: did:method:identifier')
  return
}
```

**Step 8: Credential matching field filter support** → `mobile-wallet/src/services/vp.service.ts`
- Enhance `matchCredentials()` to check `filter.const` and `filter.pattern` on field constraints
- Currently only checks field existence, not values

```typescript
// In matchCredentials, after field existence check:
const matchesFilter = descriptor.constraints.fields.every(field => {
  if (!field.filter) return true
  const fieldName = field.path[0].split('.').pop()
  const value = fieldName ? subject[fieldName] : undefined
  if (field.filter.const !== undefined) return value === field.filter.const
  if (field.filter.enum) return field.filter.enum.includes(value as string | number | boolean)
  if (field.filter.pattern) return new RegExp(field.filter.pattern).test(String(value))
  return true
})
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `mobile-wallet/src/services/api.service.ts` | Modify | P1: clientSecret validation, P2: token TTL check |
| `mobile-wallet/src/services/vp.service.ts` | Modify | P1: URL validation + PD validation, P2: field filter matching |
| `mobile-wallet/src/services/wallet-key.service.ts` | Modify | P2: AES-GCM-256 encrypt private key at rest |
| `mobile-wallet/src/components/CreateDelegationModal.tsx` | Create | P2: extracted modal component (~90 lines) |
| `mobile-wallet/src/screens/DelegationsScreen.tsx` | Modify | P2: extract modal + DID validation |

## Validation

```bash
# TypeScript compile check
cd mobile-wallet && npx tsc --noEmit

# Verify file sizes
wc -l mobile-wallet/src/screens/DelegationsScreen.tsx  # < 300
wc -l mobile-wallet/src/services/vp.service.ts         # check growth
wc -l mobile-wallet/src/services/wallet-key.service.ts  # check growth
```

## Risks

1. **crypto.subtle availability in Hermes:** React Native with Hermes engine may not have full Web Crypto API. Mitigation: expo-crypto polyfill as fallback, or use `expo-crypto` `digestStringAsync` for hash + manual AES via jose.
2. **expo-secure-store 2048 byte limit:** Encrypted key data (base64 IV + ciphertext) must fit. Ed25519 private JWK JSON is ~200 bytes, encrypted + base64 → ~400 bytes. Safe.
3. **`__DEV__` global:** Available in React Native globally. Used for allowing HTTP in dev mode.
