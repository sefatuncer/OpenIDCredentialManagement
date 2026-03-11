---
title: "Batch Credential Issuance"
date: 2026-03-11
module: all
related_todos: [001]
---

## Goal

Birden fazla credential'ı tek seferde issue edebilme. Backend'de batch endpoint + validation, frontend'de batch form + CSV/JSON import + progress tracking UI.

## Research Findings

### Mevcut Altyapı
- `openid4vci.service.ts:940-966` — `issueBatchCredentials()` zaten var ama OID4VCI spec endpoint'i olarak çalışıyor (access token gerekli, proof JWT kontrolü, serial loop). **Bu fonksiyonun karmaşıklığı batch kullanım için uygun değil** — her credential için ayrı nonce/proof validation yapıyor.
- `openid4vci.routes.ts:407-431` — `/batch-credential` route mevcut ama OID4VCI wallet flow'u için (bearer token gerekli)
- Feature flag `module.batch-issuance` zaten tanımlı ve default enabled (`feature-flags.ts:86-92`)
- `issuer.agent.ts` — `issueAgentIdentityCredential`, `issueDelegationCredential`, `issueCapabilityCredential` fonksiyonları tek tek credential offer oluşturuyor. **Batch için bu fonksiyonları loop'ta çağırmak yeterli.**
- Zod validation schemas: `agentIdentityCredentialSchema`, `delegationCredentialSchema`, `capabilityCredentialSchema` mevcut
- `credentialIssuanceRateLimiter`: 30/min — batch için yeterli (1 batch request = 1 rate limit hit)

### Frontend
- `IssueCredential.tsx` — Tek credential form, `CredentialForm.tsx` component kullanıyor
- `api.ts` — `request<T>()` wrapper, `issuerApi.issueAgentIdentity()` vb. mevcut
- Routing: `/issuer/issue` mevcut, `/issuer/issue-batch` eklenecek
- Toast + useConfirm hook'ları mevcut — progress/confirmation için kullanılabilir

### Tasarım Kararları
1. **Issuer Agent path kullan** (not OID4VCI spec endpoint) — Frontend authenticated, her credential için ayrı offer oluşturulur, wallet URI'ler QR ile paylaşılır
2. **Tek credential type per batch** — Bir batch'te tüm credential'lar aynı tipte olmalı (mixed type karmaşıklığı gereksiz)
3. **Serial processing** — 100 credential limiti ile serial loop yeterli, job queue overkill
4. **Partial success** — Her credential bağımsız, biri fail olursa diğerleri devam eder. Sonuçta summary döner.

## Implementation Steps

### Faz 1: Backend — Batch Endpoint

**Adım 1:** Batch validation schema → `backend/src/api/schemas/validation.schemas.ts`
- `batchIssuanceSchema` ekle: credentialType enum + credentials array (max 100)
- Her credential tipi için mevcut schema'yı reuse et (discriminated union)

**Adım 2:** Batch issuance service fonksiyonu → `backend/src/services/batch-issuance.service.ts`
- `issueBatchCredentials(type, credentials[])` — issuer.agent fonksiyonlarını loop'ta çağırır
- Her credential için: offer oluştur, result veya error kaydet
- Summary döndür: `{ total, successful, failed, results[] }`
- Feature flag kontrolü
- Audit event emit

**Adım 3:** Batch route → `backend/src/api/routes/issuer.routes.ts`
- `POST /issuer/credentials/batch` endpoint ekle
- `credentialIssuanceRateLimiter` + `validateBody(batchIssuanceSchema)` middleware
- asyncHandler ile sarma

### Faz 2: Frontend — Batch Issue Page

**Adım 4:** Batch API çağrısı → `frontend-issuer-verifier/src/services/api.ts`
- `issuerApi.issueBatch(type, credentials[])` ekle

**Adım 5:** Batch issue page → `frontend-issuer-verifier/src/pages/BatchIssueCredential.tsx`
- 3 aşamalı wizard: (1) Type seçimi + veri girişi, (2) Review, (3) Results
- Manual entry: Satır ekle/sil ile tablo-form hybrid
- CSV import: File upload + parse + preview
- JSON import: File upload veya paste + parse + preview
- Her satırda client-side validation (mevcut validation lib kullan)
- Submit: useConfirm ile onay → API call → progress state → results

**Adım 6:** Route ekle → `frontend-issuer-verifier/src/App.tsx`
- `/issuer/issue-batch` → `BatchIssueCredential` page

**Adım 7:** Dashboard'a link → `frontend-issuer-verifier/src/pages/IssuerDashboard.tsx`
- "Batch Issue" kartı ekle

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `backend/src/services/batch-issuance.service.ts` | Create | Batch issuance service — loop + summary + audit |
| `backend/src/api/schemas/validation.schemas.ts` | Modify | `batchIssuanceSchema` ekle |
| `backend/src/api/routes/issuer.routes.ts` | Modify | `POST /issuer/credentials/batch` endpoint |
| `frontend-issuer-verifier/src/services/api.ts` | Modify | `issuerApi.issueBatch()` fonksiyonu |
| `frontend-issuer-verifier/src/pages/BatchIssueCredential.tsx` | Create | Batch issue wizard page |
| `frontend-issuer-verifier/src/App.tsx` | Modify | `/issuer/issue-batch` route |
| `frontend-issuer-verifier/src/pages/IssuerDashboard.tsx` | Modify | Batch issue kart linki |

## API Contract

### `POST /api/v1/issuer/credentials/batch`

**Request:**
```json
{
  "credentialType": "AIAgentIdentityCredential",
  "credentials": [
    {
      "holderDid": "did:key:z6Mk...",
      "agentType": "autonomous",
      "agentName": "Agent-1",
      "capabilities": ["text-generation"],
      "ownerDid": "did:key:z6Mk...",
      "trustLevel": "standard"
    },
    {
      "holderDid": "did:key:z6Mk...",
      "agentType": "supervised",
      "agentName": "Agent-2",
      "capabilities": ["data-analysis"],
      "ownerDid": "did:key:z6Mk...",
      "trustLevel": "basic"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "summary": {
    "total": 2,
    "successful": 2,
    "failed": 0
  },
  "results": [
    {
      "index": 0,
      "success": true,
      "credentialOfferId": "uuid-1",
      "credentialOfferUri": "openid-credential-offer://..."
    },
    {
      "index": 1,
      "success": true,
      "credentialOfferId": "uuid-2",
      "credentialOfferUri": "openid-credential-offer://..."
    }
  ]
}
```

**Error in single item:**
```json
{
  "index": 1,
  "success": false,
  "error": "Invalid holderDid format"
}
```

## CSV Format (per credential type)

### AIAgentIdentityCredential
```csv
holderDid,agentType,agentName,capabilities,ownerDid,trustLevel
did:key:z6Mk...,autonomous,Agent-1,"text-generation,data-analysis",did:key:z6Mk...,standard
```

### DelegationCredential
```csv
holderDid,delegatorDid,delegateDid,scope,purpose,validUntil
did:key:z6Mk...,did:key:z6Mk1...,did:key:z6Mk2...,read;write,General,2027-01-01T00:00:00Z
```

### CapabilityCredential
```csv
holderDid,capabilityType,resource,actions,validUntil
did:key:z6Mk...,api_access,https://api.example.com/*,read;write,2027-01-01T00:00:00Z
```

## Validation

1. Backend TypeScript derlemesi: `cd backend && npx tsc --noEmit`
2. Frontend TypeScript derlemesi: `cd frontend-issuer-verifier && npx tsc --noEmit`
3. API testi:
   ```bash
   curl -X POST http://localhost:3000/api/v1/issuer/credentials/batch \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <token>" \
     -d '{"credentialType":"AIAgentIdentityCredential","credentials":[{"holderDid":"did:key:z6MkTest","agentType":"autonomous","agentName":"Test","capabilities":["test"],"ownerDid":"did:key:z6MkOwner","trustLevel":"basic"}]}'
   ```
4. Frontend: `/issuer/issue-batch` sayfası yüklenmeli, CSV import çalışmalı, batch submit sonuç döndürmeli

## Risks

| Risk | Etki | Azaltma |
|------|------|---------|
| 100 credential serial loop yavaş olabilir (>30sn) | Orta | Her credential ~100ms → 10sn toplamda. Kabul edilebilir. Gerekirse parallelism eklenebilir. |
| CSV parsing edge case'ler (özel karakterler, encoding) | Düşük | Papa Parse gibi library yerine basit split kullan, JSON import'u alternatif olarak sun |
| `openid4vci.service.ts` 1108 satır, ek batch mantığı eklenmemeli | Orta | Ayrı `batch-issuance.service.ts` dosyası oluştur, issuer.agent fonksiyonlarını delege et |
| Rate limiter batch'i single request olarak sayar, ama backend'de loop var | Düşük | Rate limit request bazlı (1 batch = 1 hit), iç loop rate limit'e takılmaz |
