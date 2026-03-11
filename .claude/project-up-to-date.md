# OpenID Credential Management - API & Protocol Reference

> Bu döküman projedeki tüm endpoint'leri, protokol kullanımlarını ve bileşen etkileşimlerini kapsar.

---

## Genel Mimari

```
┌─────────────────────┐     ┌─────────────────────────┐     ┌──────────────────┐
│  Frontend Issuer/    │     │      Backend (3000)      │     │    Web Wallet    │
│  Verifier (5174)     │────▶│  Express + PostgreSQL    │◀────│     (5173)       │
│  React + Vite        │     │  Credo PRIMARY / Jose FB │     │  React + Vite    │
└─────────────────────┘     └─────────────────────────┘     └──────────────────┘
        │                            │                              │
        │ Bearer Token (API Key)     │ PostgreSQL (5432)            │ Client Credentials
        │                            │ ssi-postgres (dev)           │ → Access Token
        └────────────────────────────┴──────────────────────────────┘

Docker Compose Dev: 4 servis (backend, web-wallet, issuer-verifier, postgres)

Credo-TS Route Base Paths (Askar aktifken):
  /oid4vci/{issuerId}/...    → Credo issuer endpoints (token, credential, offers)
  /oid4vp/{verifierId}/...   → Credo verifier endpoints (authorization-requests)
PostgreSQL: `postgres:15-alpine`, DB: ssi_dev, healthcheck ile backend bağımlılığı
```

### Protokoller

| Protokol | Kullanım | Spec |
|----------|----------|------|
| **OpenID4VCI** | Credential issuance (Pre-Authorized Code Flow) | OpenID4VCI Draft 13+ |
| **OpenID4VP** | Credential verification (Direct Post) | OpenID4VP Draft 20+ |
| **DID** | Decentralized identifier (did:key, did:web, did:peer) | W3C DID Core 1.0 |
| **JWT-VC** | Verifiable Credential format (`jwt_vc_json`) — legacy | W3C VC Data Model 1.1 |
| **SD-JWT VC** | Selective Disclosure JWT VC (`vc+sd-jwt`) — varsayılan format | IETF SD-JWT VC Draft, eIDAS 2.0 / EUDI ARF |
| **StatusList2021** | Credential revocation | W3C StatusList2021 |
| **EdDSA** | Signature algorithm (Ed25519) | C:\Users\sefa.tuncer\Desktop\docker-digital-id\fame-digital-idRFC 8032 |

### Kimlik Doğrulama

| Bileşen | Yöntem | Detay |
|---------|--------|-------|
| Frontend Issuer/Verifier | Bearer Token | API Key → sessionStorage |
| Web Wallet | Client Credentials | clientId + clientSecret → access token |
| OpenID4VCI spec endpoints | Token/No Auth | Spec gereği bazı endpoint'ler public |
| OpenID4VP direct_post | No Auth | Wallet'tan gelen VP submission |

---

## Credential Tipleri

| Tip | Açıklama | İçerik |
|-----|----------|--------|
| `AIAgentIdentityCredential` | AI agent kimlik belgesi | agentId, agentType, agentName, capabilities, trustLevel |
| `AIAgentIdentityCredential_sdjwt` | AI agent kimlik (SD-JWT VC) | Aynı alanlar, SD: agent_name, capabilities, trust_level |
| `DelegationCredential` | Yetki devri belgesi | delegatorDid, delegateDid, scope, constraints |
| `DelegationCredential_sdjwt` | Yetki devri (SD-JWT VC) | Aynı alanlar, SD: delegator_name, delegate_name, constraints |
| `CapabilityCredential` | Yetenek belgesi | capabilityType, resource, actions, conditions |
| `CapabilityCredential_sdjwt` | Yetenek (SD-JWT VC) | Aynı alanlar, SD: conditions, granted_by |

---

## API Endpoints

### Health & Monitoring

| Method | Path | Auth | Açıklama |
|--------|------|------|----------|
| GET | `/health` | - | Basic health check |
| GET | `/health/ready` | - | K8s readiness probe |
| GET | `/health/live` | - | K8s liveness probe |
| GET | `/health/detailed` | - | Storage, features, plugins durumu |
| GET | `/health/features` | - | Feature flags |
| GET | `/health/storage` | - | Storage backend durumu |
| GET | `/metrics` | - | Prometheus metrics (text/plain) |

---

### Authentication

| Method | Path | Auth | Rate Limit | Açıklama |
|--------|------|------|------------|----------|
| POST | `/api/v1/auth/token` | - | 10/15min | Client credentials → JWT access token |
| POST | `/api/v1/auth/introspect` | - | - | JWT token doğrulama/introspect |

**Token Request:**
```json
{ "clientId": "...", "clientSecret": "...", "grantType": "client_credentials" }
```

---

### OpenID4VCI - Credential Issuance

#### Well-Known Metadata (Public)

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/.well-known/openid-credential-issuer` | Issuer metadata (credential configs, endpoint'ler) |
| GET | `/.well-known/oauth-authorization-server` | OAuth authorization server metadata |

#### Credential Offer & Token

| Method | Path | Auth | Rate Limit | Açıklama |
|--------|------|------|------------|----------|
| POST | `/credential-offer` | Auth | - | Credential offer oluştur (pre-authorized_code) |
| GET | `/credential-offer/{offerId}` | - | - | Offer detayı (wallet tarafından okunur) |
| GET | `/credential-offers` | Admin | - | Tüm offer'ları listele |
| POST | `/token` | - | 10/15min | Pre-authorized code → access token + c_nonce |
| POST | `/credential` | Bearer | 30/min | Credential talep et (proof + access token) |
| POST | `/batch-credential` | Bearer | - | Toplu credential talebi |
| POST | `/deferred-credential` | Bearer | - | Ertelenmiş credential durumu |

**Credential Offer (Draft 13+):**
- `credential_configuration_ids` (yeni) + `credentials` (backward compat) her ikisi de gönderilir
- Grant: `tx_code: { input_mode, length }` (eski `user_pin_required` yerine)

**Flow:** `credential-offer` → wallet scans → `token` (code exchange) → `credential` (with proof)

**Credential Request (Draft 13+):**
```json
{
  "format": "vc+sd-jwt",
  "credential_configuration_id": "AIAgentIdentityCredential_sdjwt",
  "proof": {
    "proof_type": "jwt",
    "jwt": "<proof JWT with typ:openid4vci-proof+jwt, aud, nonce, iat>"
  }
}
```
> **Format:** `vc+sd-jwt` (varsayılan, eIDAS 2.0 uyumlu) veya `jwt_vc_json` (legacy).
> **Config ID:** `_sdjwt` suffix'li ID'ler SD-JWT VC format, suffix'siz ID'ler JWT-VC format.
> `credential_configuration_id` (Draft 13+) önceliklidir. Eski `credential_definition.type` de kabul edilir (backward compat).

#### Issuer-Specific Endpoints

| Method | Path | Auth | Rate Limit | Açıklama |
|--------|------|------|------------|----------|
| GET | `/api/v1/issuer/did` | Auth | - | Issuer DID bilgisi |
| POST | `/api/v1/issuer/credentials/agent-identity` | Auth | 30/min | Agent Identity credential offer oluştur |
| POST | `/api/v1/issuer/credentials/delegation` | Auth | 30/min | Delegation credential offer oluştur |
| POST | `/api/v1/issuer/credentials/capability` | Auth | 30/min | Capability credential offer oluştur |
| POST | `/api/v1/issuer/token` | - | - | Token endpoint (spec gereği public) |
| POST | `/api/v1/issuer/credential` | - | - | Credential endpoint (spec gereği public) |
| POST | `/api/v1/issuer/credentials/batch` | Auth | 30/min | Batch issuance job oluştur → 202 + jobId |
| GET | `/api/v1/issuer/credentials/batch/{jobId}` | Auth | - | Batch job status (polling) |
| GET | `/api/v1/issuer/credentials/batch/{jobId}/results` | Auth | - | Batch job sonuçları |

**Agent Identity Request:**
```json
{
  "holderDid": "did:key:z...",
  "agentId": "agent-001",
  "agentType": "assistant",
  "agentName": "MyAgent",
  "agentVersion": "1.0.0",
  "capabilities": ["read", "write"],
  "ownerDid": "did:key:z...",
  "ownerName": "Owner",
  "trustLevel": "medium",
  "validUntil": "2026-12-31T00:00:00Z",
  "format": "vc+sd-jwt"
}
```

**Response:**
```json
{ "credentialOfferId": "...", "credentialOfferUri": "openid-credential-offer://...", "format": "vc+sd-jwt" }
```

---

### OpenID4VP - Credential Verification

#### Presentation Definitions (Public)

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/openid4vp/presentation-definitions` | Tüm tanımlı presentation definition'lar |
| GET | `/openid4vp/presentation-definitions/{id}` | Belirli definition (agent-identity, delegation, capability, combined) |

#### Verification Sessions

| Method | Path | Auth | Rate Limit | Açıklama |
|--------|------|------|------------|----------|
| POST | `/api/v1/openid4vp/authorization-request` | Auth | 50/min | Verification request oluştur |
| GET | `/api/v1/openid4vp/sessions/{sessionId}` | - | - | Session durumu (pending/verified/rejected/expired) |
| GET | `/api/v1/openid4vp/sessions/{sessionId}/result` | Auth | - | Doğrulama sonucu |
| GET | `/api/v1/openid4vp/sessions` | Admin | - | Tüm session'lar |
| POST | `/direct_post` | - | - | VP token submission (wallet → verifier) |
| ~~POST~~ | ~~`/api/v1/openid4vp/direct_post`~~ | - | - | Kaldırıldı — global `/direct_post` kullanılıyor |
| GET | `/api/v1/openid4vp/client-metadata` | - | - | Verifier client metadata |
| GET | `/api/v1/openid4vp/did` | - | - | Verifier DID |

**Authorization Request (Draft 20+):**
- `response_mode: "direct_post"` + `response_uri` (eski `redirect_uri` yerine)
- `client_id_scheme: "did"` eklendi

**Flow:** `authorization-request` → wallet scans QR → `direct_post` (VP submission via `response_uri`) → `sessions/{id}/result` (poll)

**VP Token Submission:**
```json
{
  "vp_token": "<JWT Verifiable Presentation>",
  "presentation_submission": { "id": "...", "definition_id": "...", "descriptor_map": [...] },
  "state": "<session state>"
}
```

**Verification Checks:** JWT signature → nonce → expiration → revocation status → embedded VC signature → VC expiration

#### Verifier-Specific Endpoints

| Method | Path | Auth | Rate Limit | Açıklama |
|--------|------|------|------------|----------|
| GET | `/api/v1/verifier/did` | Auth | - | Verifier DID |
| POST | `/api/v1/verifier/verify/agent-identity` | Auth | 50/min | Agent identity doğrulama request'i |
| POST | `/api/v1/verifier/verify/delegation` | Auth | 50/min | Delegation doğrulama request'i |
| POST | `/api/v1/verifier/verify/combined` | Auth | 50/min | Birleşik doğrulama request'i |
| GET | `/api/v1/verifier/verify/{sessionId}/result` | Auth | - | Doğrulama sonucu |

---

### Holder (Wallet Backend)

| Method | Path | Auth | Açıklama |
|--------|------|------|----------|
| GET | `/api/v1/holder/did` | Auth | Holder DID |
| POST | `/api/v1/holder/credentials/receive` | Auth | Credential offer kabul et |
| POST | `/api/v1/holder/credentials/present` | Auth | VP oluştur ve sun |
| GET | `/api/v1/holder/credentials` | Auth | Saklanan credential'ları listele |
| DELETE | `/api/v1/holder/credentials/{credentialId}` | Auth | Credential sil |

---

### SD-JWT (Selective Disclosure)

| Method | Path | Auth | Açıklama |
|--------|------|------|----------|
| POST | `/api/v1/sdjwt/credential` | Auth | SD-JWT credential oluştur |
| POST | `/api/v1/sdjwt/issue` | Auth | SD-JWT issue (alias) |
| POST | `/api/v1/sdjwt/vc` | Auth | SD-JWT Verifiable Credential oluştur |
| POST | `/api/v1/sdjwt/presentation` | Auth | Seçilen claim'lerle presentation oluştur |
| POST | `/api/v1/sdjwt/verify` | Auth | SD-JWT presentation doğrula |
| POST | `/api/v1/sdjwt/parse` | - | SD-JWT yapısını parse et (digest doğrulama) |
| GET | `/api/v1/sdjwt/info` | - | SD-JWT servis bilgisi |

**SD-JWT Format:** `<issuer-jwt>~<disclosure1>~<disclosure2>~...~<key-binding-jwt>`

**Disclosure:** Base64url(`[salt, claimName, claimValue]`) → SHA-256 digest → `_sd` array'e eklenir

**Client-side (Wallet):** Parse ve claim seçimi backend gerektirmez. Sadece digest verification ve presentation oluşturma API gerektirir.

---

### DID Resolution

| Method | Path | Auth | Açıklama |
|--------|------|------|----------|
| GET | `/api/v1/did/resolve/{did}` | - | DID → DID Document çözümle |
| GET | `/api/v1/did/dereference` | - | DID URL dereference (`?didUrl=...`) |
| POST | `/api/v1/did/validate` | - | DID format doğrulama |
| GET | `/api/v1/did/methods` | - | Desteklenen DID method'ları |
| GET | `/api/v1/did/cache/stats` | Auth | DID cache istatistikleri |
| POST | `/api/v1/did/cache/clear` | Auth | DID cache temizle |
| GET | `/api/v1/did/document/{did}` | - | DID Document doğrudan al |

**Desteklenen DID Method'ları:**
- `did:key` — Ed25519, multicodec `0xed01`, base58btc encoding
- `did:web` — `/.well-known/did.json` üzerinden HTTP çözümleme
- `did:peer` — Özel peer DID'leri

---

### Revocation

| Method | Path | Auth | Rate Limit | Açıklama |
|--------|------|------|------------|----------|
| POST | `/api/v1/revocation/revoke` | Auth | Strict | Credential iptal et |
| POST | `/api/v1/revocation/unrevoke` | Auth | Strict | İptali geri al |
| POST | `/api/v1/revocation/agent` | Auth | Strict | Agent'ın tüm credential'larını iptal et |
| GET | `/api/v1/revocation/status/{credentialId}` | Auth | - | İptal durumu sorgula |
| POST | `/api/v1/revocation/check` | Auth | - | StatusList entry ile kontrol |
| GET | `/api/v1/revocation/list/{statusListId}` | - | - | Status list credential al |
| GET | `/api/v1/revocation/stats` | Auth | - | İptal istatistikleri |
| GET | `/api/v1/revocation/verify/{credentialId}` | - | - | Hızlı iptal kontrolü |
| GET | `/api/v1/revocation/status-list` | Auth | - | Tüm status list'leri |

---

### Trust Registry

| Method | Path | Auth | Permission | Açıklama |
|--------|------|------|------------|----------|
| POST | `/api/v1/trust/entities` | Auth | trust:write | Güvenilir entity ekle |
| GET | `/api/v1/trust/entities` | Auth | - | Entity listesi (`?type=issuer\|verifier`) |
| GET | `/api/v1/trust/entities/{did}` | Auth | - | DID ile entity sorgula |
| PATCH | `/api/v1/trust/entities/{did}` | Auth | trust:write | Entity güncelle |
| DELETE | `/api/v1/trust/entities/{did}` | Auth | trust:write | Entity sil |
| POST | `/api/v1/trust/verify/issuer` | Auth | - | Issuer güvenilirlik doğrula |
| GET | `/api/v1/trust/check/{did}` | Auth | - | Hızlı güvenilirlik kontrolü |
| POST | `/api/v1/trust/policies` | Auth | trust:write | Trust policy oluştur |
| GET | `/api/v1/trust/policies/{policyId}` | Auth | - | Policy detayı |
| POST | `/api/v1/trust/validate` | Auth | - | Credential'ı policy'ye göre doğrula |
| GET | `/api/v1/trust/stats` | Auth | - | Trust istatistikleri |
| GET | `/api/v1/trust/export` | Auth | trust:admin | Trust registry dışa aktar |

---

### Agent Management

| Method | Path | Auth | Açıklama |
|--------|------|------|----------|
| POST | `/api/v1/agents/register` | - | Yeni AI agent kaydet (public) |
| GET | `/api/v1/agents` | Auth | Agent listesi (`?limit&offset&status`) |
| GET | `/api/v1/agents/{did}` | Auth | Agent detayı |
| PATCH | `/api/v1/agents/{did}` | Auth | Agent güncelle |
| DELETE | `/api/v1/agents/{did}` | Auth | Agent sil |
| GET | `/api/v1/agents/{did}/activity` | Auth | Agent aktivite logu |
| POST | `/api/v1/agents/{did}/capabilities/revoke` | Auth | Agent yeteneklerini iptal et |
| POST | `/api/v1/agents/{did}/trust/downgrade` | Auth | Agent güven seviyesini düşür |
| POST | `/api/v1/agents/{did}/emergency-stop` | Auth | Agent acil durdurma |

**Agent Registration:**
```json
{
  "name": "MyAgent",
  "type": "assistant|semi-autonomous|autonomous|service|orchestrator",
  "owner": { "did": "did:key:z...", "name": "Owner", "type": "individual" },
  "capabilities": ["read", "write"],
  "metadata": { "model": "gpt-4", "framework": "langchain" }
}
```

---

### Wallet Management

| Method | Path | Auth | Açıklama |
|--------|------|------|----------|
| GET | `/api/v1/wallet/{did}` | Auth | Agent wallet (identity, credentials, delegations, trust, activity) |
| POST | `/api/v1/wallet/{did}/credentials/basic` | Auth | Basic Agent Credential (bVC) talep et |
| POST | `/api/v1/wallet/{did}/credentials/rich` | Auth | Rich Agent Credential (rVC) talep et |
| GET | `/api/v1/wallet/{did}/activity` | Auth | Wallet aktivite logu |

---

### Delegation (Yetki Devri)

| Method | Path | Auth | Açıklama |
|--------|------|------|----------|
| POST | `/api/v1/delegations` | Auth | Delegation oluştur |
| GET | `/api/v1/delegations/{id}` | Auth | Delegation detayı |
| GET | `/api/v1/delegations/agent/{did}` | Auth | Agent'a ait delegation'lar |
| POST | `/api/v1/delegations/{id}/revoke` | Auth | Delegation iptal et |
| POST | `/api/v1/delegations/{id}/verify` | Auth | Delegation'ı action/resource için doğrula |

**Delegation Create:**
```json
{
  "delegateeToDid": "did:key:z...",
  "scope": { "actions": ["read"], "resources": ["api/*"], "constraints": {} },
  "duration": 86400,
  "revocable": true,
  "requireApproval": false
}
```

---

### Agent Trust (Agent-Arası Güven)

| Method | Path | Auth | Açıklama |
|--------|------|------|----------|
| POST | `/api/v1/agent-trust` | Auth | Agent'lar arası güven kur |
| GET | `/api/v1/agent-trust/{agentDid}` | Auth | Agent güven ilişkileri |
| PATCH | `/api/v1/agent-trust/{agentDid}/{trustedDid}` | Auth | Güven ilişkisi güncelle |
| DELETE | `/api/v1/agent-trust/{agentDid}/{trustedDid}` | Auth | Güven ilişkisi sil |
| POST | `/api/v1/agent-trust/verify` | Auth | Güven doğrula |

---

### Audit Logs

| Method | Path | Auth | Permission | Açıklama |
|--------|------|------|------------|----------|
| GET | `/api/v1/audit/logs` | Auth | audit:read | Audit logları (`?startDate&endDate&eventType&actorDid&action&limit&offset`) |
| GET | `/api/v1/audit/logs/{id}` | Auth | audit:read | Tekil audit log |
| GET | `/api/v1/audit/stats` | Auth | audit:read | Audit istatistikleri |
| GET | `/api/v1/audit/export` | Auth | audit:export | Dışa aktar (`?format=json\|csv`) |
| GET | `/api/v1/audit/events` | Auth | audit:read | Mevcut event tipleri |

---

### Backup

| Method | Path | Auth | Açıklama |
|--------|------|------|----------|
| POST | `/api/v1/backup` | Auth | Backup oluştur |
| POST | `/api/v1/backup/create` | Auth | Backup oluştur (alias) |
| GET | `/api/v1/backup` | Auth | Backup listesi |
| GET | `/api/v1/backup/list` | Auth | Backup listesi (alias) |
| GET | `/api/v1/backup/{backupId}` | Auth | Backup detayı |
| DELETE | `/api/v1/backup/{backupId}` | Auth | Backup sil |
| POST | `/api/v1/backup/restore` | Auth | Backup'tan geri yükle |
| POST | `/api/v1/backup/{backupId}/verify` | Auth | Backup bütünlüğü doğrula |

---

### Simulation (Development)

| Method | Path | Auth | Açıklama |
|--------|------|------|----------|
| POST | `/api/v1/simulation/start` | - | Simülasyon başlat (issuerCount, verifierCount, holderCount, speed, duration) |
| POST | `/api/v1/simulation/stop` | - | Simülasyonu durdur |
| POST | `/api/v1/simulation/pause` | - | Simülasyonu duraklat |
| POST | `/api/v1/simulation/resume` | - | Simülasyona devam et |
| GET | `/api/v1/simulation/status` | - | Simülasyon durumu |
| GET | `/api/v1/simulation/agents` | - | Simülasyon agent'ları |
| GET | `/api/v1/simulation/agents/{did}` | - | Simülasyon agent detayı |
| GET | `/api/v1/simulation/events` | - | Simülasyon event'leri (`?limit&offset`) |
| GET | `/api/v1/simulation/network` | - | Ağ durumu |
| GET | `/api/v1/simulation/stats` | - | Simülasyon istatistikleri |

---

### Legacy Redirects

| Eski Path | Yeni Path | Status |
|-----------|-----------|--------|
| `/api/issuer/*` | `/api/v1/issuer/*` | 301 Permanent |
| `/api/verifier/*` | `/api/v1/verifier/*` | 301 Permanent |
| `/api/holder/*` | `/api/v1/holder/*` | 301 Permanent |

---

## Bileşen → Endpoint Etkileşim Haritası

### Frontend Issuer/Verifier (Port 5174)

```
Login
  └─▶ GET  /api/v1/issuer/did  VEYA  GET /api/v1/verifier/did  (credential doğrulama)

Issuer Dashboard
  ├─▶ POST /api/v1/issuer/credentials/agent-identity  → credentialOfferUri + QR
  ├─▶ POST /api/v1/issuer/credentials/delegation       → credentialOfferUri + QR
  └─▶ POST /api/v1/issuer/credentials/capability        → credentialOfferUri + QR

Batch Issue (/issuer/issue-batch)
  ├─▶ POST /api/v1/issuer/credentials/batch        → 202 + jobId
  ├─▶ GET  /api/v1/issuer/credentials/batch/{jobId}          (polling, 2sn)
  └─▶ GET  /api/v1/issuer/credentials/batch/{jobId}/results  (on complete)

Verifier Dashboard
  ├─▶ POST /api/v1/verifier/verify/agent-identity → sessionId + requestUri + QR
  ├─▶ POST /api/v1/verifier/verify/delegation     → sessionId + requestUri + QR
  ├─▶ POST /api/v1/verifier/verify/combined       → sessionId + requestUri + QR
  └─▶ GET  /api/v1/verifier/verify/{sessionId}/result  (polling)

Revocation
  ├─▶ POST /api/v1/revocation/revoke
  ├─▶ POST /api/v1/revocation/unrevoke
  ├─▶ GET  /api/v1/revocation/status/{credentialId}
  ├─▶ GET  /api/v1/revocation/stats
  └─▶ GET  /api/v1/revocation/status-list

Trust Management
  ├─▶ GET    /api/v1/trust/entities?type=issuer
  ├─▶ POST   /api/v1/trust/entities
  ├─▶ DELETE  /api/v1/trust/entities/{did}
  └─▶ GET    /api/v1/trust/policies

Audit Logs
  ├─▶ GET /api/v1/audit/logs?page&limit&action&from&to
  └─▶ GET /api/v1/audit/stats?period=day|week|month
```

### Web Wallet (Port 5173)

```
Authentication
  └─▶ POST /api/v1/auth/token  (client credentials → access token)

Agent Dashboard
  ├─▶ POST /api/v1/agents/register           → Agent DID
  ├─▶ GET  /api/v1/wallet/{did}              → Full wallet state
  ├─▶ POST /api/v1/wallet/{did}/credentials/basic  → bVC
  └─▶ POST /api/v1/wallet/{did}/credentials/rich   → rVC

Credentials
  ├─▶ Local: AES-GCM encrypted localStorage (credential storage)
  ├─▶ Local: SD-JWT client-side parsing (base64url decode, ~ separator)
  ├─▶ GET  /api/v1/holder/credentials   → format, combined, isSDJWT alanları
  ├─▶ POST /api/v1/sdjwt/presentation  (selective disclosure ile VP oluştur)
  └─▶ POST /api/v1/sdjwt/verify        (SD-JWT doğrulama)

Delegations
  ├─▶ GET  /api/v1/delegations            → given + received
  ├─▶ POST /api/v1/delegations            → yeni delegation
  ├─▶ POST /api/v1/delegations/{id}/revoke
  └─▶ POST /api/v1/delegations/{id}/verify

Trust Management
  ├─▶ POST   /api/v1/agent-trust           → güven kur
  ├─▶ GET    /api/v1/agent-trust/{did}     → ilişkiler
  ├─▶ DELETE /api/v1/agent-trust/{did}/{trustedDid}
  └─▶ POST   /api/v1/agent-trust/verify

Present Credential (/present)
  ├─▶ QR Scan: openid4vp://?client_id=...&request_uri=... formatı
  ├─▶ Alternatif: Manuel URI paste
  ├─▶ POST /api/v1/holder/credentials/present  (verificationRequestUri gönder)
  └─▶ Backend: request_uri fetch → credential match → VP oluştur → direct_post

OpenID4VC Flows (Wallet ↔ Issuer/Verifier)
  ├─▶ GET  /credential-offer/{offerId}     → offer detayı
  ├─▶ POST /token                           → pre-auth code → access token
  ├─▶ POST /credential                      → credential al (proof ile)
  └─▶ POST /direct_post                     → VP token gönder
```

**Not:** VP flow backend-driven'dır. Wallet sadece URI'yi backend'e gönderir, backend tüm VP mantığını (`verifier.agent.ts` üzerinden) yürütür. Client-side VP flow için bkz: todo 007.

---

## Akış Diyagramları

### Credential Issuance Flow (OpenID4VCI)

```
Issuer Frontend                 Backend                        Wallet
     │                            │                              │
     │ POST /issuer/credentials/* │                              │
     │──────────────────────────▶│                              │
     │  ◀── credentialOfferUri   │                              │
     │       + QR Code           │                              │
     │                            │  GET /credential-offer/{id}  │
     │                            │◀─────────────────────────────│
     │                            │──── offer details ──────────▶│
     │                            │                              │
     │                            │  POST /token                 │
     │                            │  (pre-authorized_code)       │
     │                            │◀─────────────────────────────│
     │                            │──── access_token + c_nonce ─▶│
     │                            │                              │
     │                            │  POST /credential            │
     │                            │  (proof JWT + access_token)  │
     │                            │◀─────────────────────────────│
     │                            │──── SD-JWT VC credential ───▶│
     │                            │  (jwt~disclosure1~disc2~...)  │
```

### Credential Verification Flow (OpenID4VP)

```
Verifier Frontend               Backend                        Wallet
     │                            │                              │
     │ POST /verifier/verify/*    │                              │
     │──────────────────────────▶│                              │
     │  ◀── sessionId + QR       │                              │
     │     (openid4vp:// URI)     │                              │
     │                            │                              │
     │                            │  Wallet scans QR or paste URI│
     │                            │                              │
     │                            │  POST /holder/credentials/   │
     │                            │       present                │
     │                            │  (verificationRequestUri)    │
     │                            │◀─────────────────────────────│
     │                            │                              │
     │                            │  [Backend internally:]       │
     │                            │  1. Fetch request_uri        │
     │                            │  2. Parse presentation_def   │
     │                            │  3. Match holder credentials │
     │                            │  4. Create VP token          │
     │                            │  5. POST /direct_post        │
     │                            │     (vp_token + state)       │
     │                            │                              │
     │                            │  ◀── verify signature ──▶    │
     │                            │  ◀── check nonce ──▶         │
     │                            │  ◀── check revocation ──▶    │
     │                            │──── result ────────────────▶ │
     │                            │                              │
     │ GET /verify/{id}/result    │                              │
     │──────────────────────────▶│                              │
     │  ◀── verified: true/false │                              │
```

**Unified VP Flow (todo 008 tamamlandı):**
- `openid4vp.service.ts`: Tek VP motoru (Credo-first + Jose fallback)
- `verifier.agent.ts`: Thin wrapper — `openid4vp.service.ts`'e delege eder
- Tüm VP session'lar PostgreSQL'de (persistent), in-memory Map kaldırıldı
- Credo aktifken: `/oid4vp/{verifierId}/authorization-requests/{id}` endpoint'leri otomatik
- Jose fallback: Inline params (`presentation_definition` URI'da embedded)

**PostgreSQL Persistence — Fase 1 (todo 002):**
- Holder credentials, issuer offers/issued, partner keys → `IStorageAdapter` (PostgreSQL)
- 7 JSONB collection (Fase 1+2): `storage_holder_credentials`, `storage_issuer_credential_offers`, `storage_issuer_issued_credentials`, `storage_partner_keys`, `storage_org_agent_counts`, `storage_oidc_provider_configs`, `storage_batch_jobs`
- Auto-create tablolar (migration gereksiz), GIN index
- `holder.agent.ts`, `issuer.agent.ts`, `agentCredentialRequest.service.ts` tamamen persistent
- Fase 2: `oidc.service.ts` configs persistent (sessions/metadataCache transient kaldı), `batchIssuance.service.ts` jobs persistent (processJob chunk-level save)

---

## Güvenlik

### Rate Limiting
| Grup | Limit |
|------|-------|
| Auth (token) | 10 req / 15 min |
| Credential issuance | 30 req / min |
| Verification | 50 req / min |
| Trust/Revocation | Strict (daha düşük) |

### Middleware
- **CORS:** Whitelist (localhost:3000, 5173, 5174)
- **Helmet:** Security headers
- **Request ID:** Her request'e UUID
- **Request Logging:** `/health`, `/metrics` hariç tüm endpoint'ler loglanır
- **Error Format:** RFC 7807 Problem Detail

### Kriptografi
| Amaç | Yöntem |
|------|--------|
| JWT signing | EdDSA (Ed25519) via `jose` |
| DID key encoding | Multicodec 0xed01 + base58btc |
| SD-JWT digests | SHA-256 |
| Wallet encryption | AES-GCM (client-side) |
| Client secrets | bcrypt hash |

---

## Swagger
API dokümantasyonu: `GET /api/v1/docs`

---

## Temel Dosyalar

| Dosya | Rol |
|-------|-----|
| `backend/src/index.ts` | Express app setup, route mounting, middleware |
| `backend/src/services/openid4vci.service.ts` | OpenID4VCI protocol implementation (Draft 13+, SD-JWT VC + JWT-VC dual format, ~1179 satır) |
| `backend/src/services/openid4vp.service.ts` | OpenID4VP protocol implementation (877 satır) |
| `backend/src/services/sdjwt.service.ts` | SD-JWT issuance, verification |
| `backend/src/services/credo.service.ts` | Credo-TS entegrasyonu (PRIMARY — Askar varsa aktif) |
| `backend/src/services/didResolver.service.ts` | DID çözümleme + `resolvePublicKeyFromDid()` (did:key, did:web, did:peer) |
| `backend/src/services/revocation.service.ts` | Revocation & StatusList2021 |
| `backend/src/agents/base.agent.ts` | DID:key oluşturma, JWT signing |
| `backend/src/agents/credo.agent.ts` | Credo-TS agent wrapper |
| `backend/src/api/routes/openid4vci.routes.ts` | VCI route tanımları |
| `backend/src/api/routes/openid4vp.routes.ts` | VP route tanımları |
| `frontend-issuer-verifier/src/services/api.ts` | Frontend API service |
| `web-wallet/src/services/api.service.ts` | Wallet API service |
| `web-wallet/src/services/agent.service.ts` | Agent management service |
| `web-wallet/src/services/sdjwt.service.ts` | Client-side SD-JWT parsing |
| `web-wallet/src/pages/PresentCredential.tsx` | OpenID4VP presentation flow UI (QR scan + manual URI) |
| `web-wallet/src/components/QRScanner.tsx` | html5-qrcode wrapper component |
| `web-wallet/src/api.ts` | Wallet API calls (issue, verify, present) |
| `backend/src/api/schemas/validation.schemas.ts` | Zod validation schemas (credential format, DID, trust level, batch issuance) |
| `backend/src/services/batchIssuance.service.ts` | Batch issuance — parallel processing, retry, job tracking |
| `frontend-issuer-verifier/src/pages/BatchIssue.tsx` | Batch issue wizard (JSON/CSV import, progress, results) |
| `backend/src/agents/verifier.agent.ts` | Thin wrapper — delege eder openid4vp.service'e, DID/key management |
| `backend/src/database/storage-adapter.ts` | IStorageAdapter<T> — PostgreSQL / memory fallback |
| `backend/src/core/storage/index.ts` | Storage factory — `createStorageAdapter<T>()`, auto/postgres/memory/redis |
| `backend/src/core/storage/PostgresStorageAdapter.ts` | JSONB-based persistent storage, auto-table creation |
| `docker-compose.dev.yml` | Dev environment (4 services: backend, wallet, frontend, postgres) |
