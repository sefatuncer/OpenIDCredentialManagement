---
title: "In-Memory Map → IStorageAdapter Migration Pattern"
tags: [postgresql, storage, migration, persistence, map, adapter, async]
category: architecture
difficulty: medium
date: 2026-03-11
---

## Problem

Backend servislerinde in-memory `Map<string, T>` ile saklanan veriler server restart'ta kayboluyor. Holder wallet credentials, issuer credential offers, partner API keys gibi kritik veriler persistent storage'a geçirilmeli.

## Approach

Mevcut `IStorageAdapter<T>` pattern'ini (JSONB-based PostgreSQL) kullanarak Map'leri adapter'a migrate ettik. Yeni tablo/migration gerekmedi — `PostgresStorageAdapter` tabloyu auto-create ediyor.

## Key Details

### Migration Recipe (4 adım)

**1. Interface + Lazy Init:**
```typescript
import { IStorageAdapter, createStorageAdapter, getStorageType } from '../core/storage'

interface StoredItem {
  // Map value tipinin aynısı, + key field ekle (list() key dönmediği için)
  itemId: string  // ← key'i data'da da sakla!
  // ... diğer alanlar
}

let storage: IStorageAdapter<StoredItem> | null = null

function getStorage(): IStorageAdapter<StoredItem> {
  if (!storage) {
    storage = createStorageAdapter<StoredItem>('collection_name')
    logger.info('Storage initialized', { type: getStorageType() })
  }
  return storage
}
```

**2. CRUD Dönüşümleri:**
| Map Operation | Adapter Equivalent |
|---|---|
| `map.set(key, data)` | `await adapter.save(key, data)` |
| `map.get(key)` | `await adapter.get(key)` |
| `map.has(key)` | `await adapter.exists(key)` |
| `map.delete(key)` | `await adapter.delete(key)` |
| `Array.from(map.values())` | `await adapter.list()` |
| `for (const [k,v] of map)` + filter | `await adapter.query({ where: { field: value } })` |

**3. sync → async Dönüşümü:**
- Fonksiyon signature'ını `async` + `Promise<T>` yap
- Tüm caller'larda `await` ekle
- TypeScript compiler kaçırılan caller'ları hata olarak gösterir

**4. Key-in-Data Pattern:**
`list()` ve `query()` key dönmez, sadece data dönür. Silme/güncelleme için key'i data içinde de sakla:
```typescript
await adapter.save(offerId, { offerId, ...otherFields })
// Sonra query sonucundan:
await adapter.delete(result.data[0].offerId)
```

### Dosya Bazlı Değişiklikler

| Dosya | Collection Adları |
|-------|-------------------|
| `holder.agent.ts` | `holder_credentials` |
| `issuer.agent.ts` | `issuer_credential_offers`, `issuer_issued_credentials` |
| `agentCredentialRequest.service.ts` | `partner_keys`, `org_agent_counts` |
| `oidc.service.ts` | `oidc_provider_configs` |
| `batchIssuance.service.ts` | `batch_jobs` |
| `schemaRegistry.service.ts` | `credential_schemas` |
| `expirationNotifier.service.ts` | `expiration_credentials`, `expiration_notifications` |
| `encryption.service.ts` | `encryption_keys` |
| `capabilityDiscovery.service.ts` | `agent_profiles` |

### Auto-Created Tables
PostgresStorageAdapter `storage_<collection_name>` tablosu oluşturur:
- `key VARCHAR(255) PRIMARY KEY`
- `data JSONB NOT NULL`
- `created_at`, `updated_at` timestamps
- GIN index on data column

## Lessons Learned

1. **Key-in-data zorunlu:** `IStorageAdapter.list()` key dönmüyor. Silme/güncelleme gereken entity'lerde key'i data'ya da koy.
2. **sync→async cascade:** Bir fonksiyonu async yapınca tüm caller zinciri etkilenir. TypeScript compiler bunu yakalar — `tsc --noEmit` ile erken doğrula.
3. **Map iteration → query:** `for (const [k,v] of map)` + field match pattern'i `query({ where: { field } })` ile daha verimli (PostgreSQL index kullanır).
4. **Date handling otomatik:** PostgresStorageAdapter ISO date string'leri regex ile tespit edip `new Date()` ile geri dönüştürür. Ek işlem gerekmez.
5. **Race condition riski:** Counter pattern (get→increment→save) concurrent request'lerde race condition'a açık. Kritik counter'lar için DB-level atomic operation kullan.

## Prevention

- Yeni bir servis yazarken in-memory Map yerine doğrudan `createStorageAdapter<T>()` kullan
- Restart sonrası kaybolmaması gereken veri = adapter zorunlu
- Transient state (WebSocket connections, plugin registry) Map'te kalabilir
