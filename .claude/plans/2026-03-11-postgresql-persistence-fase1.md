---
title: "PostgreSQL Persistence — Fase 1 (Critical Map→Adapter Migration)"
date: 2026-03-11
module: backend
related_todos: [002]
---

## Goal

Migrate 3 critical in-memory Map storage'ları → IStorageAdapter (PostgreSQL) pattern'ine. Restart sonrası holder credentials, issuer offers/issued credentials ve partner key'ler korunacak.

## Research Findings

- **Mevcut pattern:** `createStorageAdapter<T>('collection_name')` ile lazy init. `openid4vp.service.ts:42-51` referans.
- **JSONB storage:** PostgresStorageAdapter tek `data` JSONB column kullanır, tablo auto-create (`CREATE TABLE IF NOT EXISTS`). Migration dosyası gerekmiyor.
- **Date handling:** `JSON.stringify()` → ISO string, geri okumada regex ile `new Date()` dönüşümü otomatik.
- **Upsert:** `INSERT ... ON CONFLICT (key) DO UPDATE SET data = $2`.
- **Key pattern:** UUID key ile `save(key, data)`, `get(key)` → `T | null`.

## Implementation Steps

### Step 1: `holder.agent.ts` — storedCredentials Map → adapter

**Değişiklik:**
1. Import `IStorageAdapter`, `createStorageAdapter`, `getStorageType` from `../core/storage`
2. `storedCredentials` Map'i kaldır, yerine lazy-init adapter pattern:
   ```typescript
   interface StoredCredential {
     id: string
     jwt: string
     type: string
     format: string
     combined?: string
     issuerDid: string
     receivedAt: Date
     payload: VCPayload
   }

   let holderCredentialsStorage: IStorageAdapter<StoredCredential> | null = null

   function getHolderCredentialsStorage(): IStorageAdapter<StoredCredential> {
     if (!holderCredentialsStorage) {
       holderCredentialsStorage = createStorageAdapter<StoredCredential>('holder_credentials')
       logger.info('Holder credentials storage initialized', { type: getStorageType() })
     }
     return holderCredentialsStorage
   }
   ```
3. Tüm `storedCredentials.set(id, data)` → `await getHolderCredentialsStorage().save(id, data)`
4. Tüm `storedCredentials.get(id)` → `await getHolderCredentialsStorage().get(id)`
5. Tüm `storedCredentials.has(id)` → `await getHolderCredentialsStorage().exists(id)`
6. Tüm `storedCredentials.delete(id)` → `await getHolderCredentialsStorage().delete(id)`
7. `Array.from(storedCredentials.values())` → `await getHolderCredentialsStorage().list()`
8. `for (const [id, cred] of storedCredentials)` → `const allCreds = await getHolderCredentialsStorage().list()`

**Etkilenen fonksiyonlar (sync → async dönüşüm):**
- `receiveCredentialOffer()` — zaten async ✓
- `getStoredCredentials()` — zaten async ✓
- `deleteCredential()` — zaten async ✓
- `getCredential()` — **sync → async** (breaking change, caller'lar güncellenmeli)
- `addCredential()` — **sync → async** (breaking change, caller'lar güncellenmeli)
- `findMatchingCredentials()` — **sync → async** (internal, caller `presentCredential` zaten async)

### Step 2: `issuer.agent.ts` — credentialOffers + issuedCredentials Map → adapter

**Değişiklik:**
1. Import `IStorageAdapter`, `createStorageAdapter`, `getStorageType` from `../core/storage`
2. İki Map'i kaldır, yerine iki lazy-init adapter:
   ```typescript
   interface StoredCredentialOffer {
     type: string
     subject: Record<string, unknown>
     holderDid: string
     createdAt: Date
     accessToken?: string
   }

   interface StoredIssuedCredential {
     jwt: string
     type: string
     holderDid: string
     issuedAt: Date
   }

   let offersStorage: IStorageAdapter<StoredCredentialOffer> | null = null
   let issuedStorage: IStorageAdapter<StoredIssuedCredential> | null = null

   function getOffersStorage(): IStorageAdapter<StoredCredentialOffer> { ... }
   function getIssuedStorage(): IStorageAdapter<StoredIssuedCredential> { ... }
   ```
3. `credentialOffers.set()` → `await getOffersStorage().save()`
4. `credentialOffers.get()` → `await getOffersStorage().get()`
5. `credentialOffers.delete()` → `await getOffersStorage().delete()`
6. `credentialOffers.entries()` iteration → `await getOffersStorage().list()` + filter
7. `issuedCredentials.set()` → `await getIssuedStorage().save()`
8. `issuedCredentials.get()` → `await getIssuedStorage().get()`
9. `issuedCredentials.entries()` → `await getIssuedStorage().list()`

**Etkilenen fonksiyonlar (sync → async dönüşüm):**
- `issueAgentIdentityCredential()` — zaten async ✓
- `issueDelegationCredential()` — zaten async ✓
- `issueCapabilityCredential()` — zaten async ✓
- `claimCredential()` — zaten async ✓
- `exchangePreAuthorizedCode()` — **sync → async** (breaking, caller'lar güncellenmeli)
- `getCredentialOffer()` — **sync → async**
- `getAllCredentialOffers()` — **sync → async**
- `getIssuedCredential()` — **sync → async**
- `getAllIssuedCredentials()` — **sync → async**

### Step 3: `agentCredentialRequest.service.ts` — partnerKeys + orgAgentCounts → adapter

**Değişiklik:**
1. Import `IStorageAdapter`, `createStorageAdapter`, `getStorageType` from `../core/storage`
2. İki Map'i kaldır, yerine iki lazy-init adapter:
   ```typescript
   interface StoredPartnerKey {
     organizationDid: string
     organizationName: string
     trustLevel: AgentTrustLevel
   }

   interface StoredOrgAgentCount {
     count: number
   }

   let partnerKeysStorage: IStorageAdapter<StoredPartnerKey> | null = null
   let orgAgentCountsStorage: IStorageAdapter<StoredOrgAgentCount> | null = null
   ```
3. `partnerKeys.set()` → `await getPartnerKeysStorage().save()`
4. `partnerKeys.get()` → `await getPartnerKeysStorage().get()`
5. `partnerKeys.delete()` → `await getPartnerKeysStorage().delete()`
6. `organizationAgentCounts.get()` → `await getOrgAgentCountsStorage().get()`
7. `organizationAgentCounts.set()` → `await getOrgAgentCountsStorage().save()`

**Etkilenen fonksiyonlar (sync → async dönüşüm):**
- `processCredentialRequest()` — zaten async ✓
- `validatePartnerKey()` — zaten async ✓
- `registerPartnerKey()` — **sync → async**
- `revokePartnerKey()` — **sync → async**
- `getOrganizationAgentCount()` — **sync → async**
- `decrementOrganizationAgentCount()` — **sync → async**

### Step 4: Caller güncellemeleri

Sync → async dönüşen fonksiyonların caller'larını bul ve `await` ekle:
- `getCredential()` → route handler'larda kullanılıyor
- `addCredential()` → route handler'larda kullanılıyor
- `exchangePreAuthorizedCode()` → issuer route'larında kullanılıyor
- `getCredentialOffer()` / `getAllCredentialOffers()` → route handler'lar
- `getIssuedCredential()` / `getAllIssuedCredentials()` → route handler'lar
- `registerPartnerKey()` / `revokePartnerKey()` → route handler'lar
- `getOrganizationAgentCount()` / `decrementOrganizationAgentCount()` → route/service

### Step 5: `exchangePreAuthorizedCode` — iteration pattern değişikliği

Bu fonksiyon `for (const [offerId, offer] of credentialOffers.entries())` ile Map iterate ediyor ve `offer.accessToken === preAuthorizedCode` ile eşleştiriyor. Adapter pattern'e geçince:

```typescript
// Option A: query ile (JSONB field match)
const result = await getOffersStorage().query({
  where: { accessToken: preAuthorizedCode },
  limit: 1,
})
if (result.data.length > 0) { ... }
```

Bu, Map iteration'dan daha verimli (PostgreSQL index kullanır).

Aynı pattern `claimCredential()` için de geçerli — `accessToken` ile offer bulma.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `backend/src/agents/holder.agent.ts` | Modify | storedCredentials Map → IStorageAdapter, sync→async dönüşümler |
| `backend/src/agents/issuer.agent.ts` | Modify | credentialOffers + issuedCredentials Map → IStorageAdapter |
| `backend/src/services/agentCredentialRequest.service.ts` | Modify | partnerKeys + orgAgentCounts Map → IStorageAdapter |
| `backend/src/api/routes/holder.routes.ts` | Modify | async caller güncellemeleri (getCredential, addCredential) |
| `backend/src/api/routes/issuer.routes.ts` | Modify | async caller güncellemeleri (exchangePreAuthorizedCode, etc.) |
| Diğer caller dosyaları | Modify | Tespite bağlı — grep ile bulunacak |

## Validation

```bash
# 1. TypeScript compile check
cd backend && npx tsc --noEmit

# 2. Docker ile test
docker compose -f docker-compose.dev.yml up -d
# Backend loglarında "storage initialized" mesajları gözlenecek

# 3. Restart test — kritik kabul kriteri
docker compose -f docker-compose.dev.yml restart backend
# Restart sonrası:
# - GET /api/v1/holder/credentials → önceden kaydedilen credential'lar hâlâ var
# - GET /api/v1/issuer/offers → mevcut offer'lar hâlâ var

# 4. API fonksiyonel test
# Credential offer oluştur → token exchange → credential claim → restart → credential hâlâ var
```

## Risks

| Risk | Olasılık | Etki | Mitigasyon |
|------|----------|------|------------|
| sync→async caller'ları kaçırma | Orta | Compile error (iyi!) | `npx tsc --noEmit` ile yakalanır |
| Date serialization kaybı | Düşük | Tarih alanları string kalır | PostgresStorageAdapter zaten regex ile dönüştürüyor |
| `exchangePreAuthorizedCode` query performansı | Düşük | İlk çağrıda tablo oluşturma | JSONB GIN index auto-create |
| Mevcut in-memory veri kaybı (deploy sırasında) | Kesin | Mevcut dev verisi silinir | Kabul edilebilir — dev ortamı |
| `findMatchingCredentials` async dönüşümü | Düşük | Internal fonksiyon, tek caller | `presentCredential` zaten async |
