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

## In Progress

- [ ] Batch credential issuance (todo 001)

## Planned

- [ ] Client-side VP flow for wallet-only credentials (todo 007)
- [ ] Docker/Kubernetes production deployment (todo 003)
- [ ] Production environment setup (todo 004)
- [ ] Issuer SD-JWT credential form (todo 005)
