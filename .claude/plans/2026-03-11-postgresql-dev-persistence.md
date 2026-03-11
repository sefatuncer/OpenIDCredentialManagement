---
title: "PostgreSQL Dev Ortam Entegrasyonu"
date: 2026-03-11
module: backend
related_todos: [002]
---

## Goal

Dev ortamda (`docker-compose.dev.yml`) PostgreSQL persistence'ı aktif etmek. Mevcut storage adapter altyapısı zaten hazır — sadece dev compose'a PostgreSQL servisi eklenmeli ve `Map<>` kullanan kritik servisler storage adapter'a geçirilmeli.

## Research Findings

### Mevcut Altyapı (Zaten Hazır)
- **Storage adapter pattern**: `IStorageAdapter<T>` interface, `InMemoryStorageAdapter`, `PostgresStorageAdapter`, `RedisStorageAdapter`
- **Auto-init**: `initializeStorage('auto')` → PostgreSQL varsa kullan, yoksa memory fallback
- **Connection pool**: `database/connection.ts` — `pg` ile pool yönetimi, `DATABASE_URL` veya `DB_*` env vars
- **17 migration**: `database/migrations.ts` — tüm tablolar tanımlı
- **Prod compose**: `docker-compose.prod.yml` — PostgreSQL 15 + Redis 7 zaten tanımlı

### Storage Adapter Kullanan Servisler (Hazır ✓)
| Servis | Collection | Durum |
|--------|------------|-------|
| `openid4vci.service.ts` | `credential_offers`, `access_tokens`, `deferred_credentials`, `credential_nonces` | ✓ Adapter kullanıyor |
| `openid4vp.service.ts` | `vp_sessions` | ✓ Adapter kullanıyor |
| `audit.service.ts` | `audit_logs` | ✓ Adapter kullanıyor |
| `revocation.service.ts` | `status_lists`, `credential_statuses` | ✓ Adapter kullanıyor |
| `trustRegistry.service.ts` | `trusted_entities`, `trust_anchors`, `trust_policies` | ✓ Adapter kullanıyor |
| `multiTenant.service.ts` | `tenants`, `tenant_usage` | ✓ Adapter kullanıyor |

### Hala `Map<>` Kullanan Servisler (Geçiş Gerekli)
| Servis | Map Kullanımı | Öncelik | Geçiş Gerekli mi? |
|--------|---------------|---------|-------------------|
| `batchIssuance.service.ts` | `jobs: Map<string, BatchJob>` | HIGH | Evet — job'lar restart'ta kayboluyor |
| `schemaRegistry.service.ts` | `schemas: Map<string, CredentialSchema>` | LOW | Hayır — built-in schema'lar hardcoded, restart'ta yeniden yükleniyor |
| `expirationNotifier.service.ts` | `credentials`, `notifiedCredentials` | MEDIUM | Evet — expiration tracking kayboluyor |
| `agentCredentialRequest.service.ts` | `partnerKeys`, `organizationAgentCounts` | MEDIUM | Evet — partner kayıtları kayboluyor |
| `oidc.service.ts` | `configs`, `metadataCache`, `sessions` | LOW | Kısmen — config/metadata cache olarak kalabilir, session'lar geçmeli |
| `didResolver.service.ts` | `didCache` | LOW | Hayır — sadece TTL cache, restart'ta yeniden dolar |
| `encryption.service.ts` | `keys` | LOW | Hayır — key management ayrı bir task |
| `websocket.service.ts` | `clients` | NO | Hayır — runtime WebSocket bağlantıları, persist edilemez |
| `capabilityDiscovery.service.ts` | `agents` | LOW | Hayır — discovery cache, restart'ta yeniden keşfedilir |

### Karar: Scope

Bu plan **sadece altyapı kurulumuna** odaklanır:
1. Dev compose'a PostgreSQL ekleme
2. Backend'in PostgreSQL'e bağlanmasını sağlama
3. Migration'ların çalışması

**Map → Adapter geçişi** ayrı bir plan olarak ele alınmalı (daha büyük scope, her servis için test gerekli). Zaten kritik servisler (VCI, VP, audit, revocation, trust) adapter kullanıyor.

## Implementation Steps

### Adım 1: `docker-compose.dev.yml`'e PostgreSQL servisi ekle

Prod compose'dan basitleştirilmiş PostgreSQL config'i al:
- `postgres:15-alpine` image
- Dev credentials hardcoded (güvenli — sadece local dev)
- Health check
- Persistent volume
- Backend'e `DATABASE_URL` env var ekle
- Backend'i `depends_on: postgres` yap

### Adım 2: Backend'in `DATABASE_URL` ile başlamasını doğrula

- `index.ts` zaten `DATABASE_URL || DB_HOST` kontrolü yapıyor (satır 48)
- `initializeCore({ storageType: 'auto' })` zaten PostgreSQL varsa kullanıyor
- Sadece Docker compose'daki env var yeterli

### Adım 3: Migration'ların otomatik çalışmasını doğrula

- `index.ts:53` → `await runMigrations()` zaten çağrılıyor
- 17 migration zaten tanımlı
- Sadece PostgreSQL bağlantısı sağlandığında otomatik çalışacak

### Adım 4: Health check endpoint'inin DB durumunu raporlamasını doğrula

- Mevcut `/health/detailed` ve `/health/storage` endpoint'lerini kontrol et
- Storage type'ın `postgres` olarak görünmesini doğrula

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `docker-compose.dev.yml` | Modify | PostgreSQL servisi, DATABASE_URL, depends_on ekle |

## Validation

```bash
# 1. Docker compose'u yeniden başlat
docker compose -f docker-compose.dev.yml down
docker compose -f docker-compose.dev.yml up -d

# 2. Backend loglarında storage type'ı kontrol et
docker compose -f docker-compose.dev.yml logs backend | grep -i "storage\|postgres\|database"
# Beklenen: "Storage initialized with PostgreSQL backend"

# 3. Health endpoint'ini kontrol et
curl http://localhost:3000/health/storage | jq
# Beklenen: { "primary": "postgres", "persistent": true }

# 4. Credential offer oluştur ve restart sonrası kontrol et
curl -X POST http://localhost:3000/credential-offer \
  -H "Content-Type: application/json" \
  -d '{"credentialTypes": ["AIAgentIdentityCredential"]}'
# → offerId al

docker compose -f docker-compose.dev.yml restart backend

curl http://localhost:3000/credential-offer/{offerId}
# Beklenen: Offer hala mevcut (persist edildi)

# 5. PostgreSQL'e doğrudan bağlanıp tabloları kontrol et
docker compose -f docker-compose.dev.yml exec postgres psql -U ssi_dev -d ssi_dev -c '\dt'
# Beklenen: migration tabloları listelenir
```

## Risks

| Risk | Etki | Mitigation |
|------|------|------------|
| PostgreSQL container yavaş başlarsa backend crash olabilir | Backend başlatma hatası | `depends_on: condition: service_healthy` ile çözülür |
| Volume permission sorunu | PostgreSQL data yazamaz | Alpine image genellikle sorunsuz, gerekirse `user: postgres` ekle |
| Port 5432 zaten kullanılıyorsa | Compose başlamaz | Port mapping'i `5433:5432` olarak değiştir veya host'taki servisi durdur |
