---
title: "Issuer SD-JWT Credential Form — Schema-Driven Dynamic Issuance"
date: 2026-03-12
module: frontend
related_todos: [005]
---

## Goal

Mevcut `CredentialForm` bileşenini geliştirerek schema registry'den dinamik claim formu, selective disclosure claim seçimi (checkbox), expiration picker ve issue öncesi önizleme eklemek. Backend zaten SD-JWT issuance'ı destekliyor — bu görev tamamen frontend UI.

## Research Findings

### Mevcut Durum
- **CredentialForm.tsx** (407 satır): 3 hardcoded credential type, format seçimi var ama SD claim seçimi yok
- **IssueCredential.tsx**: Form + QR code iki sütunlu layout — yeniden kullanılacak
- **Schema Registry API**: `schemaApi.list()` ve `schemaApi.get(id)` hazır
- **Schema verisi**: Her schema'da `issuanceConfig.selectiveDisclosure: string[]` SD-eligible claim'leri tanımlıyor
- **Backend**: `format: 'vc+sd-jwt'` zaten issuance endpoint'lere gönderiliyor
- **Stil**: Custom CSS dark theme, `.form-group`, `.form-label`, `.form-input`, `.btn-issuer` class'ları

### Yaklaşım Kararı
CredentialForm'u **genişletmek** yerine, yeni bir **schema-driven form page** oluşturmak daha temiz:
- Mevcut CredentialForm 3 hardcoded type'ı destekliyor ve zaten karmaşık (407 satır)
- Yeni sayfa schema registry'den gelen dinamik şemalar için tasarlanacak
- Mevcut IssueCredential sayfası olduğu gibi kalacak (backward compat)
- Yeni sayfa `/issuer/issue-advanced` route'unda olacak

## Implementation Steps

### Adım 1 — Schema-driven issuance page oluştur
`frontend-issuer-verifier/src/pages/IssueAdvanced.tsx`

Yeni sayfa, 3 adımlı wizard:

**Step 1: Schema & Claims**
- Schema dropdown (schemaApi.list() ile doldur, sadece `active` olanlar)
- Schema seçilince: `credentialSubject.properties` üzerinden dinamik form alanları oluştur
  - `type: 'string'` → text input
  - `type: 'number'` → number input
  - `type: 'boolean'` → checkbox
  - `type: 'array'` → comma-separated text input
  - `required` field'lar yıldız (*) ile işaretli
- Holder DID input (mevcut pattern: select veya manual)
- Credential Format dropdown (`vc+sd-jwt` default, `jwt_vc_json` alternatif)

**Step 2: Selective Disclosure & Options** (sadece `vc+sd-jwt` format seçiliyse göster)
- SD-eligible claim'ler checkbox listesi olarak göster
  - Schema'nın `issuanceConfig.selectiveDisclosure` dizisindeki claim'ler
  - Checkbox checked = bu claim gizlenebilir (SD), unchecked = mandatory (always revealed)
  - Varsayılan: schema'daki SD claim'lerin hepsi checked
- Expiration date picker (validity period, schema'dan varsayılan: `issuanceConfig.validityPeriod`)
- Revocable toggle (schema'dan varsayılan: `issuanceConfig.revocable`)

**Step 3: Preview & Issue**
- Credential claim'lerinin JSON preview'u
- SD claim'ler `🔒 Selective Disclosure` badge ile işaretli
- Mandatory claim'ler `✅ Always Visible` badge ile işaretli
- "Issue Credential" butonu → API çağrısı
- Başarılı ise: QR code + offer URI (mevcut IssueCredential pattern)

### Adım 2 — API service'e `issueBySchema` method ekle
`frontend-issuer-verifier/src/services/api.ts`

```typescript
issueBySchema: (data: {
  holderDid: string;
  schemaId: string;
  claims: Record<string, unknown>;
  format?: 'jwt_vc_json' | 'vc+sd-jwt';
  selectiveDisclosureClaims?: string[];
  validityDays?: number;
  revocable?: boolean;
}) => request<{ credentialOfferId: string; credentialOfferUri: string }>(
  '/issuer/credentials/schema-issue',
  { method: 'POST', body: JSON.stringify(data) }
)
```

### Adım 3 — Backend endpoint: schema-based issuance
`backend/src/api/routes/issuer.routes.ts`

Yeni endpoint: `POST /issuer/credentials/schema-issue`
- Schema ID'den credential type'ı çıkar
- `schemaRegistry.validateClaims()` ile claim validation
- Mevcut `issueAgentIdentityCredential` / `issueDelegation` / `issueCapability` fonksiyonlarına yönlendir (schema type'a göre)
- SD claims'i request'ten al (override) veya schema default'unu kullan

### Adım 4 — Zod validation schema ekle
`backend/src/api/schemas/validation.schemas.ts`

```typescript
export const schemaIssueRequestSchema = z.object({
  holderDid: didSchema,
  schemaId: z.string().min(1).max(100),
  claims: z.record(z.unknown()),
  format: credentialFormatSchema.optional(),
  selectiveDisclosureClaims: z.array(z.string()).optional(),
  validityDays: z.number().positive().optional(),
  revocable: z.boolean().optional(),
})
```

### Adım 5 — Route ve navigation ekle
- `frontend-issuer-verifier/src/App.tsx`: `/issuer/issue-advanced` route
- `frontend-issuer-verifier/src/components/Layout.tsx`: Nav'a "Advanced Issue" link ekle
- `frontend-issuer-verifier/src/pages/IssuerDashboard.tsx`: Dashboard'a card ekle

### Adım 6 — TypeScript doğrulama
```bash
cd frontend-issuer-verifier && npx tsc --noEmit
cd backend && npx tsc --noEmit
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `frontend-issuer-verifier/src/pages/IssueAdvanced.tsx` | Create | Schema-driven 3-step wizard (claim form + SD seçimi + preview + QR) |
| `frontend-issuer-verifier/src/services/api.ts` | Modify | `issueBySchema` method ekle |
| `frontend-issuer-verifier/src/App.tsx` | Modify | `/issuer/issue-advanced` route ekle |
| `frontend-issuer-verifier/src/components/Layout.tsx` | Modify | Nav'a link ekle |
| `backend/src/api/routes/issuer.routes.ts` | Modify | `POST /issuer/credentials/schema-issue` endpoint |
| `backend/src/api/schemas/validation.schemas.ts` | Modify | `schemaIssueRequestSchema` ekle |

## Validation

```bash
# 1. TypeScript compile
cd frontend-issuer-verifier && npx tsc --noEmit
cd backend && npx tsc --noEmit

# 2. UI test
# Login → Issuer → Advanced Issue → Schema seç → Claims doldur → SD claims seç → Preview → Issue → QR code

# 3. API test
curl -X POST http://localhost:3000/api/v1/issuer/credentials/schema-issue \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "holderDid": "did:key:z...",
    "schemaId": "AIAgentIdentityCredential",
    "claims": { "agentId": "test-1", "agentType": "autonomous", "agentName": "Test" },
    "format": "vc+sd-jwt",
    "selectiveDisclosureClaims": ["agentName"]
  }'
```

## Risks

| Risk | Mitigation |
|------|-----------|
| Schema claim type'ları frontend'de doğru render edilmemesi | `type` field'ına göre switch — fallback: text input |
| Mevcut 3 issuance fonksiyonu schema ID'yi tanımaması | Backend endpoint schema type → mevcut fonksiyon mapping |
| IssueAdvanced sayfa boyutu 300+ satırı geçmesi | Wizard step'lerini ayrı component'lere böl (gerekirse) |
| SD claim'ler ile mandatory claim'ler karışması | Schema'dan `required` + `selectiveDisclosure` ayrımı net |
