---
title: "Envelope Encryption for Key-at-Rest in PostgreSQL"
tags: [security, encryption, postgresql, envelope, key-rotation, storage]
category: security
difficulty: medium
date: 2026-03-12
---

## Problem

`encryption.service.ts` stores encryption key material (AES-256 keys) in PostgreSQL via IStorageAdapter. If the database is compromised, plaintext key material in the `storage_encryption_keys` table would expose all encrypted data.

## Approach

Envelope encryption pattern: a Key Encryption Key (KEK) derived from the `ENCRYPTION_KEY` env var wraps data encryption keys before DB storage. Data keys are decrypted at boot time into memory cache.

### Architecture

```
Env var (ENCRYPTION_KEY) → KEK
  ↓
Data Key (AES-256) → envelopeWrap(dataKey, KEK) → stored in PostgreSQL (encrypted)
  ↓
Boot: load from DB → envelopeUnwrap(stored, KEK) → memory cache
  ↓
encrypt()/decrypt() → sync, reads from memory cache (no DB hit)
```

### Hybrid Pattern

- **DB persistence:** Keys survive restart (envelope-encrypted)
- **Memory cache:** `encrypt()`/`decrypt()` remain sync — no async overhead on hot path
- **Graceful degradation:** Dev mode (no env key) falls back to plaintext storage with warning

## Key Details

- `envelopeWrap(plainKey, kek)` → AES-256-GCM encrypt the key material itself
- `StoredKeyData.envelope?: { iv, authTag }` — present when envelope-encrypted
- `persistKey()` helper centralizes wrap + save logic (used by both `initialize()` and `addKey()`)
- On load: check `stored.envelope` to determine if unwrap needed (backward compat with pre-existing plaintext)
- Key rotation via `addKey()` marks old keys as 'rotated' in both memory and DB

## Lessons Learned

- Encryption services that persist key material to DB need envelope encryption — plain base64 is not enough
- Constructor-based init (`new EncryptionService()`) can't be async. Use explicit `initialize()` method called from boot sequence
- Memory cache + DB persist hybrid avoids async overhead on crypto hot paths while ensuring durability

## Prevention

When storing sensitive material (keys, tokens, secrets) in any storage backend:
1. Always consider at-rest encryption via envelope pattern
2. The KEK should come from outside the storage system (env var, HSM, KMS)
3. Test with and without KEK to ensure graceful degradation
