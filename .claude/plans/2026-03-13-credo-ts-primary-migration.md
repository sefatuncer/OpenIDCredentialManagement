---
title: "Credo-TS PRIMARY Migration — Jose Fallback'tan Credo-TS Tek Motor Mimarisine Geçiş"
date: 2026-03-13
module: all
related_todos: [031]
---

## Goal

Jose-based agent'ları (issuer.agent, verifier.agent, holder.agent) ve bunların ~2000 satırlık OpenID4VCI/VP service'lerini Credo-TS'in OpenID4VC modülüne devretmek. Askar'ı zorunlu kılmak, route path'leri birleştirmek, test altyapısını ESM-uyumlu hale getirmek.

## Mevcut Durum (Problem Analizi)

### Neden Değişmeli?

1. **2000+ satır duplicate kod**: `openid4vci.service.ts` (1181L) ve `openid4vp.service.ts` (885L) aslında Credo'nun zaten yaptığı işi Jose ile tekrar uyguluyor
2. **İkili route yapısı**: `/api/v1/openid4vci/*` (Jose) ve `/oid4vci/*` (Credo) — aynı işi iki path'te yapıyor
3. **Anahtar güvenliği**: Jose JWK'ları JSONB'de saklanıyor, Askar ise şifreli wallet sunuyor
4. **Spec takibi**: OpenID4VCI/VP draft değişikliklerini elle uyguluyoruz, Credo bunu takip ediyor
5. **Test boşluğu**: Jest/CJS nedeniyle Credo hiç test edilmiyor, mock'lanıyor

### Mevcut Credo Entegrasyon Noktaları

| Dosya | Satır | `isUsingCredo()` / Credo çağrısı |
|-------|-------|----------------------------------|
| `openid4vci.service.ts` | 416 | `createCredentialOffer()` — Credo varsa önce onu dene |
| `openid4vp.service.ts` | 380 | `createAuthorizationRequest()` — Credo varsa önce onu dene |
| `holder.agent.ts` | 97, 255 | `receiveCredentialOffer()`, `presentCredential()` — Credo-first |
| `openid4vci.routes.ts` | 50 | `.well-known` metadata — Credo priority |

### Korunması Gereken İş Mantığı

Bu servisler sadece OpenID4VCI/VP protokol implementasyonu değil, aynı zamanda şunları da içerir:

- **SD-JWT credential oluşturma** (`SD_CLAIMS_BY_TYPE`, `sdjwtService.createSDJWTVC()`)
- **Multi-tenant isolation** (`tenantId` enrichment, `saveTenantData`)
- **Revocation check** (`isCredentialRevoked()` + StatusList2021)
- **EventBus emit** (`credential.issued`, `credential.offer.created`)
- **Nonce/replay protection** (c_nonce management)
- **Session storage** (PostgreSQL `IStorageAdapter`)
- **Cleanup jobs** (5-minute interval, expired offers/sessions)
- **Presentation definitions** (hardcoded PDs for agent-identity, delegation, capability)
- **Deferred credential** flow
- **Batch credential** issuance

Bu mantık Credo'ya taşınamaz — Credo sadece protokol motoru olarak kullanılmalı.

---

## Mimari Karar: Thin Wrapper Stratejisi

**Credo'yu doğrudan API olarak kullanmak yerine, mevcut service'lerin iç motorunu Jose'dan Credo'ya değiştireceğiz.**

```
ÖNCE (şimdiki):
  Route → Service → if(credo) { credo } else { jose_implementation }
                     ~500 satır Credo path + ~500 satır Jose path

SONRA (hedef):
  Route → Service → Credo (zorunlu) + iş mantığı (SD-JWT, tenant, revocation, events)
                     Jose kaldırıldı, iş mantığı korunuyor
```

Bu yaklaşımın avantajı:
- API kontratı **hiç değişmez** (route'lar, request/response shape'leri aynı kalır)
- Frontend'ler **hiçbir değişiklik gerektirmez**
- İş mantığı (SD-JWT, tenant, revocation) service katmanında **korunur**
- Credo sadece **kriptografik motor** olarak kullanılır (anahtar yönetimi, imzalama, doğrulama)

---

## Implementation Steps

### Faz 1: Altyapı Hazırlığı (Askar Zorunlu + Test Altyapısı)

#### Adım 1.1: Askar'ı Zorunlu Kıl
→ `backend/src/agents/credo.agent.ts`

- `checkAskarAvailability()` → başarısızsa `throw` (warn yerine)
- `initializeCredoAgent()` → `null` return yerine hata fırlat
- Yeni: `ensureAskarOrDie()` fonksiyonu — boot'ta çağrılacak

→ `backend/src/index.ts`

- Jose agent init'lerini (`initializeIssuerAgent`, `initializeVerifierAgent`, `initializeHolderAgent`) Credo init'ten **sonraya** taşı
- Boot sırası değişikliği:
  ```
  ÖNCE: Jose agents → Express → Credo (optional) → finalize
  SONRA: Express → Credo (zorunlu) → Jose agents (Credo DID'ini kullanarak) → finalize
  ```

→ `backend/scripts/register-askar.js`

- Sessiz fallback kaldır, hata fırlat:
  ```js
  try { registerAskar(...) }
  catch (e) { console.error('FATAL: Askar required'); process.exit(1) }
  ```

→ `backend/Dockerfile`

- CMD'ye preloader ekle:
  ```dockerfile
  CMD ["node", "--require", "./scripts/register-askar.js", "dist/index.js"]
  ```
- Build sonrası Askar doğrulama:
  ```dockerfile
  RUN node -e "require('@openwallet-foundation/askar-nodejs'); console.log('Askar OK')"
  ```

→ `backend/package.json`

- `"start"` script'ini güncelle:
  ```json
  "start": "node --require ./scripts/register-askar.js dist/index.js"
  ```

#### Adım 1.2: Test Altyapısını Jest→Vitest'e Geçir
→ `backend/package.json`

- Jest bağımlılıklarını kaldır: `jest`, `ts-jest`, `@types/jest`
- Vitest ekle: `vitest`

→ `backend/vitest.config.ts` (YENİ)

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: './tests/setup.ts',
    testTimeout: 30000,
    include: ['tests/**/*.test.ts'],
  },
})
```

→ `backend/jest.config.js` — SİL

→ `backend/tests/__mocks__/@credo-ts/*.js` — SİL (6 dosya)
  - Vitest ESM-native olduğundan Credo mock'ları gerekmez
  - Gerçek Credo modülleri yüklenecek

→ `backend/tests/setup.ts`

- `jest.setTimeout()` → Vitest globals (`vi.setConfig({ testTimeout: 30000 })`)
- `expect.extend()` → Vitest `expect.extend()` (aynı API)
- `jest.fn()` → `vi.fn()` (tüm test dosyalarında)

→ `backend/tsconfig.json`

- Test ortamı için ayrı `tsconfig.test.json`:
  ```json
  {
    "extends": "./tsconfig.json",
    "compilerOptions": {
      "module": "ES2022",
      "moduleResolution": "bundler"
    }
  }
  ```
- Ana `tsconfig.json`'u değiştirmiyoruz (CJS çıktı üretim için hâlâ gerekli)

→ Tüm `*.test.ts` dosyaları (49 dosya)

- `jest.fn()` → `vi.fn()`
- `jest.spyOn()` → `vi.spyOn()`
- `jest.mock()` → `vi.mock()`
- `jest.clearAllMocks()` → `vi.clearAllMocks()`
- `beforeAll`/`afterAll`/`describe`/`it`/`expect` → aynı kalır (Vitest uyumlu)

### Faz 2: Credo'yu Tek DID/Key Kaynağı Yap

#### Adım 2.1: Base Agent'ı Credo KMS'e Bağla
→ `backend/src/agents/base.agent.ts`

- `generateKeyPair()` → Credo `agent.kms.createKey()` kullanacak şekilde değiştir
- `createDidKey()` → Credo `agent.dids.create()` kullanacak şekilde değiştir
- `BaseAgentInstance` arayüzü korunur, iç implementasyon değişir
- `createJwtVc()` → Credo `agent.w3cCredentials.signCredential()` veya mevcut Jose (SD-JWT için hâlâ gerekli)
- `verifyJwtVc()` → Credo verification veya Jose (kalabilir — lightweight)
- `resolveDidKey()` → mevcut `didResolver.service.ts` kullanmaya devam (merkezi çözüm)

**Dikkat:** `base.agent.ts`'den export edilen `resolveDidKey` fonksiyonu `didResolver.service.ts` tarafından import ediliyor. Bu bağımlılık korunmalı.

#### Adım 2.2: Issuer Agent'ı Credo Issuer'a Bağla
→ `backend/src/agents/issuer.agent.ts`

- `initializeIssuerAgent()` → Credo agent'ın issuer API'sini alacak:
  ```typescript
  const credoAgent = getCredoAgent()
  const issuerApi = credoAgent.modules.openId4Vc.issuer
  ```
- DID: `getIssuerDid()` → Credo `getAgentDid()` döner (kendi key üretimi yok)
- `issueAgentIdentityCredential()` → `createCredentialOffer()` (service katmanı üzerinden, zaten var)
- `issueCredentialDirect()` → Jose imzalama kalabilir (batch bypass, Credo offer flow'suz)
- Offer/token storage: service katmanında, agent'ta değişiklik minimal

#### Adım 2.3: Verifier Agent — Zaten Thin Wrapper
→ `backend/src/agents/verifier.agent.ts`

- DID: `getVerifierDid()` → Credo `getAgentDid()` döner
- Geri kalanı zaten `openid4vp.service.ts`'e delege ediyor — minimal değişiklik

#### Adım 2.4: Holder Agent'ı Credo-Only Yap
→ `backend/src/agents/holder.agent.ts`

- `receiveCredentialOffer()`:
  - `isUsingCredo()` kontrolünü kaldır — her zaman Credo path
  - Jose fallback bloğunu sil (~80 satır)
- `presentCredential()`:
  - `isUsingCredo()` kontrolünü kaldır — her zaman Credo path
  - Jose fallback bloğunu sil (~60 satır)
- Credential storage (`holder_credentials`) korunur — Credo'dan gelen VC'ler buraya yazılır
- SD-JWT detection (`combined` field, `~` separator) korunur

### Faz 3: OpenID4VCI Service — Credo Motor, İş Mantığı Korunur

#### Adım 3.1: `openid4vci.service.ts` Refactor
→ `backend/src/services/openid4vci.service.ts`

**Kaldırılacaklar (~400 satır):**
- Jose-based offer oluşturma (satır 447-510) — Credo'nun `createCredentialOffer()` kullanılacak
- Jose-based token exchange (satır 528-656) — Credo'nun token endpoint'i kullanılacak
- Jose-based credential issuance proof validation (satır 709-828) — Credo bunu yapar
- Jose-based JWT signing (satır 852-900) — Credo imzalar

**Korunacaklar (iş mantığı):**
- `getIssuerMetadata()` → Credo metadata ile birleştir veya Credo'dan al
- `getAuthorizationServerMetadata()` → Korunur
- `SD_CLAIMS_BY_TYPE` map → Korunur (Credo credential mapper callback'inde kullanılır)
- `buildCredentialConfigurations()` → Credo issuer config'ine feed eder
- `buildCredentialSubject()` → Credo credential mapper callback'inde çağrılır
- Storage CRUD (offers, tokens, nonces) → Session tracking için korunur
- Multi-tenant logic → Korunur
- EventBus emit → Korunur
- Cleanup jobs → Korunur
- Deferred credential → Korunur (Credo desteklemiyor, Jose'da kalabilir)
- Batch issuance → `issueCredentialDirect()` Jose'da kalabilir (offer bypass)

**Yeni yapı:**
```typescript
export async function createCredentialOffer(...) {
  // Credo doğrudan (fallback yok)
  const credoResult = await credoCreateOffer(credentialTypes, options)

  // İş mantığı (aynı kalır)
  await saveTenantData(storage, offerId, tenantId, offerData)
  eventBus.emit('credential.offer.created', { ... })

  return { offerId, credentialOffer, credentialOfferUri }
}
```

#### Adım 3.2: Credo Credential Mapper Güncelleme
→ `backend/src/agents/credo.agent.ts`

- `credentialRequestToCredentialMapper()` callback'ini zenginleştir:
  - SD-JWT format desteği ekle (`_sdjwt` suffix detection)
  - `SD_CLAIMS_BY_TYPE` kullanarak selective disclosure claims ayarla
  - `sdjwtService.createSDJWTVC()` çağır (SD-JWT format istendiğinde)
  - EventBus emit (zaten var, genişlet)

### Faz 4: OpenID4VP Service — Credo Motor, İş Mantığı Korunur

#### Adım 4.1: `openid4vp.service.ts` Refactor
→ `backend/src/services/openid4vp.service.ts`

**Kaldırılacaklar (~300 satır):**
- Jose-based authorization request oluşturma (satır 427-505) — Credo yapacak
- Jose-based VP token verification (satır 604-784) — Credo yapacak
- Jose-based signature verification — Credo yapacak

**Korunacaklar:**
- `PRESENTATION_DEFINITIONS` map → Credo verifier config'ine feed eder
- `getVerifierClientMetadata()` → Korunur
- `handleDirectPost()` → Credo event listener'a dönüşür (veya thin wrapper kalır)
- Session storage + status management → Korunur
- Revocation check logic → Credo sonrası ek doğrulama olarak korunur
- Multi-tenant logic → Korunur
- Cleanup jobs → Korunur
- EventBus emit → Korunur

**Yeni yapı:**
```typescript
export async function createAuthorizationRequest(...) {
  // Credo doğrudan
  const credoResult = await credoCreateVerificationRequest(presentationDefinition)

  // Session storage (hybrid tracking)
  const session = { id: credoResult.sessionId, ... }
  await saveTenantData(storage, sessionId, tenantId, session)

  return { sessionId, authorizationRequest, authorizationRequestUri }
}
```

#### Adım 4.2: Direct Post Handler
→ `backend/src/api/server.ts`

- Mevcut Jose-based `/direct_post` handler'ı:
  - Credo kendi direct_post endpoint'ini `/oid4vp/*` altında kaydeder
  - İki seçenek:
    - **A)** Jose handler'ı kaldır, Credo'ya bırak → ama session sync lazım
    - **B)** Jose handler korunsun, Credo'dan gelen event'leri dinlesin → daha güvenli
  - **Tercih: B** — Credo VP event'i (`OpenId4VcVerificationSessionStateChanged`) geldiğinde session'ı güncelle

### Faz 5: Route Birleştirme

#### Adım 5.1: Path Birleştirme
→ `backend/src/agents/credo.agent.ts`

- Credo issuer base path: `/oid4vci` → `/api/v1/openid4vci` olarak değiştir
- Credo verifier base path: `/oid4vp` → `/api/v1/openid4vp` olarak değiştir

**VEYA** daha güvenli yaklaşım:
- Credo route'ları `/oid4vci` ve `/oid4vp`'de kalsın
- Jose route dosyaları (`openid4vci.routes.ts`, `openid4vp.routes.ts`) Credo'ya proxy yapsın
- Bu sayede middleware zinciri (rate limit, tenant, logging) korunur

**Tercih:** Proxy yaklaşımı — mevcut middleware'leri bozmaz.

#### Adım 5.2: Well-Known Endpoint Birleştirme
→ `backend/src/api/routes/openid4vci.routes.ts`

- `isUsingCredo()` kontrolünü kaldır
- Her zaman Credo metadata dönsün
- Jose metadata fonksiyonlarını kaldır

### Faz 6: Client-Side Jose Durumu

#### Web Wallet (Browser) — Jose ZORUNLU, Değişiklik YOK

Askar bir C++ native modüldür, browser'da çalışmaz. Bu dosyalar Jose kullanmaya **devam etmek zorundadır**:

- `web-wallet/src/services/vp.service.ts` — Client-side VP imzalama (crypto.subtle üzerinden Jose)
- `web-wallet/src/services/wallet-key.service.ts` — AES-GCM-256 private key encryption
- `web-wallet/src/services/sdjwt.service.ts` — Client-side SD-JWT parse (base64url decode, kriptografi yok)
- `web-wallet/src/services/sdjwt-presentation.service.ts` — SD-JWT presentation

**Neden değiştirilemez:** Browser ortamında tek seçenek Web Crypto API'dir. Jose zaten bu API'nin üstüne ince bir sarmalayıcıdır. Askar, Credo veya başka bir native modül browser'da çalışmaz.

#### Mobile Wallet (React Native) — Jose KALIR (pragmatik tercih)

Teknik olarak `@credo-ts/react-native` + `@openwallet-foundation/askar-react-native` kullanılabilir. Ancak:

- Expo **managed workflow**'dan çıkmak gerekir (`expo prebuild` veya eject) — native modül gerektirir
- Şu an mobile wallet Jose'yu sadece 3 iş için kullanıyor: key gen (~20 satır), VP sign (~40 satır), SD-JWT parse (~30 satır)
- Credo RN entegrasyonu bu ~90 satırlık işlevsellik için overkill — Expo eject + native build pipeline + ~2GB Askar binary
- Mobile wallet'ın %100 reuse ettiği web-wallet servisleri (vp.service, sdjwt.service) zaten Jose — ikisini birden değiştirmek gerekir

**Karar:** Mobile wallet'ta Jose kalır. Credo RN entegrasyonu ayrı bir todo olarak değerlendirilebilir (Expo eject kararı gerektirir).

Bu dosyalar DEĞİŞMEZ:
- `mobile-wallet/src/services/vp.service.ts` — Mobile VP (Jose, expo-secure-store)
- `mobile-wallet/src/services/wallet-key.service.ts` — SecureStore key management
- `mobile-wallet/src/services/sdjwt.service.ts` — SD-JWT parse
- `mobile-wallet/src/services/sdjwt-presentation.service.ts` — SD-JWT presentation

#### Özet: Jose Nerede Kalıyor, Nerede Kalkıyor?

| Katman | Jose Durumu | Neden |
|--------|-------------|-------|
| **Backend services** | **KALKIYOR** | Credo-TS PRIMARY oluyor |
| **Backend agents** | **KALKIYOR** | Credo KMS/DID kullanılacak |
| **Backend batch issuance** | **KALIYOR** (geçici) | `issueCredentialDirect()` offer bypass, sonra Credo'ya taşınabilir |
| **Backend deferred credential** | **KALIYOR** (geçici) | Credo tam desteklemiyor |
| **Web wallet (browser)** | **KALIYOR** (zorunlu) | Askar browser'da çalışmaz |
| **Mobile wallet (RN)** | **KALIYOR** (pragmatik) | Expo eject gerekir, overkill |
| **SDK** | **DEĞİŞMEZ** | HTTP client, kriptografi yok |

---

## Files to Create/Modify

| Dosya | Aksiyon | Faz | Açıklama |
|-------|---------|-----|----------|
| `backend/src/agents/credo.agent.ts` | Modify | 1,2,3,5 | Askar zorunlu, credential mapper zenginleştir, base path değiştir |
| `backend/src/agents/base.agent.ts` | Modify | 2 | Key gen → Credo KMS, DID → Credo DID |
| `backend/src/agents/issuer.agent.ts` | Modify | 2 | DID Credo'dan, offer flow service'e delege |
| `backend/src/agents/verifier.agent.ts` | Modify | 2 | DID Credo'dan (minimal) |
| `backend/src/agents/holder.agent.ts` | Modify | 2 | Jose fallback kaldır, Credo-only |
| `backend/src/services/openid4vci.service.ts` | Modify | 3 | Jose impl kaldır (~400L), Credo-only motor |
| `backend/src/services/openid4vp.service.ts` | Modify | 4 | Jose impl kaldır (~300L), Credo-only motor |
| `backend/src/services/credo.service.ts` | Modify | 1 | `isUsingCredo()` → her zaman true, basitleştir |
| `backend/src/index.ts` | Modify | 1 | Boot sırası: Credo → agents |
| `backend/src/api/server.ts` | Modify | 4 | direct_post handler güncelle |
| `backend/src/api/routes/openid4vci.routes.ts` | Modify | 5 | Credo metadata direkt, isUsingCredo kaldır |
| `backend/src/api/routes/openid4vp.routes.ts` | Modify | 5 | isUsingCredo kontrolleri kaldır |
| `backend/scripts/register-askar.js` | Modify | 1 | Sessiz fallback → fatal error |
| `backend/Dockerfile` | Modify | 1 | CMD'ye preloader ekle, build doğrulama |
| `backend/package.json` | Modify | 1 | start script, jest→vitest |
| `backend/vitest.config.ts` | Create | 1 | Vitest konfigürasyonu |
| `backend/jest.config.js` | Delete | 1 | Jest artık kullanılmıyor |
| `backend/tests/__mocks__/@credo-ts/*.js` | Delete | 1 | 6 mock dosyası (Vitest ESM-native) |
| `backend/tests/setup.ts` | Modify | 1 | jest.* → vi.* |
| `backend/tests/**/*.test.ts` | Modify | 1 | jest.fn→vi.fn, jest.mock→vi.mock (49 dosya) |
| `docker-compose.dev.yml` | Modify | 1 | Backend command güncelle |

**Silinecek satır tahmini:** ~700-800 satır (Jose fallback kodları)
**Değişecek dosya sayısı:** ~60+ dosya (49 test + 12 kaynak)

---

## Validation

### Faz 1 Doğrulama
```bash
# Askar zorunlu — Askar olmadan başlatma denemesi
CREDO_WALLET_KEY=test node dist/index.js
# Beklenen: "FATAL: Askar required" hatası ile çıkış

# Docker build doğrulama
docker build -t ssi-backend ./backend
# Beklenen: "Askar OK" build log'u

# Vitest çalışma
cd backend && npx vitest run
# Beklenen: 49 suite pass (bazı testler Credo gerçek modülleriyle çalışacak)
```

### Faz 2-4 Doğrulama
```bash
# Docker compose ile tam sistem
docker compose -f docker-compose.dev.yml up --build

# Credential issuance (Credo motor)
curl -X POST http://localhost:3000/api/v1/issuer/credentials/agent-identity \
  -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"holderDid":"did:key:z6Mk...", "agentType":"autonomous", "agentName":"Test"}'
# Beklenen: credentialOfferUri (openid-credential-offer://...)

# VP verification (Credo motor)
curl -X POST http://localhost:3000/api/v1/verifier/verify/agent-identity \
  -H "X-API-Key: $API_KEY"
# Beklenen: authorizationRequestUri (openid4vp://...)

# Health check
curl http://localhost:3000/health/detailed
# Beklenen: { "ssi": { "mode": "credo", "agentReady": true } }

# Well-known metadata
curl http://localhost:3000/.well-known/openid-credential-issuer
# Beklenen: Credo-generated metadata
```

### Faz 5 Doğrulama
```bash
# Eski Credo path'leri (artık /api/v1/ altında olmalı veya proxy)
curl http://localhost:3000/oid4vci/credential
# Beklenen: 404 veya Credo endpoint (route birleştirme stratejisine bağlı)
```

### Regression Doğrulama
```bash
# Tüm testler
cd backend && npx vitest run

# Frontend'ler değişmeden çalışmalı
cd frontend-issuer-verifier && npm run dev
cd web-wallet && npm run dev

# SDK değişmeden çalışmalı
cd sdk && npm test
```

---

## Risks

### Yüksek Risk

1. **Credo credential mapper callback'i SD-JWT desteklemiyor**
   - Credo'nun `credentialRequestToCredentialMapper` W3C `ClaimFormat.JwtVc` döner
   - SD-JWT (`vc+sd-jwt`) format'ı Credo callback'inde implemente edilmeli
   - **Mitigation:** Callback'te format detection + `sdjwtService.createSDJWTVC()` çağrısı

2. **Credo token exchange Jose storage ile senkron değil**
   - Credo kendi session/token yönetimini yapar
   - Mevcut `access_tokens`, `credential_nonces` storage'ları Credo ile çakışabilir
   - **Mitigation:** Hybrid storage — Credo manages protocol, service manages business state

3. **49 test dosyasında jest→vi migration hatalı olabilir**
   - `jest.mock()` ve `vi.mock()` davranış farkları (hoisting, factory fn)
   - **Mitigation:** Her test dosyasını tek tek çalıştır, kırılanları düzelt

### Orta Risk

4. **`issueCredentialDirect()` (batch bypass) Jose'da kalıyor**
   - Bu fonksiyon Credo offer flow'unu bypass eder
   - Credo'ya migration'dan sonra da Jose imzalama kullanacak
   - **Mitigation:** Bu kabul edilebilir — batch bir edge case, sonra Credo'ya taşınabilir

5. **Deferred credential flow Credo'da yok**
   - Credo OpenID4VCI modülü deferred credential'ı tam desteklemiyor olabilir
   - **Mitigation:** Bu flow Jose'da kalır (az kullanılan özellik)

6. **Direct post route çakışması**
   - `/direct_post` hem `server.ts`'de (Jose) hem Credo'da (auto-registered) tanımlı
   - **Mitigation:** Jose handler kaldırılır, Credo event listener ile session sync yapılır

### Düşük Risk

7. **Frontend'ler hiç değişmez** — API kontratı aynı kalıyor
8. **SDK hiç değişmez** — HTTP endpoint'leri aynı kalıyor
9. **Web wallet değişmez** — Browser'da Jose zorunlu (Askar çalışmaz)
10. **Mobile wallet değişmez** — Jose kalıyor (Expo eject gerektirmemek için pragmatik tercih)

---

## Uygulama Sırası (Önerilen)

```
Faz 1 (Altyapı)          → 1-2 gün
├── 1.1 Askar zorunlu
├── 1.2 Jest→Vitest
│
Faz 2 (Agent Migration)  → 1 gün
├── 2.1 Base agent → Credo KMS
├── 2.2 Issuer agent
├── 2.3 Verifier agent (minimal)
├── 2.4 Holder agent (Jose fallback kaldır)
│
Faz 3 (VCI Refactor)     → 1 gün
├── 3.1 openid4vci.service Jose kaldır
├── 3.2 Credo mapper SD-JWT desteği
│
Faz 4 (VP Refactor)      → 1 gün
├── 4.1 openid4vp.service Jose kaldır
├── 4.2 direct_post handler
│
Faz 5 (Route Birleştir)  → 0.5 gün
├── 5.1 Path birleştirme
├── 5.2 Well-known birleştirme
│
Faz 6 (Doğrulama)        → 0.5 gün
├── Tam test suite
├── Docker compose e2e
└── Frontend regression
```

**Toplam: ~5-6 iş günü**
