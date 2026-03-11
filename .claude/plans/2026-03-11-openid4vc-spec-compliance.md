---
title: "OpenID4VCI/VP Spec Uyumluluk Düzeltmeleri"
date: 2026-03-11
module: backend
related_todos: []
---

## Goal

OpenID4VCI (Draft 13+) ve OpenID4VP (Draft 20+) spec uyumsuzluklarını düzeltmek. Projede aynı anda hem eski hem yeni field adları kullanılıyor — bu tutarsızlığı gidermek, mevcut runtime bug'ları çözmek ve interoperability'yi artırmak.

## Mevcut Runtime Bug'lar

> Bu düzeltmeler sadece naming değil, **aktif interop hatalarını** da çözüyor.

### BUG-1: Credential Offer Interop Hatası
- `openid4vci.service.ts:395` → offer'ı `credentials` field'ıyla **oluşturuyor**
- `holder.agent.ts:91` → offer'ı `credential_configuration_ids` olarak **okuyor**
- **Sonuç:** Holder agent, VCI service'in ürettiği offer'ı parse edemez → `undefined || []` → boş array

### BUG-2: VP Response URI Hatası
- `openid4vp.service.ts:432` → authorization request'te `response_uri` kullanıyor (direct_post için doğru)
- `holder.agent.ts:221` → `authRequest.redirect_uri` okuyor (YANLIŞ field)
- **Sonuç:** Holder, VP submission'ı yanlış adrese göndermeye çalışır

### BUG-3: Credential Request Field Uyumsuzluğu
- `holder.agent.ts:126` → credential request'te `credential_configuration_id` gönderiyor
- `openid4vci.service.ts:765` → sadece `credential_definition.type` okuyor, `credential_configuration_id`'yi yok sayıyor
- **Sonuç:** Credential tipi belirlemede holder'ın gönderdiği bilgi kullanılmıyor

## Research Findings

### Mevcut Tutarsızlık

Projede **iki farklı katman** var ve bunlar farklı spec versiyonlarını kullanıyor:

| Dosya | Field | Spec Durumu |
|-------|-------|-------------|
| `openid4vci.service.ts:132` | `credentials: string[]` | **ESKİ** (Draft 11) |
| `issuer.agent.ts:109,161,210` | `credential_configuration_ids` | **YENİ** (Draft 13+) ✓ |
| `holder.agent.ts:91` | `credential_configuration_ids` | **YENİ** (Draft 13+) ✓ |
| `web-wallet/src/api.ts:13` | `credential_configuration_ids` | **YENİ** (Draft 13+) ✓ |
| `openid4vci.service.ts:137` | `user_pin_required: boolean` | **ESKİ** (Draft 11) |
| `openid4vci.service.ts:158` | `cryptographic_suites_supported` | **ESKİ** (Draft 11) |
| `credential-mapper.service.ts:261` | `cryptographic_suites_supported` | **ESKİ** (Draft 11) |
| `schemaRegistry.service.ts:273` | `credential_signing_alg_values_supported` | **YENİ** (Draft 13+) ✓ |

### VP DID Resolution Tutarsızlığı

| Dosya | Desteklenen DID Methods |
|-------|------------------------|
| `openid4vci.service.ts:1096` (`resolvePublicKeyFromDid`) | did:key, did:web, did:peer ✓ |
| `openid4vp.service.ts:631` (VP signature) | **SADECE did:key** ✗ |
| `openid4vp.service.ts:674` (VC signature) | **SADECE did:key** ✗ |
| `sdjwt.service.ts:613` (SD-JWT verify) | **SADECE did:key** ✗ |
| `sdjwt.service.ts:669` (KB-JWT verify) | **SADECE did:key** ✗ |

### Çözüm Stratejisi

`resolvePublicKeyFromDid()` fonksiyonu `openid4vci.service.ts`'de zaten tüm DID method'larını destekliyor. Bu fonksiyonu ortak bir yere taşıyıp VP ve SD-JWT servislerinde de kullanmak yeterli.

**Not:** `didResolver.service.ts` şu anda hiçbir dış kütüphane import etmiyor (pure DID Document resolution). `resolvePublicKeyFromDid()` ise `jose.importJWK()` kullanıyor ve `jose.KeyLike` döndürüyor. Mimari temizlik için bu fonksiyon `didResolver.service.ts`'e eklenmeli ama `jose` bağımlılığı bilinçli olarak eklenmiş olacak.

## Implementation Steps

### Adım 1: `resolvePublicKeyFromDid()` ortak modüle taşı → `backend/src/services/didResolver.service.ts`

`openid4vci.service.ts:1096-1175` satırlarındaki `resolvePublicKeyFromDid()` fonksiyonunu `didResolver.service.ts`'e taşı ve export et.

**Gerekli değişiklikler:**
- `didResolver.service.ts`'e `jose` import'u ekle (`import * as jose from 'jose'`)
- `resolveDidKey` import'u ekle (`import { resolveDidKey } from '../agents/base.agent'`)
- Fonksiyonu export et: `export async function resolvePublicKeyFromDid(did: string): Promise<jose.KeyLike | null>`
- `openid4vci.service.ts`'deki local fonksiyonu sil, import'a çevir

**Circular dependency kontrolü:**
- `didResolver.service.ts` → `base.agent.ts` (yeni, resolveDidKey için) ✓
- `base.agent.ts` → `didResolver.service.ts` import ETMEZ ✓
- Circular yok.

### Adım 2: OpenID4VCI Credential Offer — `credentials` → `credential_configuration_ids` → `openid4vci.service.ts`

**BUG-1'i çözer.**

- `CredentialOffer` interface'inde `credentials` → `credential_configuration_ids` olarak değiştir
- Tüm kullanım yerlerini güncelle (satır 395, 551, 1011)
- **Backward compatibility (oluşturma tarafında):** Geçiş döneminde offer oluştururken HER İKİ field'ı da gönder:
  ```typescript
  credential_configuration_ids: credentialTypes,
  credentials: credentialTypes,  // eski client'lar için (deprecated, geçici)
  ```
- **Backward compatibility (okuma tarafında):** `exchangePreAuthorizedCode` ve `issueCredential`'da scope belirlerken:
  ```typescript
  const types = offer.credential_configuration_ids || offer.credentials || []
  ```

### Adım 3: OpenID4VCI Grant — `user_pin_required` → `tx_code` → `openid4vci.service.ts` + `openid4vci.routes.ts`

- Grant interface'inde `user_pin_required: boolean` → `tx_code?: { input_mode: string; length: number; description?: string }` olarak değiştir
- `createCredentialOffer()` fonksiyonunda `options.userPinRequired` → `options.txCode` olarak güncelle
- **`openid4vci.routes.ts` güncellemeleri:**
  - Satır 96-98: Swagger doc `userPinRequired` → `txCode` olarak güncelle
  - Satır 120: Route handler `req.body.userPinRequired` → `req.body.txCode` olarak güncelle
  - Satır 225-226: Swagger doc `user_pin` → `tx_code` olarak güncelle
  - Satır 253: Token endpoint `req.body.user_pin` → `req.body.tx_code` olarak güncelle (eski `user_pin`'i de kabul et, backward compat)

### Adım 4: Credential Endpoint — `credential_configuration_id` desteği ekle → `openid4vci.service.ts`

**BUG-3'ü çözer.**

- `CredentialRequest` interface'ine `credential_configuration_id?: string` ekle
- `issueCredential()` fonksiyonunda (satır 765) credential tipi belirlerken:
  ```typescript
  // Öncelik sırası: credential_configuration_id > credential_definition.type
  const credentialType = request.credential_configuration_id
    || request.credential_definition?.type?.[request.credential_definition.type.length - 1]
    || 'AIAgentIdentityCredential'
  ```
- `openid4vci.routes.ts` Swagger doc'ına `credential_configuration_id` parametresini ekle

### Adım 5: Issuer Metadata — `cryptographic_suites_supported` → `credential_signing_alg_values_supported` → `openid4vci.service.ts` + `credential-mapper.service.ts`

- `CredentialConfiguration` interface'inde field adını güncelle:
  - `cryptographic_suites_supported` → `credential_signing_alg_values_supported`
- `getIssuerMetadata()` içindeki 3 credential config'i güncelle (satır 237, 267, 292)
- `credential-mapper.service.ts:261` güncelle

### Adım 6: OpenID4VP — `client_id_scheme` ekle → `openid4vp.service.ts`

- `AuthorizationRequest` interface'ine `client_id_scheme?: string` ekle
- `createAuthorizationRequest()` fonksiyonunda `client_id_scheme: 'did'` ata
- Authorization request URI'ye parametre olarak ekle

### Adım 7: OpenID4VP — Universal DID resolution → `openid4vp.service.ts`

- `resolvePublicKeyFromDid`'i `didResolver.service.ts`'den import et
- VP signature doğrulamada (satır 631): `resolveDidKey` + `startsWith('did:key:')` yerine `resolvePublicKeyFromDid` kullan
- VC signature doğrulamada (satır 674): aynı değişiklik
- `resolveDidKey` import'unu kaldır (artık gerekli değil)

### Adım 8: SD-JWT — Universal DID resolution → `sdjwt.service.ts`

- `resolvePublicKeyFromDid`'i `didResolver.service.ts`'den import et
- `verifySignature()` (satır 613): `resolveDidKey` + `startsWith('did:key:')` yerine `resolvePublicKeyFromDid` kullan
- `verifyKeyBindingJWT()` (satır 669): aynı değişiklik
- `resolveDidKey` import'unu kaldır

### Adım 9: Holder Agent — `redirect_uri` → `response_uri` düzelt → `holder.agent.ts`

**BUG-2'yi çözer.**

- `holder.agent.ts:221` → `authRequest.redirect_uri` → `authRequest.response_uri` olarak düzelt
- `holder.agent.ts:236` → VP submission hedefini `response_uri`'den al:
  ```typescript
  const submitUrl = authRequest.response_uri || authRequest.redirect_uri
  ```

### Adım 10: Testleri güncelle → `backend/tests/`

- `openid4vci.test.ts` — `credentials` → `credential_configuration_ids` field kontrollerini güncelle
- Token endpoint testlerinde `user_pin` → `tx_code` güncelle
- Credential request testlerine `credential_configuration_id` case'i ekle
- Mevcut e2e testlerin geçtiğini doğrula

### Adım 11: Swagger/OpenAPI doc'larını güncelle → `openid4vci.routes.ts` + `openid4vp.routes.ts`

- `openid4vci.routes.ts`:
  - Credential offer endpoint: `userPinRequired` → `txCode` (object type)
  - Token endpoint: `user_pin` → `tx_code`
  - Credential endpoint: `credential_configuration_id` parametresi ekle
- `openid4vp.routes.ts`:
  - Authorization request response'a `client_id_scheme` field'ı ekle

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `backend/src/services/didResolver.service.ts` | Modify | `resolvePublicKeyFromDid()` taşı, `jose` + `base.agent` import ekle |
| `backend/src/services/openid4vci.service.ts` | Modify | `credentials` → `credential_configuration_ids`, `user_pin_required` → `tx_code`, `cryptographic_suites_supported` → `credential_signing_alg_values_supported`, `credential_configuration_id` desteği, local `resolvePublicKeyFromDid`'i import'a çevir |
| `backend/src/api/routes/openid4vci.routes.ts` | Modify | Route handler'lar (`txCode`, `tx_code`), Swagger doc güncellemeleri |
| `backend/src/services/openid4vp.service.ts` | Modify | `client_id_scheme` ekle, universal DID resolution kullan |
| `backend/src/api/routes/openid4vp.routes.ts` | Modify | Swagger doc'a `client_id_scheme` ekle |
| `backend/src/services/sdjwt.service.ts` | Modify | Universal DID resolution kullan |
| `backend/src/services/credential-mapper.service.ts` | Modify | `cryptographic_suites_supported` → `credential_signing_alg_values_supported` |
| `backend/src/agents/holder.agent.ts` | Modify | `redirect_uri` → `response_uri` düzelt |
| `backend/tests/integration/openid4vci.test.ts` | Modify | Yeni field adlarına göre güncelle |

## Validation

```bash
# 1. TypeScript compilation
cd backend && npx tsc --noEmit

# 2. Unit/Integration testleri
npm test

# 3. Manuel API kontrolü — Issuer metadata
curl http://localhost:3000/.well-known/openid-credential-issuer | jq '.credential_configurations_supported.AIAgentIdentityCredential | keys'
# Beklenen: credential_signing_alg_values_supported (cryptographic_suites_supported DEĞİL)

# 4. Manuel API kontrolü — Credential offer
curl -X POST http://localhost:3000/credential-offer -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"credentialTypes": ["AIAgentIdentityCredential"]}' | jq '.credentialOffer | keys'
# Beklenen: credential_configuration_ids VE credentials (backward compat)

# 5. Manuel API kontrolü — VP authorization request
curl -X POST http://localhost:3000/api/v1/openid4vp/authorization-request \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"presentationDefinitionId": "agent-identity"}' | jq '.authorizationRequest.client_id_scheme'
# Beklenen: "did"

# 6. Credential request with credential_configuration_id
# (token endpoint'ten alınan access_token ile)
curl -X POST http://localhost:3000/credential \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"format": "jwt_vc_json", "credential_configuration_id": "AIAgentIdentityCredential", "proof": {...}}'
# Beklenen: credential issued successfully
```

## Risks

| Risk | Etki | Mitigation |
|------|------|------------|
| Dış wallet'lar eski `credentials` field'ı bekliyorsa | Credential offer parse hatası | Geçiş döneminde her iki field'ı da gönder (Adım 2) |
| Dış wallet'lar `user_pin` parametresi gönderiyorsa | Token exchange hatası | Token endpoint'te her iki parametre adını da kabul et (Adım 3) |
| Credo-TS'nin kendi offer formatı kullanması | Credo path'te format uyumsuzluğu | Credo path'i değiştirmiyoruz, sadece Jose fallback path'i güncelliyoruz |
| `resolvePublicKeyFromDid` taşınırken `jose` bağımlılığı | Mimari değişiklik | `didResolver.service.ts` artık crypto-aware olacak, bu bilinçli karar |
| Holder agent `response_uri` düzeltmesi | Mevcut entegrasyon testleri kırılabilir | Test'lerde de güncelle (Adım 10) |
| Swagger doc'lar güncellenmezse | API consumer'lar yanlış bilgi alır | Adım 11 ile birlikte güncelle |

## Uygulama Sırası (Öncelik)

1. **Adım 1** — resolvePublicKeyFromDid taşı (altyapı, diğer adımların bağımlılığı)
2. **Adım 2** — credentials → credential_configuration_ids (BUG-1 fix)
3. **Adım 9** — response_uri düzelt (BUG-2 fix)
4. **Adım 4** — credential_configuration_id desteği (BUG-3 fix)
5. **Adım 3** — user_pin_required → tx_code
6. **Adım 5** — cryptographic_suites_supported rename
7. **Adım 6** — client_id_scheme ekle
8. **Adım 7** — VP universal DID resolution
9. **Adım 8** — SD-JWT universal DID resolution
10. **Adım 10** — Testler
11. **Adım 11** — Swagger doc'lar
