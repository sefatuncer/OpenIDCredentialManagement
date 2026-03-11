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
