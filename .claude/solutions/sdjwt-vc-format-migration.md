---
title: "SD-JWT VC Format Migration (jwt_vc_json → vc+sd-jwt)"
tags: [sd-jwt, openid4vci, credential-format, eidas, selective-disclosure, migration]
category: openid4vci
difficulty: medium
date: 2026-03-11
---

## Problem

Proje referansı tum credential'ların SD-JWT VC formatında olmasını gerektiriyor (eIDAS 2.0 / EUDI ARF uyumlu). Mevcut credential'lar `jwt_vc_json` formatında issue ediliyordu — plain JWT-VC, selective disclosure yok.

## Approach

`sdjwtService.createSDJWTVC()` zaten tam çalışıyordu (issuance + verification + presentation). Sorun sadece **bağlama** (wiring) idi — `issueCredential()` fonksiyonundan çağrılmıyordu. Yaklaşım:

1. **Format switch** — `issueCredential()` içinde `requestedFormat === 'vc+sd-jwt'` kontrolü
2. **SD claim tanımları** — `SD_CLAIMS_BY_TYPE` map'i ile her credential type için hangi claim'ler SD
3. **Metadata config generation** — Base config'lerden hem `jwt_vc_json` hem `vc+sd-jwt` config'ler üretilir
4. **`_sdjwt` suffix convention** — `credential_configuration_id` alanında format bilgisi taşınır
5. **Backward compat** — `jwt_vc_json` hala destekleniyor, varsayılan artık `vc+sd-jwt`

## Key Details

### Dosyalar

| Dosya | Değişiklik |
|-------|-----------|
| `backend/src/services/openid4vci.service.ts` | `SD_CLAIMS_BY_TYPE`, `buildCredentialConfigurations()`, `issueCredential()` format switch |
| `backend/src/agents/issuer.agent.ts` | 3 issue fonksiyonuna `options.format` param, offer URI'da config ID |
| `backend/src/api/routes/issuer.routes.ts` | `req.body.format` forwarding |
| `backend/src/api/schemas/validation.schemas.ts` | `credentialFormatSchema` Zod enum validation |
| `backend/src/agents/holder.agent.ts` | SD-JWT combined string depolama, `isSDJWT` flag |
| `frontend-issuer-verifier/src/components/CredentialForm.tsx` | Format selector UI |

### SD Claim Tanımları

```typescript
const SD_CLAIMS_BY_TYPE: Record<string, string[]> = {
  AIAgentIdentityCredential: ['agent_name', 'agent_version', 'capabilities', 'owner_name', 'trust_level'],
  DelegationCredential: ['delegator_name', 'delegate_name', 'constraints', 'purpose'],
  CapabilityCredential: ['conditions', 'granted_by'],
}
```

**Kural:** Kimlik belirleyici alanlar (ID'ler, DID'ler, scope) mandatory; tanımlayıcı/opsiyonel alanlar (isimler, yetenekler) selectively disclosable.

### Config ID Convention

- `AIAgentIdentityCredential` → JWT-VC format
- `AIAgentIdentityCredential_sdjwt` → SD-JWT VC format
- `configId.replace(/_sdjwt$/, '')` ile base type elde edilir

### Metadata Generation Pattern

`buildCredentialConfigurations(baseUrl)` fonksiyonu base config'lerden her iki format için configs üretir. Tekrar ortadan kalkar, SD claim'ler `SD_CLAIMS_BY_TYPE`'dan `mandatory: false` olarak işaretlenir.

### Holder Storage

```typescript
storedCredentials = Map<string, {
  jwt: string        // JWT kısmı (ilk ~ öncesi)
  combined?: string  // Tam SD-JWT string (jwt~disclosure1~disclosure2~...)
  format: string     // 'jwt_vc_json' | 'vc+sd-jwt'
}>
```

## Lessons Learned

1. **Mevcut altyapıyı kontrol et** — `sdjwtService` zaten issuance yapıyordu, sadece bağlama eksikti. Yeni kod yazmak yerine mevcut servisi entegre etmek hem daha az riskli hem daha hızlı.
2. **Format bilgisini config ID'ye göm** — `_sdjwt` suffix convention, offer URI'dan credential request'e kadar format bilgisini taşır. Ayrı format parametresi de desteklenir ama convention daha sağlam.
3. **Input validation unutma** — Review'da yakalandı: `req.body.format` Zod schema'ya eklenmemişti. Yeni field eklerken validation schema'yı da güncelle.
4. **Metadata tekrarını helper ile çöz** — 6 credential config (3 format x 2) yerine 3 base config + generator pattern. Yeni credential type eklendiğinde sadece `baseConfigs`'e eklenir.

## Prevention

- Yeni credential field eklerken: (1) Zod schema, (2) TypeScript interface, (3) API response — üçünü birden güncelle.
- Credential format eklerken: `buildCredentialConfigurations()` + `SD_CLAIMS_BY_TYPE` + `issueCredential()` format switch.
