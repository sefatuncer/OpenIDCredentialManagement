---
title: "OpenID4VCI/VP Draft 13+ Spec Compliance Migration"
tags: [openid4vci, openid4vp, spec-compliance, migration, backward-compatibility, did-resolution]
category: openid4vci
difficulty: hard
date: 2026-03-11
---

## Problem

The project had a **split-spec problem** — agent modules (`issuer.agent.ts`, `holder.agent.ts`) used Draft 13+ field names while the core VCI service (`openid4vci.service.ts`) used Draft 11 field names. This caused 3 runtime interop bugs:

1. **BUG-1**: VCI service created offers with `credentials`, holder read `credential_configuration_ids` → empty array
2. **BUG-2**: Verifier sent `response_uri`, holder read `redirect_uri` → VP submission to wrong URL
3. **BUG-3**: Holder sent `credential_configuration_id`, VCI service ignored it → credential type mismatch

Additionally, VP and SD-JWT signature verification only supported `did:key`, not `did:web` or `did:peer`.

## Approach

### Field Migration Strategy
For each deprecated field, applied a **dual-write, multi-read** pattern:
- **Write**: Send both old and new field names for backward compat
- **Read**: Accept both old and new field names with priority to new

### Universal DID Resolution
Extracted `resolvePublicKeyFromDid()` from `openid4vci.service.ts` into `didResolver.service.ts` as a shared utility, then replaced all `did:key`-only checks with universal resolution.

## Key Details

### Field Mappings (Draft 11 → Draft 13+)
| Old Field | New Field | Location |
|-----------|-----------|----------|
| `credentials` | `credential_configuration_ids` | Credential Offer |
| `user_pin_required` | `tx_code: { input_mode, length }` | Pre-auth grant |
| `cryptographic_suites_supported` | `credential_signing_alg_values_supported` | Issuer metadata |
| `redirect_uri` (for direct_post) | `response_uri` | VP Authorization Request |
| (missing) | `client_id_scheme` | VP Authorization Request |
| (missing) | `credential_configuration_id` | Credential Request |

### Backward Compatibility Pattern
```typescript
// Writing (offer creation):
credential_configuration_ids: credentialTypes,
credentials: credentialTypes,  // deprecated, for old clients

// Reading (token exchange):
const types = offer.credential_configuration_ids || offer.credentials || []

// Token endpoint:
const txCodeValue = req.body.tx_code || req.body.user_pin // backward compat
```

### Universal DID Resolution Pattern
```typescript
// Before (only did:key):
if (did.startsWith('did:key:')) {
  const publicKey = await resolveDidKey(did)
  // verify...
}

// After (all DID methods):
if (did.startsWith('did:')) {
  const publicKey = await resolvePublicKeyFromDid(did)
  if (publicKey) { /* verify... */ }
}
```

### Files Modified
- `didResolver.service.ts` — Added `resolvePublicKeyFromDid()` with jose import
- `openid4vci.service.ts` — All Draft 13+ field migrations
- `openid4vp.service.ts` — `client_id_scheme`, universal DID resolution
- `sdjwt.service.ts` — Universal DID resolution
- `credential-mapper.service.ts` — `credential_signing_alg_values_supported`
- `holder.agent.ts` — `response_uri` fix
- `openid4vci.routes.ts` — Swagger docs, route handler updates

## Lessons Learned

1. **Split-spec is worse than old-spec**: When different layers use different spec versions, runtime bugs emerge that are invisible at compile time. All layers should use the same spec version.

2. **Import rename avoids conflicts**: When a module already has a local function with the same name as an imported one, use `import { foo as fooAlias }` rather than renaming the local function.

3. **Dual-write is safer than hard cutover**: For protocol fields, sending both old and new names during transition prevents breaking external consumers.

4. **DID resolution should be centralized**: Having `resolvePublicKeyFromDid()` in one place ensures all verification paths support the same DID methods.

## Prevention

- When upgrading OpenID spec draft versions, grep the entire codebase for old field names
- Always check both producer and consumer sides of protocol messages
- Run `grep -r "credentials\b" --include="*.ts"` style searches to find all usage sites
- Add integration tests that exercise the full flow (offer → token → credential) to catch field mismatches early
