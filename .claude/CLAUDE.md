# OpenID Credential Management System

## Proje Bilgisi
- **Repo:** https://github.com/sefatuncer/OpenIDCredentialManagement
- **Tür:** Monorepo - SSI (Self-Sovereign Identity) sistemi
- **Standartlar:** OpenID4VCI, OpenID4VP, DID, JWT, SD-JWT

## Klasör Yapısı

```
├── backend/                    # Node.js + Express API
│   ├── src/
│   │   ├── api/               # REST endpoints, middleware
│   │   ├── services/          # Business logic
│   │   ├── database/          # PostgreSQL, migrations
│   │   ├── agents/            # Issuer, Verifier, Holder agents
│   │   └── simulation/        # Test simulation engine
│   ├── k8s/                   # Kubernetes configs
│   └── docker/                # Docker, Prometheus, Grafana
│
├── frontend-issuer-verifier/   # React + Vite - Admin Dashboard
│   └── src/
│       ├── pages/             # Login, IssuerDashboard, VerifierDashboard
│       ├── components/        # UI components
│       └── services/          # API calls, auth, storage
│
├── web-wallet/                 # React + Vite - Holder Wallet
│   └── src/
│       ├── pages/             # Credentials, Delegations, Trust
│       ├── services/          # agent.service.ts, api.service.ts
│       └── types/             # TypeScript types
│
└── postman/                    # API test collection
```

## Temel Özellikler

### Backend (Port 3000)
- Credential issuance (OpenID4VCI)
- Credential verification (OpenID4VP)
- Trust registry
- Revocation lists
- Agent delegation system
- Audit logging

### Frontend Issuer/Verifier
- Issuer: Credential oluşturma, revocation
- Verifier: Verification request, trust management

### Web Wallet
- Agent identity yönetimi
- Credential saklama
- Delegation (yetki devri)
- Trust relationships

## Güvenlik Notları (Production-Ready)
- Hardcoded secret YOK - tüm secret'lar env variable
- Demo mode KALDIRILDI
- CORS whitelist zorunlu
- sessionStorage kullanılıyor (localStorage değil)
- Client credentials bcrypt ile hash'leniyor
- JWT_SECRET, API_KEY, WEB_WALLET_SECRET zorunlu

## Çalıştırma
```bash
# Backend
cd backend && npm run dev

# Frontend
cd frontend-issuer-verifier && npm run dev

# Wallet
cd web-wallet && npm run dev
```

## Git
- Branch: main
- .env dosyaları gitignore'da
- docs/ ve *.md (README hariç) gitignore'da
- **Co-Authored-By satırı commit mesajlarına EKLENMEYECEK** — kullanıcı bunu istemiyor

## Lessons Learned

- **[2026-03-09] Architecture:** Jose PRIMARY, Credo OPTIONAL mimarisi kullan. Native modül bağımlılıkları opsiyonel olmalı, kritik yol pure JS'de çalışmalı. Bkz: `.claude/solutions/jose-primary-credo-optional.md`
- **[2026-03-09] DID:** DID:key oluştururken multicodec prefix (0xed01 for Ed25519) ve base58btc encoding zorunlu. Bkz: `.claude/solutions/did-key-multibase-encoding.md`
- **[2026-03-09] TypeScript:** `jose.importJWK()` dönüş tipi `KeyLike | Uint8Array` olabilir, type assertion gerekebilir.
- **[2026-03-09] SD-JWT:** Client-side SD-JWT parsing için backend API gerekmez, base64url decode yeterli. Crypto işlemleri (digest verification) için API kullan. Bkz: `.claude/solutions/sdjwt-selective-disclosure-ui.md`
- **[2026-03-11] OpenID4VCI:** Spec draft geçişlerinde tüm katmanlar aynı field adlarını kullanmalı. Farklı katmanların farklı draft versiyonları kullanması runtime interop bug'larına yol açar. Dual-write pattern ile geçiş yap. Bkz: `.claude/solutions/openid4vc-spec-compliance-migration.md`
- **[2026-03-11] DID:** DID resolution tek merkezde olmalı (`didResolver.service.ts`). VP/SD-JWT/VCI servislerinde ayrı ayrı `did:key` kontrolü yerine `resolvePublicKeyFromDid()` kullan.
- **[2026-03-11] TypeScript:** Aynı isimde local fonksiyon ve import çakışmasında `import { foo as fooAlias }` kullan. Rename import, conflict'i temiz çözer.
- **[2026-03-11] Architecture:** VP flow birleştirildi: `openid4vp.service.ts` tek VP motoru, `verifier.agent.ts` thin wrapper. Agent dosyaları yalnızca kimlik (DID, key) yönetir, protokol mantığı service'lerde olmalı. Bkz: `.claude/solutions/vp-flow-unification-thin-wrapper.md`
- **[2026-03-11] Architecture:** Credo-TS PRIMARY, Jose FALLBACK mimarisi. Credo route'ları ana Express app'e kayıtlı, `/oid4vci` ve `/oid4vp` ayrı base path'ler. Boot sırası: Express app → Credo init → `finalizeServer()` (error handlers).
- **[2026-03-11] Security:** Async Express route handler'ları mutlaka `asyncHandler()` ile sarılmalı. Aksi halde promise rejection yakalanmaz ve process crash olabilir.
- **[2026-03-11] OpenID4VCI:** SD-JWT VC format migration: `_sdjwt` suffix convention ile config ID'den format çıkarılır. Yeni credential type eklerken `SD_CLAIMS_BY_TYPE` + `buildCredentialConfigurations()` güncelle. Bkz: `.claude/solutions/sdjwt-vc-format-migration.md`
- **[2026-03-11] Security:** Yeni API field eklerken Zod validation schema'yı da güncelle. `req.body` cast'ları validation'dan sonra güvenlidir, öncesinde değil.
- **[2026-03-11] Architecture:** Map→Adapter migration'da `list()`/`query()` key dönmez. Silme gereken entity'lerde key'i data içinde de sakla (`offerId` pattern). Bkz: `.claude/solutions/map-to-storage-adapter-migration.md`
- **[2026-03-11] TypeScript:** sync→async dönüşümü tüm caller zincirini etkiler. `tsc --noEmit` ile erken doğrula — compiler kaçırılan `await`'leri yakalar.
- **[2026-03-11] Architecture:** Mevcut standalone servis varsa yeni yazmak yerine wire-up et. `setIssuer()` callback pattern'i ile servisi agent'a bağla, endpoint'lerden servise delege et. `issueCredentialDirect()` offer flow bypass eder.
- **[2026-03-11] Architecture:** Orphan servis pattern — service katmanı tam olsa bile API route'ları yoksa ulaşılamaz. Yeni servis eklerken hep route + validation + server mount + frontend API birlikte ekle.
- **[2026-03-12] Security:** DB'ye key material yazarken envelope encryption kullan (KEK env var'dan, data key wrap edilir). Plaintext key storage DB compromise'da tüm encrypted veriyi açık eder. Bkz: `.claude/solutions/encryption-envelope-key-storage.md`
- **[2026-03-12] Performance:** Background job'larda N+1 sorgudan kaçın — loop öncesi `list()` ile bulk load yap, loop içinde `get()` çağırma. `checkExpirations()` bu pattern ile düzeltildi.
- **[2026-03-12] Architecture:** Constructor sync ise `initialize()` → async method'a taşı, boot sequence'de `await` ile çağır. Örnek: `encryptionService.initialize()`, `schemaRegistry.initialize()` — `index.ts`'de `initializeCore()` sonrası.
- **[2026-03-12] Architecture:** Seed data (built-in schemas) DB'ye yazarken `exists()` check yap — kullanıcı tarafından modify edilmiş veriyi ezme. Yalnızca yoksa ekle.
- **[2026-03-12] Architecture:** Schema-driven issuance'da bilinmeyen schema type için fallback issuance fonksiyonu kullanma — 400 hata dön. Yanlış claim yapısıyla kırık credential üretmekten kaçın. Bkz: `.claude/solutions/schema-driven-issuance-wizard.md`
- **[2026-03-12] Security:** Browser'da key material (private key JWK) sessionStorage'a yazarken AES-GCM-256 ile şifrele. Plaintext storage XSS ile açığa çıkar. Bkz: `.claude/solutions/client-side-vp-flow.md`
- **[2026-03-12] OpenID4VP:** Client-side VP flow'da `did:key` ephemeral wallet identity olarak idealdir — self-contained (resolution gerekmez), registration gerekmez, verifier `resolvePublicKeyFromDid()` ile doğrudan çözer.
- **[2026-03-12] TypeScript:** jose browser bundle'da `KeyLike` type export edilmez. Browser context'te `CryptoKey` type assertion kullan.
- **[2026-03-12] Security:** Global rate limiter'dan önce mount edilen route'lar rate limiting'i bypass eder. Pre-auth endpoint'lere her zaman per-route `authRateLimiter` ekle. Bkz: `.claude/solutions/oauth2-bridge-rfc8693.md`
- **[2026-03-12] Architecture:** Aynı veri (ör. scope mapping, trust level) hem service hem route'ta tanımlanmamalı. Service'den export et, route sadece pass-through yapsın — veri tutarsızlığını önler.
- **[2026-03-12] Architecture:** Mevcut servislerin `index.ts`'te initialize edilip edilmediğini kontrol et. `wsService.initialize(server)` ve `expirationNotifier.start()` gibi çağrılar eksik olabilir — orphan service pattern infrastructure seviyesinde de geçerli.
- **[2026-03-12] Architecture:** Aynı EventBus event'i için birden fazla listener kaydetme — tek handler içinde fan-out yap. Duplicate listener'lar divergence riski ve double-processing yaratır.
- **[2026-03-12] Security:** Kullanıcı tarafından sağlanan URL'lere outbound HTTP yapılıyorsa SSRF koruması (private IP blocking) ekle. Hostname-level check DNS rebinding'e karşı tam koruma sağlamaz ama temel saldırıları engeller. Bkz: `.claude/solutions/realtime-webhook-notification-pipeline.md`
- **[2026-03-12] Architecture:** Servis dosyası ~300L'yi aşınca concern'e göre böl (CRUD vs engine). "Thin wrapper + re-export" pattern public API'yi değiştirmeden iç yapıyı temizler.
- **[2026-03-12] TypeScript:** React hook'larında WebSocket/timer gibi side effect'ler `useRef` ile callback referansı tutmalı. `useCallback` dep'ine callback koyulursa her render'da reconnect olur.
- **[2026-03-12] Architecture:** DB schema (migration) ile service kodu senkron tutulmalı. Yeni kolon referans eden UPDATE/INSERT yazmadan önce migration'da kolon tanımlı olmalı. `credential_id` kolonu eksik kalınca runtime crash oldu. Bkz: `.claude/solutions/delegation-chain-attenuation.md`
- **[2026-03-12] Security:** Caller identity için client-provided header (ör. `X-Delegator-Did`) kullanma — spoofable. Authorization-critical kararlar için authenticated identity (JWT sub, API key→DID mapping) kullan.
- **[2026-03-12] Architecture:** EventBus emit'leri ve webhook subscription types senkron tutulmalı. Yeni event emit ediyorsan `WEBHOOK_EVENT_TYPES` enum'una da ekle, yoksa subscriber'lar o event'i alamaz.
- **[2026-03-12] Performance:** Ağaç yapılarında (delegation chain, trust graph) N+1 yerine PostgreSQL `WITH RECURSIVE` CTE kullan — tek sorguda ancestor+descendant traversal. `getDelegationChain()` 4+ SELECT → 1 CTE ile değiştirildi.
- **[2026-03-12] Security:** OIDC authorization code, talep eden `client_id`'ye bağlıdır. Frontend `ssi-frontend` ile auth request yapıyorsa, token exchange de `ssi-frontend` kullanmalı — backend confidential client ile exchange edemez. Bkz: `.claude/solutions/keycloak-sso-pkce-integration.md`
- **[2026-03-12] Security:** PKCE `code_verifier` üretildiği yerden (frontend) exchange yapılacak yere (backend) iletilmeli. Eksik `code_verifier` Keycloak token exchange'i reddeder.
- **[2026-03-12] Architecture:** Yeni IdP (Keycloak vb.) eklerken her zaman env var ile optional yap. Mevcut auth (API key + JWT) bozulmadan graceful degradation sağla. `isKeycloakConfigured()` gate pattern.
- **[2026-03-12] Architecture:** PKCE için `keycloak-js` gibi ek bağımlılık gerekmez — native `crypto.subtle.digest('SHA-256')` + `crypto.getRandomValues()` yeterli. Bundle size'ı ~50KB azaltır.
- **[2026-03-12] Architecture:** Multi-tenant middleware varsayılan olarak `optionalTenant()` (non-breaking) olmalı, `requireTenant()` değil. Mevcut single-tenant deploylar bozulmadan çalışmaya devam etmeli. Feature-flag gating (`module.multi-tenant`) ile kontrol et. Bkz: `.claude/solutions/multi-tenant-credential-isolation.md`
- **[2026-03-12] Security:** Frontend API client'ları her zaman shared `request()` helper'ı kullanmalı. Standalone fetch wrapper'lar token refresh ve 401 redirect'i bypass eder.
- **[2026-03-12] Architecture:** Web wallet → RN migration'da ~60% code reuse mümkün. Platform adaptasyon noktaları: storage (sessionStorage→expo-secure-store), env vars (import.meta.env→Constants.expoConfig.extra), URL encoding (URLSearchParams→manual). Pure JS crypto (jose) tercih et. Bkz: `.claude/solutions/react-native-mobile-wallet-cross-platform.md`
- **[2026-03-12] TypeScript:** `Record<string, unknown>` + JSX'te `{value && <Text>}` pattern'i RN'de type error verir. Ternary kullan: `{value ? <Text>... : null}`.
- **[2026-03-12] Architecture:** Mobile app'te WebSocket lifecycle AppState'e bağlanmalı — background'a geçince disconnect, foreground'a dönünce reconnect. `useRef` ile stabil callback tut.
- **[2026-03-12] Security:** Push notification backend endpoint yoksa silent fail et (log + return false). Mobile app başlatılmadan push çalışmaz — crash yerine graceful degrade.
- **[2026-03-12] Security:** Outbound fetch yapan her client-side servis (VP fetch, webhook delivery) SSRF koruması gerektirir — aynı private IP pattern'i backend ve mobile'da tekrar kullan. `validateUrl()` helper'ı her yeni outbound fetch noktasına ekle.
- **[2026-03-12] Security:** Presentation definition gibi dışarıdan gelen yapısal veride `JSON.parse()` sonrası mutlaka runtime type guard uygula. Type assertion (`as T`) güvenli değil — `validatePresentationDefinition()` gibi type predicate fonksiyonu yaz.
- **[2026-03-12] Architecture:** Ağır opsiyonel modülleri (HLF SDK, ML kütüphaneleri vb.) dynamic import + feature-flag ile entegre et. Static import compile-time bağımlılık yaratır, `@ts-ignore` + dynamic import SDK yokken de çalışmayı sağlar. Bkz: `.claude/solutions/hyperledger-fabric-hash-anchoring.md`
- **[2026-03-12] Architecture:** Blockchain/ledger entegrasyonlarında write-ahead pattern kullan: önce lokal DB'ye `pending` yaz, sonra on-chain confirm et. Ana akışı consensus gecikmesine (1-3s) bağlama. Retry job ile failed/pending record'ları işle.
- **[2026-03-12] Architecture:** Ağır altyapı bileşenlerini (HLF network, Kafka cluster vb.) ana `docker-compose.dev.yml`'den ayır. Ayrı compose dosyası + ayrı network ile dev ortam maliyetini minimize et.
- **[2026-03-12] Architecture:** Credo-TS'e opsiyonel modül eklerken inbound + outbound transport + endpoints üçlüsü tam olmalı. `outboundTransports: []` mesaj göndermeyi sessizce engeller. Bkz: `.claude/solutions/didcomm-v1-credo-integration.md`
- **[2026-03-12] Architecture:** Büyük dosyaya (>300L) yeni concern eklemek yerine ayrı servis dosyası oluştur ve mevcut getter'ı import et. `didcomm.service.ts` → `getCredoAgent()` import pattern'i.
- **[2026-03-12] Security:** Policy engine eklerken mevcut wildcard permission (`*`) bypass'ını korumayı unutma. Kaldırılırsa tüm API key kullanıcıları kilitlenir. En yüksek priority'de wildcard rule ekle. Bkz: `.claude/solutions/policy-authorization-engine.md`
- **[2026-03-13] Security:** Rate limiter key generator'larda client-supplied header (X-Tenant-ID gibi) kullanma — authenticated olmadan rate limit key'e koyulan değer değiştirilerek limit bypass edilir. Yalnızca authenticated identity (API key, IP) kullan. Bkz: `.claude/solutions/stride-threat-model-security-hardening.md`
- **[2026-03-13] Security:** Global rate limiter'dan önce mount edilen pre-auth endpoint'lere (direct_post, /credentials/request gibi) mutlaka per-route rate limiter ekle. Yoksa unauthenticated DoS vektörü oluşur. Bkz: `.claude/solutions/stride-threat-model-security-hardening.md`
- **[2026-03-13] Security:** STRIDE analizi feature bazlı değil, mimari katman bazlı (API Gateway → Auth → Issuance → Verification → Delegation → Storage → External) yapılmalı — cross-cutting threat'leri yakalamak için. Bkz: `.claude/solutions/stride-threat-model-security-hardening.md`

## Pattern Library

| Pattern | Açıklama | Dosya |
|---------|----------|-------|
| Jose PRIMARY + Credo Optional | Native modül gerektirmeyen SSI mimarisi | `.claude/solutions/jose-primary-credo-optional.md` |
| DID:key Encoding | Ed25519'dan DID:key oluşturma | `.claude/solutions/did-key-multibase-encoding.md` |
| SD-JWT Selective Disclosure UI | Client-side parsing + claim selection UI | `.claude/solutions/sdjwt-selective-disclosure-ui.md` |
| OpenID4VC Spec Migration | Draft 11→13+ field migration with backward compat | `.claude/solutions/openid4vc-spec-compliance-migration.md` |
| Universal DID Resolution | Centralized `resolvePublicKeyFromDid()` for all DID methods | `.claude/solutions/openid4vc-spec-compliance-migration.md` |
| VP Flow Unification | Thin wrapper pattern: agent delegates to service, preserves API contract | `.claude/solutions/vp-flow-unification-thin-wrapper.md` |
| SD-JWT VC Format Migration | jwt_vc_json → vc+sd-jwt dual format with _sdjwt config ID convention | `.claude/solutions/sdjwt-vc-format-migration.md` |
| Map→Adapter Migration | In-memory Map → IStorageAdapter with key-in-data pattern | `.claude/solutions/map-to-storage-adapter-migration.md` |
| Orphan Service → Full Stack | Service exists → add route + zod + mount + frontend API in one pass | `.claude/solutions/orphan-service-to-api.md` |
| Envelope Encryption Key Storage | KEK env var ile data key'leri wrap edip DB'ye yaz, boot'ta unwrap | `.claude/solutions/encryption-envelope-key-storage.md` |
| Schema-Driven Issuance Wizard | 3-step wizard: schema→claims→SD options→preview→QR, type-to-function routing | `.claude/solutions/schema-driven-issuance-wizard.md` |
| Client-Side VP Flow | Wallet-local Ed25519 key, DID:key, encrypted storage, direct_post, SD-JWT disclosure selection | `.claude/solutions/client-side-vp-flow.md` |
| OAuth 2.0 Bridge RFC 8693 | VC → OAuth token exchange, scope mapping, pre-auth endpoint pattern | `.claude/solutions/oauth2-bridge-rfc8693.md` |
| Multi-Tenant Credential Isolation | optionalTenant middleware, JSONB tenantId enrichment, feature-flag gated | `.claude/solutions/multi-tenant-credential-isolation.md` |
| Realtime Webhook Pipeline | EventBus→WebSocket+HTTP webhook, HMAC delivery, SSRF protection, subscription cache | `.claude/solutions/realtime-webhook-notification-pipeline.md` |
| Delegation Chain Attenuation | A→B→C sub-delegation, scope narrowing, cascade revoke, VC↔DB integration | `.claude/solutions/delegation-chain-attenuation.md` |
| Keycloak SSO PKCE Integration | 3-strategy auth chain, PKCE flow, dual client (public+confidential), graceful degradation | `.claude/solutions/keycloak-sso-pkce-integration.md` |
| React Native Mobile Wallet | Expo cross-platform SSI wallet, 60% web-wallet reuse, jose pure JS crypto, biometric+QR+push | `.claude/solutions/react-native-mobile-wallet-cross-platform.md` |
| HLF Hash Anchoring | Feature-flag gated, write-ahead PostgreSQL, async HLF confirm, dynamic SDK import, retry job | `.claude/solutions/hyperledger-fabric-hash-anchoring.md` |
| DIDComm v1 Credo Integration | Conditional DidCommModule, separate service wrapper, OOB invitations, event→WebSocket | `.claude/solutions/didcomm-v1-credo-integration.md` |
| Policy Authorization Engine | Built-in RBAC + delegation scope engine, enforcePolicy middleware, 30s cache, wildcard bypass | `.claude/solutions/policy-authorization-engine.md` |
| STRIDE Threat Model & Hardening | Layer-based STRIDE analysis, rate limiter key trust, pre-auth DoS protection, OWASP Agentic AI | `.claude/solutions/stride-threat-model-security-hardening.md` |
