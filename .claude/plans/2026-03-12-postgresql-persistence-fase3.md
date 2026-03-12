---
title: "PostgreSQL Persistence — Fase 3 (Medium Priority Services)"
date: 2026-03-12
module: backend
related_todos: [002]
---

## Goal

4 servisin in-memory Map'lerini PostgreSQL storage adapter'a migrate ederek restart sonrası veri kaybını önlemek: expirationNotifier, encryption, schemaRegistry, capabilityDiscovery.

## Research Findings

- **Mevcut pattern:** `createStorageAdapter<T>('collection')` lazy init + key-in-data (Fase 1-2'de 7 kez uygulandı)
- **IStorageAdapter API:** `save(key, data)`, `get(key)`, `delete(key)`, `list()`, `query()`, `exists()`, `update()`
- **Async cascade etkisi:**
  - `schemaRegistry` → `schema.routes.ts` caller'ları zaten `asyncHandler` içinde, ama fonksiyonlar sync — `await` eklenecek
  - `expirationNotifier` → dış caller yok (singleton, background job). `checkExpirations()` private → internal cascade
  - `encryption` → `backup.service.ts` kendi encryption'ını kullanıyor, dış caller yok
  - `capabilityDiscovery` → dış caller yok (route bağlı değil)
- **Buffer serialization (encryption):** `Buffer` JSONB'de serialize olmaz → `base64` string olarak saklanmalı, okurken `Buffer.from(str, 'base64')` ile geri dönüştürülmeli
- **Built-in schemas:** 3 hardcoded schema constructor'da yükleniyor → `initialize()` async method'a taşınacak, DB'de yoksa seed edilecek

## Implementation Steps

### Adım 1 — `schemaRegistry.service.ts` Map → storage adapter
`backend/src/services/schemaRegistry.service.ts`

1. Import `createStorageAdapter`, `IStorageAdapter` ve `getStorageType`
2. Lazy storage getter: `getSchemaStorage()` → `createStorageAdapter<CredentialSchema>('credential_schemas')`
3. `async initialize()` method: built-in schema'ları DB'de yoksa seed et (`exists()` check + `save()`)
4. Tüm Map-okuma fonksiyonlarını async yap:
   - `getAllSchemas()` → `await storage.list()` + `.filter(s => s.active)`
   - `getSchema(id)` → `await storage.get(id)`
   - `registerSchema()` → `await storage.exists()` + `await storage.save()`
   - `updateSchema()` → `await storage.get()` + `await storage.save()`
   - `deactivateSchema()` → `await storage.get()` + `await storage.save()`
   - `validateClaims()` → `await storage.get()`
   - `getCredentialConfiguration()` → `await storage.get()`
   - `getAllCredentialConfigurations()` → `await this.getAllSchemas()`
5. `schemas` Map'i kaldır

### Adım 2 — `schema.routes.ts` async cascade
`backend/src/api/routes/schema.routes.ts`

1. Tüm `schemaRegistry.*()` çağrılarına `await` ekle (6 çağrı)
2. Zaten `asyncHandler` içindeler — sadece `await` yeterli

### Adım 3 — `schemaRegistry.initialize()` çağrısını server'a ekle
`backend/src/server.ts` (veya init zinciri)

1. Server boot sırasında `await schemaRegistry.initialize()` çağır (storage init'ten sonra)

### Adım 4 — `expirationNotifier.service.ts` Map → storage adapter
`backend/src/services/expirationNotifier.service.ts`

1. Import storage modülleri
2. İki lazy storage getter:
   - `getCredentialTrackingStorage()` → `createStorageAdapter<TrackedCredential>('expiration_credentials')`
   - `getNotificationStorage()` → `createStorageAdapter<NotificationRecord>('expiration_notifications')`
3. Interface tanımla:
   - `TrackedCredential = { credentialId: string; expiresAt: string; holderDid: string; type: string }`
   - `NotificationRecord = { credentialId: string; notifiedDays: number[] }`
4. Async'e çevir:
   - `trackCredential()` → `await storage.save(credentialId, {...})`
   - `untrackCredential()` → `await storage.delete()` (her iki storage)
   - `getExpiringCredentials()` → `await storage.list()` + filter
   - `getExpiredCredentials()` → `await storage.list()` + filter
   - `checkExpirations()` → async, `await` ile list + save
   - `getStats()` → async
5. `start()` → `checkExpirations()` async çağrısı: `this.checkExpirations().catch(err => logger.error(...))`
6. `Date` serialization: `expiresAt` → ISO string olarak sakla, okurken `new Date(str)` ile geri dönüştür
7. İki Map'i kaldır

### Adım 5 — `encryption.service.ts` keys Map → storage adapter
`backend/src/services/encryption.service.ts`

1. Import storage modülleri
2. Lazy storage getter: `getKeyStorage()` → `createStorageAdapter<StoredKeyData>('encryption_keys')`
3. Interface:
   - `StoredKeyData = { keyId: string; keyBase64: string; info: KeyInfo }` (Buffer → base64 serialization)
4. **KRİTİK:** Constructor sync'de `initializeKey()` çağrılıyor — bu async olamaz
   - Çözüm: `initializeKey()` → `async initialize()` method'a taşı
   - Constructor'dan kaldır, server boot'ta `await encryptionService.initialize()` çağır
   - `encrypt()`/`decrypt()` sync kalmalı (performans-kritik, crypto ops) — key'leri memory'de cache tut
   - **Hibrit yaklaşım:** Read/write storage'a, ama aktif key'leri memory Map'te de tut (read cache)
5. Async fonksiyonlar:
   - `initialize()` → DB'den key'leri yükle, yoksa env var'dan oluştur + DB'ye kaydet
   - `addKey()` → `await storage.save()` + memory cache güncelle
   - `getActiveKeyInfo()` → memory cache'den (sync kalabilir)
   - `getAllKeysInfo()` → `await storage.list()` (nadiren çağrılır)
6. Sync kalan (memory cache): `encrypt()`, `decrypt()`, `decryptToString()`, `encryptObject()`, `decryptObject()`

### Adım 6 — `encryptionService.initialize()` çağrısını server'a ekle
`backend/src/server.ts`

1. Storage init'ten sonra `await encryptionService.initialize()` çağır

### Adım 7 — `capabilityDiscovery.service.ts` Map → storage adapter
`backend/src/services/capabilityDiscovery.service.ts`

1. Import storage modülleri
2. Lazy storage getter: `getAgentStorage()` → `createStorageAdapter<AgentProfile>('agent_profiles')`
3. `localProfile` → memory'de kalabilir (boot'ta set ediliyor, restart'ta yeniden init)
4. Async'e çevir:
   - `setLocalProfile()` → `await storage.save(profile.did, profile)`
   - `registerAgent()` → `await storage.save(profile.did, profile)`
   - `unregisterAgent()` → `await storage.delete(did)`
   - `getAgent()` → `await storage.get(did)`
   - `getAllAgents()` → `await storage.list()`
   - `findAgentsByCapability()` → `await this.getAllAgents()` + filter
   - `findAgentsByType()` → `await this.getAllAgents()` + filter
   - `findIssuersForCredentialType()` → `await this.getAllAgents()` + filter
   - `findVerifiersByProtocol()` → `await this.getAllAgents()` + filter
   - `hasCapability()` → `await storage.get(did)`
   - `getCapabilities()` → `await storage.get(did)`
   - `updateLastSeen()` → `await storage.get()` + `await storage.save()`
   - `getStaleAgents()` → `await this.getAllAgents()` + filter
   - `pruneStaleAgents()` → `await this.getStaleAgents()` + `await storage.delete()`
   - `getStats()` → `await this.getAllAgents()`
5. `agents` Map'i kaldır
6. `Date` serialization: `lastSeen` → ISO string sakla, okurken `new Date()` dönüştür

### Adım 8 — TypeScript doğrulama
1. `tsc --noEmit` çalıştır — kaçırılan `await`'leri yakala
2. Tüm hataları düzelt

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `backend/src/services/schemaRegistry.service.ts` | Modify | Map → storage adapter, tüm fonksiyonlar async |
| `backend/src/api/routes/schema.routes.ts` | Modify | `await` ekle (6 çağrı) |
| `backend/src/services/expirationNotifier.service.ts` | Modify | 2 Map → 2 storage adapter, async |
| `backend/src/services/encryption.service.ts` | Modify | keys Map → storage adapter + memory cache hibrit |
| `backend/src/services/capabilityDiscovery.service.ts` | Modify | agents Map → storage adapter, async |
| `backend/src/server.ts` | Modify | `initialize()` çağrıları ekle (schemaRegistry, encryptionService) |

## Validation

```bash
# 1. TypeScript compile check
cd backend && npx tsc --noEmit

# 2. Docker ile test
docker compose -f docker-compose.dev.yml up -d

# 3. Schema CRUD test
curl http://localhost:3000/schemas
curl -X POST http://localhost:3000/schemas -H 'Content-Type: application/json' -d '{"id":"TestSchema","name":"Test","version":"1.0.0","type":"TestSchema","description":"test","required":[],"context":[],"credentialSubject":{"type":"Test","properties":{}},"active":true}'
# Restart backend, verify TestSchema persists:
curl http://localhost:3000/schemas

# 4. PostgreSQL'de collection tabloları kontrol
docker exec oidcm-postgres-1 psql -U ssi_dev -d ssi_dev -c "SELECT tablename FROM pg_tables WHERE tablename LIKE 'storage_%';"
```

## Risks

| Risk | Mitigation |
|------|-----------|
| `encryption.service.ts` Buffer serialization kaybı | base64 encode/decode + unit test |
| `checkExpirations()` async setInterval uyumsuzluğu | `.catch()` ile hata yakalama, unhandled rejection önleme |
| Built-in schema'lar DB'de modified ise seed üzerine yazma | `exists()` check — DB'deyse atla, yoksa seed |
| `Date` JSONB serialization | ISO string olarak sakla, PostgresStorageAdapter zaten auto-detect yapıyor |
| `encryption` sync caller'lar (encrypt/decrypt) | Memory cache hibrit — hot path sync kalır, persistence async |

## Sıralama & Bağımlılıklar

```
Adım 1-3: schemaRegistry (bağımsız, en çok caller'ı olan)
  ↓
Adım 4: expirationNotifier (bağımsız)
  ↓
Adım 5-6: encryption (server.ts init sırası önemli — storage init'ten sonra)
  ↓
Adım 7: capabilityDiscovery (bağımsız)
  ↓
Adım 8: tsc --noEmit final doğrulama
```

Adım 1-3 ve Adım 4 paralel çalışılabilir (bağımsız). Adım 5-6, Adım 7 de birbirinden bağımsız.
