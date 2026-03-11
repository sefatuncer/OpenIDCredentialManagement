# OpenID Credential Management System - Progress

## Current Phase: Development (Monolith)

Single environment development setup - no staging/production yet.

## Completed

### Core Infrastructure
- [x] Backend API (Express + TypeScript)
- [x] OpenID4VCI implementation
- [x] OpenID4VP implementation
- [x] DID management (did:key support)
- [x] SD-JWT service
- [x] Revocation service (StatusList2021)
- [x] Trust registry
- [x] Audit logging
- [x] Rate limiting middleware

### Security Improvements (2026-03-09)
- [x] Nonce management (replay attack protection)
- [x] Multi-DID method support (did:key, did:web, did:peer)
- [x] Revocation check in VP verification
- [x] EdDSA signing for SD-JWT
- [x] Key binding JWT verification

### Credo-TS Integration (2026-03-09 → 2026-03-11)
- [x] @credo-ts/core, @credo-ts/node, @credo-ts/openid4vc, @credo-ts/askar paketleri eklendi
- [x] Credo PRIMARY mimarisi - Askar varsa Credo, yoksa Jose fallback
- [x] Askar preloader Docker ve dev'de aktif (`--require register-askar.js`)
- [x] Credo route'ları ana Express app'e kayıtlı (`/oid4vci`, `/oid4vp` base paths)
- [x] Boot sırası: Express → Credo init → finalizeServer (error handlers)
- [x] Credential mapper emits audit events
- [x] VP event listener for audit logging
- [x] Holder API: Credo-first credential receive + presentation

### Frontend
- [x] Web Wallet (React + Vite)
- [x] Issuer/Verifier Dashboard (React + Vite)

### Workflow (2026-03-09)
- [x] Compound Engineering workflow komutları (/plan, /work, /review, /compound, /deploy, /lfg)

### SD-JWT UI (2026-03-09)
- [x] SD-JWT selective disclosure UI entegrasyonu
- [x] Client-side SD-JWT parsing (sdjwt.service.ts)
- [x] SDJWTCredentialCard component - disclosed/hidden claims gösterimi
- [x] CreatePresentationModal - claim selection UI
- [x] Credentials.tsx - SD-JWT credential detection ve rendering

### OpenID4VC Spec Compliance (2026-03-11)
- [x] Draft 11 → Draft 13+ migration (9 files, 11 steps)
- [x] Universal DID resolution (`resolvePublicKeyFromDid`)

### OpenID4VP Wallet Integration (2026-03-11)
- [x] QR scan + manual URI paste
- [x] Backend-driven VP flow (POST /holder/credentials/present)

### VP Flow Unification (2026-03-11)
- [x] verifier.agent.ts → thin wrapper over openid4vp.service.ts
- [x] Unified PostgreSQL session storage (removed in-memory Map)
- [x] holder.agent.ts inline URI params support
- [x] Duplicate direct_post route removed

### PostgreSQL Persistence (2026-03-11)
- [x] docker-compose.dev.yml PostgreSQL service
- [x] IStorageAdapter with PostgreSQL backend
- [x] VP sessions persistent across restarts
- [x] Fase 1: Holder credentials, issuer offers/issued, partner keys → PostgreSQL
- [x] 5 Map → IStorageAdapter migration (holder_credentials, issuer_credential_offers, issuer_issued_credentials, partner_keys, org_agent_counts)

### SD-JWT VC Format Migration (2026-03-11)
- [x] `issueCredential()` SD-JWT VC format branch (`sdjwtService.createSDJWTVC()`)
- [x] SD claim definitions per credential type (`SD_CLAIMS_BY_TYPE`)
- [x] Issuer metadata — dual format configs (jwt_vc_json + vc+sd-jwt)
- [x] `_sdjwt` config ID suffix convention
- [x] Holder agent — combined SD-JWT string storage + `isSDJWT` flag
- [x] Frontend — format selector (default: vc+sd-jwt)
- [x] Zod validation — `credentialFormatSchema` enum
- [x] Backward compat — jwt_vc_json still supported

## WP1: Hızlı Analiz ve Mimari Tasarım (Ay 1-3)

- [ ] Cloud HSM ön değerlendirme (todo 025)

### Batch Credential Issuance (2026-03-11)
- [x] `issueCredentialDirect()` — offer flow bypass, doğrudan JWT-VC
- [x] `batchIssuanceService.setIssuer()` wire-up at boot
- [x] `batchIssuanceSchema` Zod validation (max 100 recipients)
- [x] 3 batch endpoints: POST job, GET status, GET results (async job pattern)
- [x] Frontend: BatchIssue.tsx wizard (JSON/CSV import + progress polling + results)
- [x] Route `/issuer/issue-batch` + IssuerDashboard link

## WP2: Temel Geliştirme — Alfa Prototip (Ay 4-6)

- [x] Batch credential issuance (todo 001) — 2026-03-11
- [ ] PostgreSQL — Fase 3-4 kalan Map-based servisler (todo 002)
- [x] PostgreSQL — Fase 2: oidc configs + batch jobs → IStorageAdapter — 2026-03-11
- [x] SD-JWT VC format migration (todo 009) — 2026-03-11
- [x] Credential schema registry (todo 010) — 2026-03-11
- [ ] Issuer SD-JWT credential form (todo 005)
- [ ] Client-side VP flow (todo 007)
- [ ] React Native mobil wallet (todo 023)

## WP3: İleri Geliştirme + Blockchain — Beta Prototip (Ay 7-12)

- [ ] Hyperledger Fabric entegrasyonu (todo 011)
- [ ] OAuth 2.0 bridge adapter (todo 012)
- [ ] DIDComm v1/v2 entegrasyonu (todo 013)
- [ ] Multi-tenant credential izolasyonu (todo 014)
- [ ] Gerçek zamanlı revocation — webhook (todo 015)
- [ ] OPA/Cerbos fine-grained authorization (todo 024)

## WP4: Test Altyapısı (Ay 4-6, 9-12 — Paralel)

- [ ] Docker/Kubernetes deployment (todo 003)
- [ ] Production environment setup (todo 004)
- [ ] Performans test framework'ü (todo 016)
- [ ] CI/CD pipeline (todo 017)

## WP5: Deneysel Değerlendirme + Güvenlik (Ay 13-16)

- [ ] 10K+ ajan ölçekleme testleri (todo 018)
- [ ] Penetration test + güvenlik denetimi (todo 019)
- [ ] Cloud HSM kapsamlı analiz (todo 025)

## WP6: Finalizasyon (Ay 17-18)

- [ ] Agent Identity SDK paketleme (todo 020)
- [ ] API dokümantasyonu + referans mimari raporu (todo 021)
- [ ] Demo uygulamalar — 3 senaryo (todo 026)
- [ ] Akademik yayınlar — 2+ hakemli (todo 027)
- [ ] Patent başvuruları (todo 028)
