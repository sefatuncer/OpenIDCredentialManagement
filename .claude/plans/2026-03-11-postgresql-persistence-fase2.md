---
title: "PostgreSQL Persistence — Fase 2: oidc.service + batchIssuance.service"
date: 2026-03-11
module: backend
related_todos: [002]
---

## Goal

Fase 2'deki iki servisin in-memory Map'lerini IStorageAdapter'a migrate etmek. Araştırma sonucu: 4 Map'ten sadece 2'si gerçekten persistence gerektiriyor.

## Research Findings

### oidc.service.ts — 3 Map
| Map | Key | Value | Persistence? | Karar |
|-----|-----|-------|-------------|-------|
| `configs` | providerId | OIDCConfig | **EVET** — restart = provider kaybı | Migrate |
| `metadataCache` | issuerUrl | OIDCMetadata | HAYIR — 1h TTL cache, re-fetch edilir | Skip |
| `sessions` | state | AuthSession | HAYIR — 10min TTL, OAuth CSRF protection | Skip |

### batchIssuance.service.ts — 1 Map
| Map | Key | Value | Persistence? | Karar |
|-----|-----|-------|-------------|-------|
| `jobs` | jobId | BatchJob | **EVET** — restart = job kaybı, client 404 | Migrate |

### Zorluklar (batchIssuance)
1. **In-place mutation:** `processJob()` doğrudan `job.results.push()`, `job.processedCount++` yapıyor. Storage adapter'da explicit `save()` gerekli.
2. **Multiple re-reads:** Cancellation check için `this.jobs.get(jobId)` tekrar okuyor. Async olacak.
3. **`results` array büyük olabilir:** 100 credential × result = büyük JSONB. Kabul edilebilir — PostgreSQL JSONB max 1GB.
4. **processJob sırasında frequent save:** Her batch chunk sonrası progress save edilmeli (crash durumunda partial progress korunur).

### Pattern: `.claude/solutions/map-to-storage-adapter-migration.md`
- Lazy init + `getStorage()` pattern
- Key-in-data (jobId zaten data'da var ✓)
- sync → async cascade

## Implementation Steps

### Step 1: `oidc.service.ts` — `configs` Map → storage adapter

`configs` Map'i IStorageAdapter'a çevir. `metadataCache` ve `sessions` Map olarak kalır.

```typescript
interface StoredOIDCConfig {
  providerId: string  // key-in-data
  issuerUrl: string
  clientId: string
  clientSecret?: string
  redirectUri: string
  scopes: string[]
  responseType: 'code' | 'token' | 'id_token'
}
```

Değişen fonksiyonlar:
- `registerProvider()` → async, `await adapter.save(providerId, {...})`
- `getProvider()` → async, `await adapter.get(providerId)`
- `listProviders()` → async, `await adapter.list()` → map to keys

**Caller impact:** Bu fonksiyonlar async olacak. Caller'ları bulmak ve `await` eklemek gerekli.

### Step 2: `batchIssuance.service.ts` — `jobs` Map → storage adapter

```typescript
// BatchJob zaten jobId içeriyor (key-in-data ✓)
// Interface değişikliği YOK
```

Değişen fonksiyonlar:
- `createBatchJob()` → `await adapter.save(jobId, job)` (zaten async)
- `getJobStatus()` → async, `await adapter.get(jobId)`
- `getJobResults()` → async, `await adapter.get(jobId)` → `job?.results || []`
- `cancelJob()` → async, get + update + save
- `listJobs()` → async, `await adapter.list()` + filter
- `cleanupJobs()` → async, list + filter + delete
- `getStats()` → async, `await adapter.list()` + reduce
- `processJob()` → inner save after each batch chunk

**Critical:** `processJob()` içindeki in-place mutation'ı `await adapter.save()` ile replace et. Her chunk sonrası save (crash recovery).

### Step 3: Caller chain async update

`getJobStatus()` ve `getJobResults()` sync'den async'e geçiyor → `issuer.routes.ts` caller'ları zaten `asyncHandler` içinde, sadece `await` ekle.

`oidc.service.ts` caller'larını bul ve async yap.

### Step 4: TypeScript compile verify

```bash
cd backend && npx tsc --noEmit
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `backend/src/services/oidc.service.ts` | Modify | `configs` Map → IStorageAdapter, `registerProvider/getProvider/listProviders` async |
| `backend/src/services/batchIssuance.service.ts` | Modify | `jobs` Map → IStorageAdapter, tüm public methods async, processJob explicit save |
| `backend/src/api/routes/issuer.routes.ts` | Modify | `await` ekle: `getJobStatus()`, `getJobResults()` |

## Validation

```bash
# TypeScript compile
cd backend && npx tsc --noEmit

# Batch job test (requires running server)
curl -X POST http://localhost:3000/api/v1/issuer/credentials/batch \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"credentialType":"AIAgentIdentityCredential","recipients":[{"holderDid":"did:key:z6MkTest","claims":{"agent_name":"Test"}}]}'
# → 202 { "jobId": "batch-...", "totalRequests": 1 }

# Job status (after restart bile çalışmalı)
curl http://localhost:3000/api/v1/issuer/credentials/batch/{jobId}
```

## Risks

| Risk | Olasılık | Etki | Mitigasyon |
|------|----------|------|------------|
| `processJob()` frequent DB writes (her chunk) | Orta | Yavaşlama | 10 concurrent × chunk save — kabul edilebilir |
| In-progress job restart sonrası resume edilemez | Düşük | Job stuck in 'processing' | cleanupJobs stale job'ları 'failed' yap |
| oidc caller chain async cascade | Düşük | Compile error | `tsc --noEmit` ile tespit |
| `results` array çok büyük JSONB | Düşük | Slow read | 100 max, ~5KB/result = ~500KB max |
