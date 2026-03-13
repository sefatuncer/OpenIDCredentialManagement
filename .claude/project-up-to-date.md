# OpenID Credential Management - API & Protocol Reference

> Bu döküman projedeki tüm endpoint'leri, protokol kullanımlarını ve bileşen etkileşimlerini kapsar.

---

## Genel Mimari

```
┌─────────────────────┐     ┌─────────────────────────┐     ┌──────────────────┐
│  Frontend Issuer/    │     │      Backend (3000)      │     │    Web Wallet    │
│  Verifier (5174)     │────▶│  Express + PostgreSQL    │◀────│     (5173)       │
│  React + Vite        │     │  Credo-TS PRIMARY (Askar) │     │  React + Vite    │
└─────────────────────┘     └─────────────────────────┘     └──────────────────┘
        │                            │                              │
        │ Bearer Token (API Key)     │ PostgreSQL (5432)            │ Client Credentials
        │                            │ ssi-postgres (dev)           │ → Access Token
        └────────────────────────────┴──────────────────────────────┘

Docker Compose Dev: 5 servis (backend, web-wallet, issuer-verifier, postgres, keycloak:8080)

Mobile Wallet (React Native / Expo):
  ├── Screens: Home, Credentials, Scan, PresentCredential, Delegations, Agent, Trust, Settings
  ├── Native: Biometric (FaceID/TouchID), QR Scan (expo-camera), Push (Expo Push API)
  ├── Crypto: jose (pure JS — Ed25519, DID:key, VP token signing)
  ├── Storage: expo-secure-store (Keychain/Keystore)
  ├── Deep Links: openid4vp://, openid-credential-offer://, ssi-wallet://
  └── WebSocket: Auto-reconnect + AppState lifecycle (bg disconnect, fg reconnect)

Real-time Pipeline:
  EventBus (credential.revoked/issued/unrevoked, delegation.created/revoked, didcomm.connection/message)
    ├── WebSocket broadcast → frontend toast notifications
    ├── HTTP webhook delivery → external systems (HMAC-SHA256 signed)
    ├── HLF hash anchoring → Fabric ledger (feature-flag: module.hlf-anchoring)
    └── DIDComm events → WebSocket (didcomm:connection, didcomm:message)

Hyperledger Fabric (Opsiyonel — ayrı Docker Compose):
  docker/hlf/docker-compose.hlf.yml → orderer + 4 peer (2 org) + CLI
  Chaincode: credential-anchor (TypeScript, fabric-contract-api)
  On-chain: SHA-256 hash + timestamp + event type ONLY (credential content NEVER on-chain)
  Graceful degradation: HLF kapalıyken records PostgreSQL'de 'pending', retry job 60s

DIDComm v1 (Opsiyonel — feature flag: module.didcomm):
  Credo-TS @credo-ts/didcomm v0.6.3 — conditional dynamic import
  Inbound: DidCommHttpInboundTransport (Express app, /didcomm path)
  Outbound: DidCommHttpOutboundTransport (HTTP-based message delivery)
  Sub-modules: connections, oob, basicMessages (auto-registered by DidCommModule)
  Events: ConnectionStateChanged → WS didcomm:connection, BasicMessageStateChanged → WS didcomm:message

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
| **RFC 8693** | VC ↔ OAuth token exchange (bridge) | IETF RFC 8693 Token Exchange |
| **StatusList2021** | Credential revocation | W3C StatusList2021 |
| **EdDSA** | Signature algorithm (Ed25519) | C:\Users\sefa.tuncer\Desktop\docker-digital-id\fame-digital-idRFC 8032 |

### Kimlik Doğrulama

| Bileşen | Yöntem | Detay |
|---------|--------|-------|
| Frontend Issuer/Verifier | Keycloak SSO / Bearer Token | SSO (PKCE) veya API Key → sessionStorage |
| Web Wallet | Client Credentials | clientId + clientSecret → access token |
| OpenID4VCI spec endpoints | Token/No Auth | Spec gereği bazı endpoint'ler public |
| OpenID4VP direct_post | No Auth | Wallet'tan gelen VP submission |
| OAuth Bridge | VC JWT (self-auth) | VC credential'i kendisi authentication gorevi gorur |
| Backend middleware | 3-strategy chain | Keycloak JWT → local JWT → API key (`authenticateAny()`) |

---

## Credential Tipleri

| Tip | Açıklama | İçerik |
|-----|----------|--------|
| `AIAgentIdentityCredential` | AI agent kimlik belgesi | agentId, agentType, agentName, capabilities, trustLevel, securityDomain, registrationTimestamp, delegationChainPosition |
| `AIAgentIdentityCredential_sdjwt` | AI agent kimlik (SD-JWT VC) | Aynı alanlar, SD: agent_name, capabilities, trust_level, security_domain, registration_timestamp |
| `DelegationCredential` | Yetki devri belgesi | delegatorDid, delegateDid, scope, constraints, parentDelegationId, attenuationLevel, maxAmount, allowedServices, geographicRestrictions, ttlPolicy |
| `DelegationCredential_sdjwt` | Yetki devri (SD-JWT VC) | Aynı alanlar, SD: delegator_name, delegate_name, constraints, max_amount, allowed_services, geographic_restrictions |
| `CapabilityCredential` | Yetenek belgesi | capabilityType, resource, actions, conditions, grantedBy, toolAllowList, maxUsageCount, usageResetPeriod, requiredContext |
| `CapabilityCredential_sdjwt` | Yetenek (SD-JWT VC) | Aynı alanlar, SD: conditions, granted_by, tool_allow_list, max_usage_count, required_context |

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
| GET | `/api/v1/auth/keycloak/config` | - | - | Keycloak OIDC config (realmUrl, clientId) |
| POST | `/api/v1/auth/keycloak/callback` | - | 10/15min | Authorization code + PKCE verifier → local JWT |

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
| POST | `/api/v1/issuer/credentials/schema-issue` | Auth | 30/min | Schema-driven credential issuance (SD claim secimi, validity, format) |
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
| POST | `/api/v1/holder/push-token` | Auth | Push notification token kaydet (token, platform: ios/android/web) |

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
| POST | `/api/v1/delegations/{id}/revoke` | Auth | Delegation iptal et (cascade destekli) |
| POST | `/api/v1/delegations/{id}/verify` | Auth | Delegation'ı action/resource için doğrula |
| POST | `/api/v1/delegations/{id}/sub-delegate` | Auth | Sub-delegation oluştur (scope attenuation) |
| GET | `/api/v1/delegations/{id}/chain` | Auth | Full delegation chain (root → leaf) |

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

### Credential Schema Registry

| Method | Path | Auth | Rate Limit | Aciklama |
|--------|------|------|------------|----------|
| GET | `/api/v1/schemas` | Auth | - | Tum aktif schema'lari listele |
| GET | `/api/v1/schemas/{id}` | Auth | - | Schema detayi |
| POST | `/api/v1/schemas` | Auth | 30/min | Yeni schema olustur |
| PUT | `/api/v1/schemas/{id}` | Auth | 30/min | Schema guncelle |
| DELETE | `/api/v1/schemas/{id}` | Auth | - | Schema deaktive et (soft delete) |

**Built-in schemas:** AIAgentIdentityCredential, DelegationCredential, CapabilityCredential (seed data olarak yuklu)

---

### OAuth 2.0 Bridge (RFC 8693 Token Exchange)

| Method | Path | Auth | Rate Limit | Aciklama |
|--------|------|------|------------|----------|
| POST | `/api/v1/oauth/token-exchange` | - (VC is auth) | 10/15min | VC JWT → OAuth access token |
| POST | `/api/v1/oauth/introspect` | - | 10/15min | Bridge token introspection |
| GET | `/api/v1/oauth/scope-mappings` | - | - | Credential type → scope mappings |
| GET | `/api/v1/oauth/.well-known/oauth-bridge` | - | - | Bridge metadata discovery |

**Token Exchange Request (RFC 8693):**
```json
{
  "grant_type": "urn:ietf:params:oauth:grant-type:token-exchange",
  "subject_token": "<VC JWT>",
  "subject_token_type": "urn:ietf:params:oauth:token-type:jwt",
  "scope": "read write"
}
```

**Response:**
```json
{
  "access_token": "<bridge token>",
  "token_type": "Bearer",
  "expires_in": 900,
  "scope": "read write credential:AIAgentIdentityCredential",
  "issued_token_type": "urn:ietf:params:oauth:token-type:access_token"
}
```

**Scope Mapping:** `AIAgentIdentityCredential.capabilities` / `DelegationCredential.scope` / `CapabilityCredential.actions` → OAuth scopes. Trust level adds `trust:basic/verified/certified`.

---

### Webhooks (Real-time Notifications)

| Method | Path | Auth | Rate Limit | Aciklama |
|--------|------|------|------------|----------|
| GET | `/api/v1/webhooks` | Auth | - | Tum webhook subscription'lari listele |
| GET | `/api/v1/webhooks/{id}` | Auth | - | Webhook detayi |
| POST | `/api/v1/webhooks` | Auth | Strict | Yeni webhook subscription olustur (secret doner) |
| PUT | `/api/v1/webhooks/{id}` | Auth | Strict | Webhook guncelle |
| DELETE | `/api/v1/webhooks/{id}` | Auth | Strict | Webhook sil |
| POST | `/api/v1/webhooks/{id}/test` | Auth | Strict | Test event gonder |
| GET | `/api/v1/webhooks/{id}/deliveries` | Auth | - | Delivery history (son 50) |

**Desteklenen event'ler:** `credential.revoked`, `credential.unrevoked`, `credential.issued`, `verification.completed`, `delegation.created`, `delegation.revoked`

**Webhook Payload:**
```json
{
  "event": "credential.revoked",
  "data": { "credentialId": "...", "reason": "..." },
  "timestamp": "2026-03-12T..."
}
```

**Security:**
- HMAC-SHA256 signature: `X-Webhook-Signature: sha256=<hex>`
- HTTPS enforced in production
- SSRF koruması (private IP engelleme)
- Max 20 subscription limiti
- Retry: 3 deneme, exponential backoff (1s → 10s → 60s)

**WebSocket (Real-time):**
- Endpoint: `ws://localhost:3000/ws`
- Event'ler: `credential:issued`, `credential:revoked`, `credential:verified`, `credential:expiring`, `credential:expired`
- EventBus → WebSocket bridge otomatik (index.ts'de wire-up)

---

### Tenant Management (Multi-Tenant)

| Method | Path | Auth | Permission | Açıklama |
|--------|------|------|------------|----------|
| GET | `/api/v1/tenants` | Auth | tenants:read | Tüm tenant'ları listele (`?status=active\|suspended\|pending`) |
| GET | `/api/v1/tenants/stats` | Auth | tenants:read | Tenant istatistikleri (total, active, suspended, credentials) |
| GET | `/api/v1/tenants/:id` | Auth | tenants:read / own | Tenant detayı (admin veya kendi tenant'ı) |
| POST | `/api/v1/tenants` | Auth | tenants:write | Yeni tenant oluştur (name, slug, config) |
| PUT | `/api/v1/tenants/:id` | Auth | tenants:write | Tenant güncelle |
| POST | `/api/v1/tenants/:id/suspend` | Auth | tenants:write | Tenant askıya al (opsiyonel reason, max 500 char) |
| POST | `/api/v1/tenants/:id/activate` | Auth | tenants:write | Tenant aktifleştir |
| DELETE | `/api/v1/tenants/:id` | Auth | tenants:write | Tenant sil |
| GET | `/api/v1/tenants/:id/usage` | Auth | tenants:read / own | Tenant kullanım verileri |

**Feature Flag:** `module.multi-tenant` — devre dışıyken middleware skip, tenant endpoint'ler erişilebilir ama servis boş döner.

**Tenant Context Extraction (öncelik sırası):**
1. `X-Tenant-ID` header (UUID lookup)
2. `X-Tenant-Slug` header (slug lookup)
3. Subdomain (`tenant.example.com` → slug)
4. `tenantId` query parameter

**Middleware:** `optionalTenant()` global — tenant context varsa ekler, yoksa pass-through (backward compat).

---

### Hyperledger Fabric Anchoring

| Method | Path | Auth | Açıklama |
|--------|------|------|----------|
| GET | `/api/v1/fabric/status` | Auth | HLF connection status (enabled + connected) |
| GET | `/api/v1/fabric/anchors` | Auth | List recent anchor records (paginated: `?limit=50&offset=0`) |
| GET | `/api/v1/fabric/anchors/:referenceId` | Auth | Anchor status for credential/delegation |
| POST | `/api/v1/fabric/anchors/:referenceId/verify` | Auth | Verify on-chain hash matches local record |

### DIDComm v1 (`didcomm.routes.ts`) — Feature-flag: `module.didcomm`

| Method | Path | Auth | Açıklama |
|--------|------|------|----------|
| POST | `/api/v1/didcomm/invitations` | Auth | Create OOB invitation (returns invitationUrl + outOfBandId) |
| POST | `/api/v1/didcomm/invitations/receive` | Auth | Receive/accept OOB invitation (body: `{invitationUrl}`) |
| GET | `/api/v1/didcomm/connections` | Auth | List all DIDComm connections |
| GET | `/api/v1/didcomm/connections/:id` | Auth | Connection detail (state, theirDid, theirLabel) |
| POST | `/api/v1/didcomm/connections/:id/messages` | Auth | Send basic message (body: `{content}`) |
| GET | `/api/v1/didcomm/connections/:id/messages` | Auth | Get message history for connection |

**Feature Flag:** `module.hlf-anchoring` — devre dışıyken tüm endpoint'ler 404 döner (middleware gate).

### Policy Authorization (`policy.routes.ts`) — Feature-flag: `security.policy-engine`

| Method | Path | Auth | Açıklama |
|--------|------|------|----------|
| GET | `/api/v1/policies` | Auth | List all authorization policies |
| GET | `/api/v1/policies/:id` | Auth | Get policy detail |
| POST | `/api/v1/policies` | Auth+Admin | Create custom policy (body: name, effect, actions, resources, principals) |
| PUT | `/api/v1/policies/:id` | Auth+Admin | Update custom policy (built-in immutable) |
| DELETE | `/api/v1/policies/:id` | Auth+Admin | Delete custom policy (built-in immutable) |

**Middleware:** `enforcePolicy(action, resource)` applied to: issuer POST (3), verifier POST (3), delegation POST (2), tenant POST/DELETE (2).

**Anchor Records:** `fabric_anchor_records` tablosu — record_type (`revocation`, `delegation_created`, `delegation_revoked`), reference_id, data_hash (SHA-256), fabric_tx_id, status (`pending`/`confirmed`/`failed`), retry_count (max 3).

**Background:** Retry job (60s interval) — pending/failed records'ı HLF'ye yeniden gönderir.

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
  ├─▶ GET  /api/v1/auth/keycloak/config  (SSO availability check)
  ├─▶ [SSO] Redirect → Keycloak → POST /api/v1/auth/keycloak/callback (code+verifier)
  └─▶ [API Key] GET /api/v1/issuer/did  VEYA  GET /api/v1/verifier/did

Issuer Dashboard
  ├─▶ POST /api/v1/issuer/credentials/agent-identity  → credentialOfferUri + QR
  ├─▶ POST /api/v1/issuer/credentials/delegation       → credentialOfferUri + QR
  └─▶ POST /api/v1/issuer/credentials/capability        → credentialOfferUri + QR

Schema Management (/issuer/schemas)
  ├─▶ GET    /api/v1/schemas                      → schema listesi
  ├─▶ POST   /api/v1/schemas                      → yeni schema olustur
  ├─▶ PUT    /api/v1/schemas/{id}                  → schema guncelle
  └─▶ DELETE /api/v1/schemas/{id}                  → schema deaktive et

Advanced Issue (/issuer/issue-advanced)
  ├─▶ GET  /api/v1/schemas                           → schema dropdown
  └─▶ POST /api/v1/issuer/credentials/schema-issue   → credentialOfferUri + QR

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

Webhook Management (/issuer/webhooks)
  ├─▶ GET    /api/v1/webhooks                     → subscription listesi
  ├─▶ POST   /api/v1/webhooks                     → yeni subscription (secret doner)
  ├─▶ PUT    /api/v1/webhooks/{id}                → guncelle (active toggle)
  ├─▶ DELETE /api/v1/webhooks/{id}                → sil
  ├─▶ POST   /api/v1/webhooks/{id}/test           → test event gonder
  └─▶ GET    /api/v1/webhooks/{id}/deliveries     → delivery history

Real-time Notifications (WebSocket)
  └─▶ ws://localhost:3000/ws  → credential:issued, credential:revoked toasts

OAuth Bridge (/issuer/oauth-bridge)
  ├─▶ POST /api/v1/oauth/token-exchange   → VC JWT → OAuth access token
  ├─▶ POST /api/v1/oauth/introspect       → bridge token dogrulama
  └─▶ GET  /api/v1/oauth/scope-mappings   → credential type → scope mappings

Tenant Management (/issuer/tenants)
  ├─▶ GET    /api/v1/tenants                      → tenant listesi (filter by status)
  ├─▶ GET    /api/v1/tenants/stats                 → tenant istatistikleri
  ├─▶ POST   /api/v1/tenants                       → yeni tenant oluştur (name, slug)
  ├─▶ POST   /api/v1/tenants/{id}/suspend           → tenant askıya al
  ├─▶ POST   /api/v1/tenants/{id}/activate           → tenant aktifleştir
  └─▶ DELETE /api/v1/tenants/{id}                   → tenant sil

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
  ├─▶ POST /api/v1/delegations            → yeni delegation (+ VC issuance)
  ├─▶ POST /api/v1/delegations/{id}/revoke  (cascade destekli)
  ├─▶ POST /api/v1/delegations/{id}/verify
  ├─▶ POST /api/v1/delegations/{id}/sub-delegate  → scope attenuation
  └─▶ GET  /api/v1/delegations/{id}/chain  → full chain visualization

Trust Management
  ├─▶ POST   /api/v1/agent-trust           → güven kur
  ├─▶ GET    /api/v1/agent-trust/{did}     → ilişkiler
  ├─▶ DELETE /api/v1/agent-trust/{did}/{trustedDid}
  └─▶ POST   /api/v1/agent-trust/verify

Present Credential (/present) — Dual Mode
  ├─▶ QR Scan: openid4vp://?client_id=...&request_uri=... formatı
  ├─▶ Alternatif: Manuel URI paste
  ├─▶ Mode: Backend
  │     └─▶ POST /api/v1/holder/credentials/present  (verificationRequestUri gönder)
  │          → Backend: request_uri fetch → credential match → VP oluştur → direct_post
  └─▶ Mode: Client-Side (varsayılan)
        ├─▶ GET /api/v1/holder/credentials  (jwt + combined alanları ile)
        ├─▶ fetch(request_uri) → presentation_definition
        ├─▶ Wallet-local: credential matching, SD-JWT disclosure seçimi
        ├─▶ Wallet-local: Ed25519 key pair → did:key → VP token (jose SignJWT)
        └─▶ POST /direct_post  (vp_token + presentation_submission + state)

OpenID4VC Flows (Wallet ↔ Issuer/Verifier)
  ├─▶ GET  /credential-offer/{offerId}     → offer detayı
  ├─▶ POST /token                           → pre-auth code → access token
  ├─▶ POST /credential                      → credential al (proof ile)
  └─▶ POST /direct_post                     → VP token gönder
```

**Not:** VP flow artık dual-mode: Client-side (varsayılan) veya Backend. Client-side modda wallet kendi Ed25519 key pair'i ile VP token oluşturur ve `direct_post`'a doğrudan gönderir. SD-JWT credential'lar için selective disclosure UI mevcuttur.

### Mobile Wallet (React Native / Expo)

```
Authentication
  └─▶ POST /api/v1/auth/token  (client credentials → access token, expo-secure-store cache)

Biometric Gate (App Root)
  └─▶ expo-local-authentication (FaceID / TouchID / Passcode fallback)

Home Dashboard
  ├─▶ POST /api/v1/agents/register           → Agent DID (ilk kurulum)
  ├─▶ GET  /api/v1/wallet/{did}              → Wallet state
  └─▶ ws://localhost:3000/ws                 → Real-time events (auto-reconnect + AppState lifecycle)

Credentials (expo-secure-store encrypted)
  ├─▶ GET  /api/v1/holder/credentials        → Credential list (jwt + combined + isSDJWT)
  ├─▶ Local: SD-JWT client-side parsing (base64url decode)
  └─▶ Type-based card routing: AgentIdentityCard, DelegationCard, CapabilityCard, SDJWTCredentialCard

QR Scan (expo-camera)
  ├─▶ openid4vp://  → PresentCredentialScreen (VP flow)
  └─▶ openid-credential-offer://  → Credential receive flow

VP Presentation (Client-Side — jose pure JS)
  ├─▶ fetch(request_uri) → presentation_definition
  ├─▶ Wallet-local: credential matching, SD-JWT disclosure toggle
  ├─▶ Wallet-local: Ed25519 key → did:key → VP token (jose SignJWT)
  └─▶ POST /direct_post  (application/x-www-form-urlencoded)

Delegations
  ├─▶ GET  /api/v1/delegations                → received + given
  ├─▶ POST /api/v1/delegations                → create (modal)
  └─▶ POST /api/v1/delegations/{id}/revoke    → revoke

Agent Management
  ├─▶ POST /api/v1/agents/register            → register (name, type, capabilities)
  └─▶ GET  /api/v1/wallet/{did}               → profile + activity log

Trust Management
  ├─▶ POST   /api/v1/agent-trust              → establish trust
  ├─▶ GET    /api/v1/agent-trust/{did}        → relationships
  └─▶ DELETE /api/v1/agent-trust/{did}/{trustedDid}  → revoke

Push Notifications (expo-notifications)
  ├─▶ POST /api/v1/holder/push-token          → register Expo push token
  └─▶ Backend: EventBus credential.revoked → Expo Push API broadcast
```

**Deep Link URI Schemes:** `openid4vp://`, `openid-credential-offer://`, `ssi-wallet://`
**Code Reuse:** ~60% from web-wallet (types=100%, vp/sdjwt=100%, wallet-key/api=90%, UI=0%)

---

## Akış Diyagramları

### Credential Issuance Flow (OpenID4VCI)

```
Issuer Frontend                 Backend                        Wallet
     │                            │                              │
     │ POST /issuer/credentials/* │                              │
     │ (veya /schema-issue)      │                              │
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

### Credential Verification Flow (OpenID4VP) — Dual Mode

```
Verifier Frontend               Backend                        Wallet
     │                            │                              │
     │ POST /verifier/verify/*    │                              │
     │──────────────────────────▶│                              │
     │  ◀── sessionId + QR       │                              │
     │     (openid4vp:// URI)     │                              │
     │                            │  Wallet scans QR or paste URI│
     │                            │                              │
     │  ┌─ Backend Mode ─────────────────────────────────────────┐
     │  │                         │  POST /holder/credentials/   │
     │  │                         │       present                │
     │  │                         │◀─────────────────────────────│
     │  │                         │  [Backend: fetch → match →   │
     │  │                         │   create VP → direct_post]   │
     │  └────────────────────────────────────────────────────────┘
     │  ┌─ Client-Side Mode (varsayılan) ────────────────────────┐
     │  │                         │  GET /holder/credentials     │
     │  │                         │  (jwt + combined alanları)   │
     │  │                         │─────────────────────────────▶│
     │  │                         │                              │
     │  │                         │  [Wallet locally:]           │
     │  │                         │  1. fetch(request_uri)       │
     │  │                         │  2. Match credentials        │
     │  │                         │  3. SD-JWT disclosure select │
     │  │                         │  4. Ed25519 key → did:key    │
     │  │                         │  5. Create VP token (jose)   │
     │  │                         │                              │
     │  │                         │  POST /direct_post           │
     │  │                         │  (vp_token + state)          │
     │  │                         │◀─────────────────────────────│
     │  └────────────────────────────────────────────────────────┘
     │                            │                              │
     │                            │  ◀── verify VP signature ──▶ │
     │                            │  ◀── resolve did:key ──▶     │
     │                            │  ◀── check nonce ──▶         │
     │                            │  ◀── check revocation ──▶    │
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

**PostgreSQL Persistence (todo 002 — Fase 1-3 tamamlandı):**
- 13 JSONB collection: `storage_holder_credentials`, `storage_issuer_credential_offers`, `storage_issuer_issued_credentials`, `storage_partner_keys`, `storage_org_agent_counts`, `storage_oidc_provider_configs`, `storage_batch_jobs`, `storage_credential_schemas`, `storage_expiration_credentials`, `storage_expiration_notifications`, `storage_encryption_keys`, `storage_agent_profiles`
- Auto-create tablolar (migration gereksiz), GIN index
- Fase 1: holder credentials, issuer offers/issued, partner keys
- Fase 2: OIDC configs, batch jobs (sessions/metadataCache transient kaldı)
- Fase 3: schema registry (built-in schema seed), expiration notifier, encryption keys (envelope-encrypted with KEK), agent profiles
- Encryption keys: envelope encryption (AES-256-GCM wrap with KEK from env var) — DB compromise'da key material korunur
- Boot sırası: `initializeCore()` → `encryptionService.initialize()` → `schemaRegistry.initialize()` → agents
- Fase 4 (transient, bırakılabilir): websocket clients, event history, feature flags, plugins, simulation

---

## Güvenlik

### Rate Limiting
| Grup | Limit |
|------|-------|
| Auth (token) | 10 req / 15 min |
| Credential issuance | 30 req / min |
| Verification | 50 req / min |
| Trust/Revocation | Strict (daha düşük) |
| OAuth Bridge (exchange/introspect) | 10 req / 15 min |
| Webhook mutations (create/update/delete/test) | Strict |

### Middleware
- **CORS:** Whitelist (localhost:3000, 5173, 5174), `X-Tenant-ID` + `X-Tenant-Slug` allowed headers
- **Helmet:** Security headers
- **Request ID:** Her request'e UUID
- **Request Logging:** `/health`, `/metrics` hariç tüm endpoint'ler loglanır
- **Error Format:** RFC 7807 Problem Detail
- **Multi-Tenant:** `optionalTenant()` global middleware — tenant context ekler (feature-flag gated: `module.multi-tenant`)

### Kriptografi
| Amaç | Yöntem |
|------|--------|
| JWT signing | EdDSA (Ed25519) via `jose` |
| DID key encoding | Multicodec 0xed01 + base58btc |
| SD-JWT digests | SHA-256 |
| Wallet credential encryption | AES-GCM-256 (client-side, localStorage) |
| Wallet VP key encryption | AES-GCM-256 (client-side, sessionStorage) |
| Mobile wallet key-at-rest | AES-GCM-256 (crypto.subtle → expo-secure-store) |
| Encryption key-at-rest | AES-256-GCM envelope wrap (KEK from env var) |
| Webhook signing | HMAC-SHA256 (per-subscription secret) |
| Client secrets | bcrypt hash |

### SSRF Koruması
| Bileşen | Koruma |
|---------|--------|
| Backend webhook delivery | Private IP blocking (hostname regex) + HTTPS enforcement (prod) |
| Mobile wallet VP fetch | `validateUrl()` — private IP blocking + HTTPS enforcement (prod) |
| Mobile wallet VP submit | `validateUrl()` — aynı koruma |

### Input Validation (Mobile Wallet)
| Veri | Yöntem |
|------|--------|
| Presentation definition | `validatePresentationDefinition()` runtime type guard (id + input_descriptors) |
| Delegation DID | `/^did:[a-z0-9]+:.+$/i` regex |
| Client credentials | clientSecret yoksa throw (empty default yok) |
| Auth token | JWT exp parse + 60s buffer TTL check |
| Credential matching | field.filter.const / enum / pattern constraint check |

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
| `web-wallet/src/pages/PresentCredential.tsx` | OpenID4VP presentation flow UI — dual mode (client-side + backend) |
| `web-wallet/src/services/wallet-key.service.ts` | Ed25519 key pair gen, DID:key derivation, AES-GCM encrypted storage, JWT signing |
| `web-wallet/src/services/vp.service.ts` | Client-side VP: URI parsing, auth request fetch, credential matching, VP creation, direct_post |
| `web-wallet/src/services/sdjwt-presentation.service.ts` | SD-JWT disclosure filtering for selective presentation |
| `web-wallet/src/components/QRScanner.tsx` | html5-qrcode wrapper component |
| `web-wallet/src/api.ts` | Wallet API calls (issue, verify, present) |
| `backend/src/api/schemas/validation.schemas.ts` | Zod validation schemas (credential format, DID, trust level, batch issuance) |
| `backend/src/services/batchIssuance.service.ts` | Batch issuance — parallel processing, retry, job tracking |
| `frontend-issuer-verifier/src/pages/BatchIssue.tsx` | Batch issue wizard (JSON/CSV import, progress, results) |
| `backend/src/agents/verifier.agent.ts` | Thin wrapper — delege eder openid4vp.service'e, DID/key management |
| `backend/src/database/storage-adapter.ts` | IStorageAdapter<T> — PostgreSQL / memory fallback |
| `backend/src/core/storage/index.ts` | Storage factory — `createStorageAdapter<T>()`, auto/postgres/memory/redis |
| `backend/src/core/storage/PostgresStorageAdapter.ts` | JSONB-based persistent storage, auto-table creation |
| `backend/src/api/routes/schema.routes.ts` | Schema registry CRUD endpoints (5 routes) |
| `backend/src/services/schemaRegistry.service.ts` | Schema registry service — 3 built-in schemas, CRUD, validation (PostgreSQL persistent) |
| `backend/src/services/encryption.service.ts` | AES-256-GCM encryption — envelope key storage, hybrid DB+cache |
| `backend/src/services/expirationNotifier.service.ts` | Credential expiration tracking + WebSocket notifications (PostgreSQL persistent) |
| `backend/src/services/capabilityDiscovery.service.ts` | Agent capability discovery registry (PostgreSQL persistent) |
| `frontend-issuer-verifier/src/pages/IssueAdvanced.tsx` | Schema-driven 3-step issuance wizard (SD claim selection, preview, QR) |
| `frontend-issuer-verifier/src/pages/SchemaManagement.tsx` | Schema management UI (list/detail/create) |
| `backend/src/services/oauth-bridge.service.ts` | OAuth 2.0 Bridge — VC verification, scope mapping, token exchange (RFC 8693) |
| `backend/src/api/routes/oauth-bridge.routes.ts` | OAuth bridge endpoints (token-exchange, introspect, scope-mappings, well-known) |
| `frontend-issuer-verifier/src/pages/OAuthBridge.tsx` | OAuth bridge admin UI (exchange, introspect, mappings tabs) |
| `backend/src/services/webhook.service.ts` | Webhook subscription CRUD + re-export delivery functions |
| `backend/src/services/webhookDelivery.service.ts` | HMAC-SHA256 delivery engine, retry, subscription cache, pruning |
| `backend/src/api/routes/webhook.routes.ts` | Webhook CRUD + test + delivery history endpoints (7 routes) |
| `backend/src/services/websocket.service.ts` | WebSocket real-time broadcasts (`/ws` endpoint) |
| `frontend-issuer-verifier/src/pages/WebhookManagement.tsx` | Webhook subscription management UI (list/create/detail/deliveries) |
| `frontend-issuer-verifier/src/hooks/useWebSocket.ts` | WebSocket client hook with auto-reconnect + stable ref pattern |
| `frontend-issuer-verifier/src/components/NotificationToast.tsx` | Real-time credential event toast notifications |
| `backend/src/services/delegation.service.ts` | Delegation grants, chain attenuation, cascade revoke, VC↔DB integration |
| `web-wallet/src/components/AgentIdentityCard.tsx` | Agent ID credential card (trust level, capabilities, security domain) |
| `web-wallet/src/components/DelegationCard.tsx` | Delegation credential card (scope, chain depth, expiry, maxAmount) |
| `web-wallet/src/components/CapabilityCard.tsx` | Capability credential card (tool allow list, usage, context) |
| `web-wallet/src/components/DelegationChainView.tsx` | Chain visualization modal (A→B→C with status colors) |
| `backend/src/services/keycloak.service.ts` | Keycloak OIDC — JWKS validation, token verify, role mapping, code exchange |
| `backend/src/api/routes/keycloak-auth.routes.ts` | Keycloak auth endpoints (/config, /callback) |
| `frontend-issuer-verifier/src/services/keycloak.ts` | Frontend PKCE flow — native crypto, state/verifier management |
| `backend/docker/keycloak/ssi-realm.json` | Keycloak realm import (3 clients, 4 roles, 2 test users) |
| `docker-compose.dev.yml` | Dev environment (5 services: backend, wallet, frontend, postgres, keycloak) |
| `backend/src/api/middleware/tenant.middleware.ts` | Multi-tenant middleware — `optionalTenant()`, `requireTenant()`, tenant context extraction |
| `backend/src/services/tenant-storage.service.ts` | Tenant-scoped storage helpers — `saveTenantData()`, `listTenantData()`, `queryTenantData()` |
| `backend/src/api/routes/tenant.routes.ts` | Tenant CRUD endpoints (9 routes: list, stats, get, create, update, suspend, activate, delete, usage) |
| `backend/src/services/multiTenant.service.ts` | Multi-tenant business logic — CRUD, suspend/activate, usage, stats (528L) |
| `frontend-issuer-verifier/src/pages/TenantManagement.tsx` | Tenant management admin UI (list, create, suspend/activate, delete, stats cards) |
| `backend/src/services/fabricAnchor.service.ts` | HLF hash anchoring — anchor, verify, retry, status (384L) |
| `backend/src/services/didcomm.service.ts` | DIDComm API wrappers — invitations, connections, messages (214L) |
| `backend/src/api/routes/didcomm.routes.ts` | DIDComm REST endpoints — 6 routes, feature-flag gated (113L) |
| `backend/src/services/policy.service.ts` | Policy authorization engine — evaluate, CRUD, built-in defaults, cache (270L) |
| `backend/src/api/middleware/policy.middleware.ts` | `enforcePolicy()` Express middleware — feature-flag pass-through (65L) |
| `backend/src/api/routes/policy.routes.ts` | Policy CRUD endpoints — 5 routes, admin only, feature-flag gated (140L) |
| `backend/src/api/routes/fabric.routes.ts` | Fabric anchor API (4 endpoints: status, list, get, verify) |
| `backend/chaincode/credential-anchor/src/credential-anchor.ts` | HLF chaincode — writeAnchor, readAnchor, verifyAnchor |
| `backend/docker/hlf/docker-compose.hlf.yml` | HLF network (orderer + 4 peers + CLI, separate from dev compose) |
| `backend/docker/hlf/scripts/setup-channel.sh` | Channel creation + chaincode deployment script |
