# System Architecture Review

**Tarih:** 2026-03-13
**Sistem:** OpenID Credential Management (AI Agent Identity System)
**Repo:** https://github.com/sefatuncer/OpenIDCredentialManagement
**Branch:** main

---

## 1. Protokol ve Standartlar

### OpenID4VCI 1.0 (Credential Issuance)

**Spec:** OpenID for Verifiable Credential Issuance (Draft 13+)

| Concern | Dosya | Satir |
|---------|-------|-------|
| Issuer metadata | `backend/src/services/openid4vci.service.ts` | 1181L |
| Well-known endpoints | `backend/src/api/routes/openid4vci.routes.ts` | 482L |
| Credential offer create/get | `backend/src/services/openid4vci.service.ts` | |
| Token exchange (pre-auth code) | `backend/src/services/openid4vci.service.ts` | |
| Credential issuance | `backend/src/services/openid4vci.service.ts` | |
| Batch credential | `backend/src/services/openid4vci.service.ts` | |
| Deferred credential | `backend/src/services/openid4vci.service.ts` | |
| Credo-TS primary engine | `backend/src/agents/credo.agent.ts` | 676L |
| Credo service wrapper | `backend/src/services/credo.service.ts` | 418L |

**Endpoints (no-auth, spec-required):**
- `GET /.well-known/openid-credential-issuer` -- Issuer metadata discovery
- `GET /.well-known/oauth-authorization-server` -- AS metadata
- `POST /credential-offer` -- Create credential offer
- `GET /credential-offer/:offerId` -- Retrieve offer
- `POST /token` -- Pre-authorized code exchange
- `POST /credential` -- Credential issuance
- `POST /batch-credential` -- Batch issuance
- `POST /deferred-credential` -- Deferred credential retrieval

**Key fields (Draft 13+ compliance):**
- `credential_configuration_id` (replaces `credential_definition.type[]`)
- `txCode` (replaces deprecated `userPinRequired`)
- `c_nonce` / `c_nonce_expires_in` in token response

### OpenID4VP 1.0 (Verifiable Presentations)

**Spec:** OpenID for Verifiable Presentations (Draft 20+)

| Concern | Dosya | Satir |
|---------|-------|-------|
| VP service (single engine) | `backend/src/services/openid4vp.service.ts` | 885L |
| VP routes | `backend/src/api/routes/openid4vp.routes.ts` | 294L |
| Verifier agent (thin wrapper) | `backend/src/agents/verifier.agent.ts` | 155L |
| direct_post handler | `backend/src/api/server.ts` (line 384) | |
| Client-side VP (wallet) | `web-wallet/src/services/vp.service.ts` | 214L |

**Endpoints:**
- `POST /direct_post` (global, no-auth, spec-required) -- Wallet submits VP here
- `GET /api/v1/openid4vp/presentation-definitions` -- List available PDs
- `GET /api/v1/openid4vp/presentation-definitions/:id` -- Get specific PD
- `POST /api/v1/openid4vp/authorization-request` -- Create auth request
- `GET /api/v1/openid4vp/sessions/:sessionId` -- Session status
- `GET /api/v1/openid4vp/sessions/:sessionId/result` -- Verification result
- `GET /api/v1/openid4vp/sessions` -- List all sessions
- `GET /api/v1/openid4vp/client-metadata` -- Verifier client metadata
- `GET /api/v1/openid4vp/did` -- Verifier DID

**Flow:** `response_mode=direct_post`, `client_id_scheme=did`, `response_uri` based.

### SD-JWT VC

**Spec:** draft-ietf-oauth-selective-disclosure-jwt + vc+sd-jwt format

| Concern | Dosya | Satir |
|---------|-------|-------|
| SD-JWT service (issue/verify/present) | `backend/src/services/sdjwt.service.ts` | 723L |
| SD-JWT routes | `backend/src/api/routes/sdjwt.routes.ts` | 433L |
| Client-side SD-JWT parsing | `web-wallet/src/services/sdjwt.service.ts` | 288L |
| Client-side SD-JWT presentation | `web-wallet/src/services/sdjwt-presentation.service.ts` | 54L |
| Mobile SD-JWT | `mobile-wallet/src/services/sdjwt.service.ts` | |

**Supported formats:**
- `jwt_vc_json` -- Standard JWT VC (backward compat)
- `vc+sd-jwt` -- Default format (eIDAS 2.0 / EUDI ARF compliant)

**Config ID convention:** `_sdjwt` suffix (e.g., `AIAgentIdentityCredential_sdjwt`)

**SD claim definitions:** `SD_CLAIMS_BY_TYPE` map in openid4vci.service.ts -- identity fields mandatory, identifying fields selectively disclosable.

### DID Methods

| Method | Dosya | Notlar |
|--------|-------|--------|
| did:key | `backend/src/services/didResolver.service.ts` (716L) | Ed25519 multicodec prefix (0xed01), base58btc encoding |
| did:web | `backend/src/services/didResolver.service.ts` | HTTPS resolution |
| did:peer | `backend/src/services/didResolver.service.ts` | Private connections |

**Central resolution:** `resolvePublicKeyFromDid()` in `didResolver.service.ts` -- used by VP, SD-JWT, VCI services.

**DID routes (`/api/v1/did`):**
- `GET /resolve/:did` -- Universal DID resolution
- `GET /dereference` -- DID URL dereferencing
- `POST /validate` -- DID validation + resolution check
- `GET /methods` -- Supported methods
- `GET /cache/stats` -- Cache statistics
- `POST /cache/clear` -- Clear cache
- `GET /document/:did` -- Direct DID Document retrieval

### W3C VC Data Model 2.0

Credential types defined in `backend/src/config/credentials.config.ts`:
- `AIAgentIdentityCredential` -- Agent identity, capabilities, trust level
- `DelegationCredential` -- Delegated authority between entities
- `CapabilityCredential` -- Specific capability grants

All credentials include `credentialStatus` with StatusList2021 support for revocation.

### DIDComm v1

**Feature flag:** `module.didcomm` (default: false)

| Concern | Dosya | Satir |
|---------|-------|-------|
| DIDComm service wrapper | `backend/src/services/didcomm.service.ts` | 221L |
| DIDComm routes | `backend/src/api/routes/didcomm.routes.ts` | 228L |
| Credo DidCommModule | `backend/src/agents/credo.agent.ts` | |

**Endpoints (`/api/v1/didcomm`):**
- `POST /invitations` -- Create OOB invitation
- `POST /invitations/receive` -- Accept invitation
- `GET /connections` -- List connections
- `GET /connections/:id` -- Connection detail
- `POST /connections/:id/messages` -- Send basic message
- `GET /connections/:id/messages` -- Message history

**Events:** ConnectionStateChanged + BasicMessageStateChanged forwarded to WebSocket.

### OAuth 2.0 / RFC 8693 Token Exchange

| Concern | Dosya | Satir |
|---------|-------|-------|
| Bridge service | `backend/src/services/oauth-bridge.service.ts` | 220L |
| Bridge routes | `backend/src/api/routes/oauth-bridge.routes.ts` | 186L |

**Endpoints (`/api/v1/oauth`, no-auth -- VC is the authentication):**
- `POST /token-exchange` -- VC-to-OAuth token exchange (RFC 8693)
- `POST /introspect` -- Bridge token introspection
- `GET /scope-mappings` -- Credential-to-scope mapping
- `GET /.well-known/oauth-bridge` -- Bridge metadata discovery

---

## 2. Backend Servisleri

### Tam Servis Katalogu

| Servis | Dosya | Satir | Aciklama | Kullanilan Route |
|--------|-------|-------|----------|------------------|
| openid4vci.service | `backend/src/services/openid4vci.service.ts` | 1181L | OpenID4VCI credential issuance engine (offer, token, credential, batch, deferred) | openid4vci.routes, issuer.routes |
| openid4vp.service | `backend/src/services/openid4vp.service.ts` | 885L | OpenID4VP verification engine (auth request, direct_post, session mgmt) | openid4vp.routes, verifier.routes, server.ts |
| sdjwt.service | `backend/src/services/sdjwt.service.ts` | 723L | SD-JWT credential create/parse/present/verify | sdjwt.routes |
| didResolver.service | `backend/src/services/didResolver.service.ts` | 716L | Universal DID resolution (did:key, did:web, did:peer), caching | did.routes, used by VP/VCI/SD-JWT |
| agentCredentialRequest.service | `backend/src/services/agentCredentialRequest.service.ts` | 696L | Federated agent credential onboarding (org approval, existing cred, partner key) | server.ts (inline) |
| trustRegistry.service | `backend/src/services/trustRegistry.service.ts` | 605L | Trust registry CRUD, trust policies, issuer/verifier trust verification | trust.routes |
| backup.service | `backend/src/services/backup.service.ts` | 581L | Full/partial backup create, restore, verify, integrity check | backup.routes |
| revocation.service | `backend/src/services/revocation.service.ts` | 555L | StatusList2021 revocation (revoke, unrevoke, status list credential) | revocation.routes |
| multiTenant.service | `backend/src/services/multiTenant.service.ts` | 527L | Multi-tenant CRUD, isolation, usage tracking | tenant.routes |
| audit.service | `backend/src/services/audit.service.ts` | 521L | Audit log write/query/stats/export (PostgreSQL + in-memory) | audit.routes |
| agent.service | `backend/src/services/agent.service.ts` | 457L | Agent CRUD, wallet, activity log, credential requests | agent.routes, wallet.routes |
| credo.service | `backend/src/services/credo.service.ts` | 418L | Credo-TS initialization, Askar setup, route registration | index.ts |
| delegation.service | `backend/src/services/delegation.service.ts` | 417L | Delegation CRUD, sub-delegation, chain attenuation, cascade revoke | delegation.routes |
| oidc.service | `backend/src/services/oidc.service.ts` | 400L | OIDC provider configuration management | openid4vci.routes |
| fabricAnchor.service | `backend/src/services/fabricAnchor.service.ts` | 384L | HLF hash anchoring (anchor, verify, retry, status) | fabric.routes, EventBus |
| encryption.service | `backend/src/services/encryption.service.ts` | 370L | Envelope encryption (KEK from env, data key wrap/unwrap) | Boot (index.ts) |
| policy.service | `backend/src/services/policy.service.ts` | 359L | RBAC policy engine (evaluate, CRUD, built-in defaults, 30s cache) | policy.routes, policy.middleware |
| metrics.service | `backend/src/services/metrics.service.ts` | 359L | Prometheus-compatible metrics collection | metrics.routes, requestLogger |
| credential-mapper.service | `backend/src/services/credential-mapper.service.ts` | 342L | Credential format mapping between internal/external representations | openid4vci.service |
| schemaRegistry.service | `backend/src/services/schemaRegistry.service.ts` | 341L | Credential schema CRUD, validation, built-in seed schemas | schema.routes |
| batchIssuance.service | `backend/src/services/batchIssuance.service.ts` | 329L | Batch credential issuance jobs (create, process, status) | issuer.routes |
| expirationNotifier.service | `backend/src/services/expirationNotifier.service.ts` | 290L | Background credential expiration checks and notifications | Boot (index.ts) |
| capabilityDiscovery.service | `backend/src/services/capabilityDiscovery.service.ts` | 282L | Agent capability discovery and matching | agent.service |
| webhookDelivery.service | `backend/src/services/webhookDelivery.service.ts` | 229L | HMAC-SHA256 signed webhook delivery, retry (1s/10s/60s), SSRF protection | webhook.service |
| didcomm.service | `backend/src/services/didcomm.service.ts` | 221L | DIDComm wrapper (invitation, connection, messaging) | didcomm.routes |
| oauth-bridge.service | `backend/src/services/oauth-bridge.service.ts` | 220L | VC-to-OAuth token exchange (RFC 8693) | oauth-bridge.routes |
| keycloak.service | `backend/src/services/keycloak.service.ts` | 210L | Keycloak SSO (JWKS cache, token validation, role mapping) | auth.middleware |
| credo.client | `backend/src/services/credo.client.ts` | 199L | Credo-TS HTTP client for external Credo agent communication | credo.service |
| webhook.service | `backend/src/services/webhook.service.ts` | 153L | Webhook subscription CRUD, test, delivery history | webhook.routes |
| websocket.service | `backend/src/services/websocket.service.ts` | 151L | WebSocket broadcast (credential events, DIDComm) | Boot (index.ts) |
| push-notification.service | `backend/src/services/push-notification.service.ts` | 123L | Push notifications for mobile wallet (Expo) | holder.routes, EventBus |
| tenant-storage.service | `backend/src/services/tenant-storage.service.ts` | 103L | Tenant-scoped JSONB storage adapter | multiTenant.service |

### Agent Dosyalari

| Agent | Dosya | Satir | Aciklama |
|-------|-------|-------|----------|
| credo.agent | `backend/src/agents/credo.agent.ts` | 676L | Credo-TS agent initialization, Askar binding, DID management, KMS |
| holder.agent | `backend/src/agents/holder.agent.ts` | 502L | Credential receive, present, store, delete |
| issuer.agent | `backend/src/agents/issuer.agent.ts` | 446L | Credential issuance (identity, delegation, capability), offer/token/claim |
| base.agent | `backend/src/agents/base.agent.ts` | 279L | Abstract base with DID key generation, JWK management |
| verifier.agent | `backend/src/agents/verifier.agent.ts` | 155L | Thin wrapper delegating to openid4vp.service |

---

## 3. API Endpoint Katalogu

**Base path:** `/api/v1`
**Authentication:** Tum `/api/v1/*` route'lari `authenticateAny()` middleware ile korunur (Keycloak JWT -> local JWT -> API key).

### Pre-Auth Endpoints (authentication middleware'den once)

| Path | Method | Auth | Servis |
|------|--------|------|--------|
| `/health` | GET | None | - |
| `/health/ready` | GET | None | - |
| `/health/live` | GET | None | - |
| `/health/detailed` | GET | None | - |
| `/health/features` | GET | None | - |
| `/health/storage` | GET | None | - |
| `/metrics` | GET | None | metrics.service |
| `/.well-known/openid-credential-issuer` | GET | None | openid4vci.service, credo.service |
| `/.well-known/oauth-authorization-server` | GET | None | openid4vci.service |
| `/api/v1/auth/token` | POST | None (rate limited) | clientCredentials.repository |
| `/api/v1/auth/introspect` | POST | None | JWT verification |
| `/api/v1/auth/keycloak/config` | GET | None | keycloak.service |
| `/api/v1/auth/keycloak/callback` | POST | None | keycloak.service |
| `/api/v1/issuer/token` | POST | None | issuer.agent |
| `/api/v1/issuer/credential` | POST | Bearer | issuer.agent |
| `/api/v1/simulation/*` | * | None | simulation engine |
| `/api/v1/agents/register` | POST | None | agent.service |
| `/api/v1/credentials/request` | POST | None | agentCredentialRequest.service |
| `/direct_post` | POST | None (rate limited) | openid4vp.service |
| `/api/v1/oauth/token-exchange` | POST | None (rate limited) | oauth-bridge.service |
| `/api/v1/oauth/introspect` | POST | None (rate limited) | JWT verify |
| `/api/v1/oauth/scope-mappings` | GET | None | oauth-bridge.service |
| `/api/v1/oauth/.well-known/oauth-bridge` | GET | None | - |

### Issuer Domain (`/api/v1/issuer`)

| Path | Method | Middleware | Servis |
|------|--------|-----------|--------|
| `/did` | GET | - | issuer.agent |
| `/credentials/agent-identity` | POST | enforcePolicy, credentialIssuanceRL, validateBody | issuer.agent |
| `/credentials/delegation` | POST | enforcePolicy, credentialIssuanceRL, validateBody | issuer.agent |
| `/credentials/capability` | POST | enforcePolicy, credentialIssuanceRL, validateBody | issuer.agent |
| `/credentials/schema-issue` | POST | credentialIssuanceRL, validateBody | schemaRegistry, issuer.agent |
| `/credentials/batch` | POST | batchIssuanceRL, credentialIssuanceRL, validateBody | batchIssuance.service |
| `/credentials/batch/:jobId` | GET | - | batchIssuance.service |
| `/credentials/batch/:jobId/results` | GET | - | batchIssuance.service |
| `/token` | POST | - | issuer.agent |
| `/credential` | POST | - | issuer.agent |

### Verifier Domain (`/api/v1/verifier`)

| Path | Method | Middleware | Servis |
|------|--------|-----------|--------|
| `/did` | GET | - | verifier.agent |
| `/verify/agent-identity` | POST | enforcePolicy, verificationRL | verifier.agent |
| `/verify/delegation` | POST | enforcePolicy, verificationRL | verifier.agent |
| `/verify/combined` | POST | enforcePolicy, verificationRL | verifier.agent |
| `/verify/:sessionId/result` | GET | - | verifier.agent |

### OpenID4VCI Domain (`/api/v1/openid4vci`)

| Path | Method | Middleware | Servis |
|------|--------|-----------|--------|
| `/credential-offer` | POST | - | openid4vci.service |
| `/credential-offer/:offerId` | GET | - | openid4vci.service |
| `/credential-offers` | GET | - | openid4vci.service |
| `/token` | POST | authRL | openid4vci.service |
| `/credential` | POST | credentialIssuanceRL | openid4vci.service |
| `/batch-credential` | POST | - | openid4vci.service |
| `/deferred-credential` | POST | - | openid4vci.service |

### OpenID4VP Domain (`/api/v1/openid4vp`)

| Path | Method | Middleware | Servis |
|------|--------|-----------|--------|
| `/presentation-definitions` | GET | - | openid4vp.service |
| `/presentation-definitions/:id` | GET | - | openid4vp.service |
| `/authorization-request` | POST | verificationRL | openid4vp.service |
| `/sessions/:sessionId` | GET | - | openid4vp.service |
| `/sessions/:sessionId/result` | GET | - | openid4vp.service |
| `/sessions` | GET | - | openid4vp.service |
| `/client-metadata` | GET | - | openid4vp.service |
| `/did` | GET | - | verifier.agent |

### Holder Domain (`/api/v1/holder`)

| Path | Method | Middleware | Servis |
|------|--------|-----------|--------|
| `/did` | GET | - | holder.agent |
| `/credentials/receive` | POST | defaultRL, validateBody | holder.agent |
| `/credentials/present` | POST | defaultRL, validateBody | holder.agent |
| `/credentials` | GET | - | holder.agent |
| `/credentials/:credentialId` | DELETE | - | holder.agent |
| `/push-token` | POST | defaultRL, validateBody | push-notification.service |

### Revocation Domain (`/api/v1/revocation`)

| Path | Method | Middleware | Servis |
|------|--------|-----------|--------|
| `/agent` | POST | strictRL | agent.service, revocation.service |
| `/revoke` | POST | strictRL, validateBody | revocation.service |
| `/unrevoke` | POST | strictRL, validateBody | revocation.service |
| `/status/:credentialId` | GET | - | revocation.service |
| `/check` | POST | validateBody | revocation.service |
| `/list/:statusListId` | GET | - | revocation.service |
| `/stats` | GET | - | revocation.service |
| `/verify/:credentialId` | GET | - | revocation.service |
| `/status-list` | GET | - | revocation.service |

### Trust Registry Domain (`/api/v1/trust`)

| Path | Method | Middleware | Servis |
|------|--------|-----------|--------|
| `/entities` | POST | strictRL, requirePermission('trust:write'), validateBody | trustRegistry.service |
| `/entities` | GET | - | trustRegistry.service |
| `/entities/:did` | GET | - | trustRegistry.service |
| `/entities/:did` | PATCH | strictRL, requirePermission('trust:write'), validateBody | trustRegistry.service |
| `/entities/:did` | DELETE | strictRL, requirePermission('trust:write') | trustRegistry.service |
| `/verify/issuer` | POST | - | trustRegistry.service |
| `/check/:did` | GET | - | trustRegistry.service |
| `/policies` | POST | strictRL, requirePermission('trust:write'), validateBody | trustRegistry.service |
| `/policies/:policyId` | GET | - | trustRegistry.service |
| `/validate` | POST | validateBody | trustRegistry.service |
| `/stats` | GET | - | trustRegistry.service |
| `/export` | GET | requirePermission('trust:admin') | trustRegistry.service |

### Audit Domain (`/api/v1/audit`)

**All routes require `requirePermission('audit:read')`.**

| Path | Method | Middleware | Servis |
|------|--------|-----------|--------|
| `/logs` | GET | validateQuery | audit.service |
| `/logs/:id` | GET | - | audit.service |
| `/stats` | GET | - | audit.service |
| `/export` | GET | requirePermission('audit:export') | audit.service |
| `/events` | GET | - | - (static list) |

### DID Domain (`/api/v1/did`)

| Path | Method | Servis |
|------|--------|--------|
| `/resolve/:did` | GET | didResolver.service |
| `/dereference` | GET | didResolver.service |
| `/validate` | POST | didResolver.service |
| `/methods` | GET | didResolver.service |
| `/cache/stats` | GET | didResolver.service |
| `/cache/clear` | POST | didResolver.service |
| `/document/:did` | GET | didResolver.service |

### SD-JWT Domain (`/api/v1/sdjwt`)

| Path | Method | Servis |
|------|--------|--------|
| `/credential` | POST | sdjwt.service |
| `/issue` | POST | sdjwt.service (alias) |
| `/vc` | POST | sdjwt.service |
| `/presentation` | POST | sdjwt.service |
| `/verify` | POST | sdjwt.service |
| `/parse` | POST | sdjwt.service |
| `/info` | GET | - (static) |

### Agent Domain (`/api/v1/agents`)

| Path | Method | Middleware | Servis |
|------|--------|-----------|--------|
| `/register` | POST | validateBody | agent.service |
| `/:did` | GET | - | agent.service |
| `/:did` | PATCH | validateBody | agent.service |
| `/:did` | DELETE | - | agent.service |
| `/` | GET | - | agent.service |
| `/:did/activity` | GET | - | agent.service |
| `/:did/capabilities/revoke` | POST | - | agent.service |
| `/:did/trust/downgrade` | POST | - | agent.service |
| `/:did/emergency-stop` | POST | - | agent.service |

### Wallet Domain (`/api/v1/wallet`)

| Path | Method | Servis |
|------|--------|--------|
| `/:did` | GET | agent.service |
| `/:did/credentials/basic` | POST | agent.service |
| `/:did/credentials/rich` | POST | agent.service |
| `/:did/activity` | GET | agent.service |

### Delegation Domain (`/api/v1/delegations`)

| Path | Method | Middleware | Servis |
|------|--------|-----------|--------|
| `/` | POST | enforcePolicy, validateBody | delegation.service |
| `/:id` | GET | - | delegation.service |
| `/agent/:did` | GET | - | delegation.service |
| `/:id/revoke` | POST | validateBody | delegation.service |
| `/:id/verify` | POST | validateBody | delegation.service |
| `/:id/sub-delegate` | POST | enforcePolicy, validateBody | delegation.service |
| `/:id/chain` | GET | - | delegation.service |

### Agent Trust Domain (`/api/v1/agent-trust`)

| Path | Method | Servis |
|------|--------|--------|
| `/` | POST | DB direct (agent_trust_relationships) |
| `/:agentDid` | GET | DB direct |
| `/:agentDid/:trustedDid` | PATCH | DB direct |
| `/:agentDid/:trustedDid` | DELETE | DB direct |
| `/verify` | POST | DB direct |

### Schema Domain (`/api/v1/schemas`)

| Path | Method | Middleware | Servis |
|------|--------|-----------|--------|
| `/` | GET | - | schemaRegistry.service |
| `/:id` | GET | - | schemaRegistry.service |
| `/` | POST | credentialIssuanceRL, validateBody | schemaRegistry.service |
| `/:id` | PUT | credentialIssuanceRL, validateBody | schemaRegistry.service |
| `/:id` | DELETE | - | schemaRegistry.service |

### Webhook Domain (`/api/v1/webhooks`)

| Path | Method | Middleware | Servis |
|------|--------|-----------|--------|
| `/` | GET | - | webhook.service |
| `/:id` | GET | - | webhook.service |
| `/` | POST | strictRL | webhook.service |
| `/:id` | PUT | strictRL | webhook.service |
| `/:id` | DELETE | strictRL | webhook.service |
| `/:id/test` | POST | strictRL | webhook.service |
| `/:id/deliveries` | GET | - | webhook.service |

### Tenant Domain (`/api/v1/tenants`)

| Path | Method | Middleware | Servis |
|------|--------|-----------|--------|
| `/` | GET | requirePermission('tenants:read') | multiTenant.service |
| `/stats` | GET | requirePermission('tenants:read') | multiTenant.service |
| `/:id` | GET | Admin or own tenant | multiTenant.service |
| `/` | POST | enforcePolicy, requirePermission('tenants:write'), validateBody | multiTenant.service |
| `/:id` | PUT | requirePermission('tenants:write'), validateBody | multiTenant.service |
| `/:id/suspend` | POST | requirePermission('tenants:write') | multiTenant.service |
| `/:id/activate` | POST | requirePermission('tenants:write') | multiTenant.service |
| `/:id` | DELETE | enforcePolicy, requirePermission('tenants:write') | multiTenant.service |
| `/:id/usage` | GET | Admin or own tenant | multiTenant.service |

### Fabric Domain (`/api/v1/fabric`)

**Feature flag:** `module.hlf-anchoring`

| Path | Method | Servis |
|------|--------|--------|
| `/status` | GET | fabricAnchor.service |
| `/anchors` | GET | fabricAnchor.service |
| `/anchors/:referenceId` | GET | fabricAnchor.service |
| `/anchors/:referenceId/verify` | POST | fabricAnchor.service |

### DIDComm Domain (`/api/v1/didcomm`)

**Feature flag:** `module.didcomm`

| Path | Method | Servis |
|------|--------|--------|
| `/invitations` | POST | didcomm.service |
| `/invitations/receive` | POST | didcomm.service |
| `/connections` | GET | didcomm.service |
| `/connections/:id` | GET | didcomm.service |
| `/connections/:id/messages` | POST | didcomm.service |
| `/connections/:id/messages` | GET | didcomm.service |

### Policy Domain (`/api/v1/policies`)

**Feature flag:** `security.policy-engine`

| Path | Method | Middleware | Servis |
|------|--------|-----------|--------|
| `/` | GET | - | policy.service |
| `/:id` | GET | - | policy.service |
| `/` | POST | requirePermission('admin') | policy.service |
| `/:id` | PUT | requirePermission('admin') | policy.service |
| `/:id` | DELETE | requirePermission('admin') | policy.service |

### Backup Domain (`/api/v1/backup`)

| Path | Method | Servis |
|------|--------|--------|
| `/` | POST | backup.service |
| `/create` | POST | backup.service (alias) |
| `/` | GET | backup.service |
| `/list` | GET | backup.service (alias) |
| `/:backupId` | GET | backup.service |
| `/:backupId` | DELETE | backup.service |
| `/restore` | POST | backup.service |
| `/:backupId/verify` | POST | backup.service |

**Toplam: ~120+ endpoint**

---

## 4. Middleware Zinciri

Middleware uygulanma sirasi (`server.ts` createServer()):

```
1. compression              -- gzip/deflate (>1KB threshold, skip SSE)
2. helmet                   -- Security headers (CSP, X-Frame-Options, etc.)
3. cors                     -- CORS whitelist (env CORS_ALLOWED_ORIGINS)
4. bodyParser.json          -- 1MB limit
5. bodyParser.urlencoded    -- 1MB limit
6. requestIdMiddleware      -- X-Request-ID (generate or forward)
7. requestLoggerMiddleware  -- Structured logging, metrics, audit integration
--- Pre-auth routes mounted here (health, metrics, well-known, auth, simulation) ---
8. directPostRateLimiter    -- 60/min per IP (for /direct_post only)
9. oauthBridgeRoutes        -- Pre-auth OAuth bridge
10. defaultRateLimiter      -- 100/min per API key or IP (global for /api/v1)
11. authenticateAny()       -- 3-strategy auth chain: Keycloak JWT -> local JWT -> API key
12. optionalTenant()        -- Attach tenant if multi-tenant enabled + header present
--- Authenticated API routes mounted here ---
--- After Credo init: ---
13. errorMiddleware         -- RFC 7807 Problem Details error responses
14. notFoundMiddleware      -- 404 handler
```

### Middleware Dosyalari

| Middleware | Dosya | Satir | Aciklama |
|-----------|-------|-------|----------|
| error.middleware | `backend/src/api/middleware/error.middleware.ts` | 141L | requestId, error handler (RFC 7807), 404, asyncHandler wrapper |
| requestLogger.middleware | `backend/src/api/middleware/requestLogger.middleware.ts` | 274L | Structured logging with metrics/audit integration, slow request detection |
| auth.middleware | `backend/src/api/middleware/auth.middleware.ts` | 250L | JWT/API key/Keycloak auth, requirePermission, generateToken |
| validation.middleware | `backend/src/api/middleware/validation.middleware.ts` | 100L | Zod schema validation (body, query, params) |
| rateLimit.middleware | `backend/src/api/middleware/rateLimit.middleware.ts` | 83L | 7 rate limiter presets (default, strict, credential, verification, auth, batch, directPost) |
| tenant.middleware | `backend/src/api/middleware/tenant.middleware.ts` | 82L | optionalTenant(), requireTenant() -- feature-flag gated |
| policy.middleware | `backend/src/api/middleware/policy.middleware.ts` | 67L | enforcePolicy(action, resource) -- feature-flag gated |

### Rate Limiter Presets

| Limiter | Window | Max | Kullanim |
|---------|--------|-----|----------|
| defaultRateLimiter | 1 min | 100 | Global API |
| strictRateLimiter | 1 min | 20 | Trust, revocation, webhook mutations |
| credentialIssuanceRateLimiter | 1 min | 30 | Credential issuance |
| verificationRateLimiter | 1 min | 50 | VP verification |
| authRateLimiter | 15 min | 10 | Token/auth endpoints |
| batchIssuanceRateLimiter | 1 min | 10 | Batch jobs |
| directPostRateLimiter | 1 min | 60 | OpenID4VP direct_post |

---

## 5. Veritabani Semasi

**DBMS:** PostgreSQL 15+
**ORM:** Raw SQL via `pg` driver (no ORM)
**Migration sistemi:** Sequential versioned migrations in `backend/src/database/migrations.ts`

### Migration Tablosu (19 migration)

| Version | Tablo | Aciklama |
|---------|-------|----------|
| 1 | `migrations` | Migration tracking |
| 2 | `credential_offers` | OpenID4VCI credential offers (types, pre-auth code, expiry) |
| 3 | `access_tokens` | Token-to-offer mapping |
| 4 | `verification_sessions` | OpenID4VP sessions (PD, nonce, state, status) |
| 5 | `revocation_lists` | StatusList2021 bitstring revocation lists |
| 6 | `revoked_credentials` | Individual credential revocation records |
| 7 | `trusted_entities` | Trust registry (DID, type, trust level, credential types) |
| 8 | `trust_policies` | Trust policy rules (JSON rules, active flag) |
| 9 | `audit_logs` | Audit trail (event type, actor, resource, outcome, details) |
| 10 | `credentials` | Issued credentials (holder, issuer, type, JWT, status) |
| 11 | `agents` | AI agent registry (DID, name, type, status, trust level, owner) |
| 12 | `agent_wallets` | Agent key storage (keys JSONB) |
| 13 | `agent_credentials` | Agent-specific credentials |
| 14 | `delegations` | Delegation chain (delegator, delegatee, scope, depth, parent) |
| 15 | `agent_trust_relationships` | Bilateral agent trust (level, mutual, expiry) |
| 16 | `agent_activity_logs` | Agent action history |
| 17 | `client_credentials` | OAuth client credentials (bcrypt hashed secrets, permissions) |
| 18 | (alter) | Add `credential_id` to delegations + parent index |
| 19 | `fabric_anchor_records` | HLF anchor records (hash, tx_id, status, retry) |

### IStorageAdapter Collections (13 PostgreSQL-backed)

Managed via `createStorageAdapter<T>('collection')` pattern in `backend/src/core/storage/`:

| Collection | Aciklama |
|-----------|----------|
| `holder_credentials` | Holder stored credentials |
| `issuer_credential_offers` | Active credential offers |
| `issuer_issued_credentials` | Issued credential records |
| `partner_keys` | Partner API key mappings |
| `org_agent_counts` | Organization agent count tracking |
| `oidc_provider_configs` | OIDC provider configurations |
| `batch_jobs` | Batch issuance job state |
| `credential_schemas` | Custom credential schemas |
| `expiration_credentials` | Credentials tracked for expiration |
| `expiration_notifications` | Expiration notification records |
| `encryption_keys` | Wrapped data encryption keys |
| `agent_profiles` | Agent profile data |
| `webhooks` / `webhook_deliveries` | Webhook subscriptions and delivery history |

### Storage Backends

| Backend | Dosya | Satir | Aciklama |
|---------|-------|-------|----------|
| IStorageAdapter | `backend/src/core/storage/IStorageAdapter.ts` | 169L | Interface (get, save, delete, list, exists, query) |
| PostgresStorageAdapter | `backend/src/core/storage/PostgresStorageAdapter.ts` | 366L | PostgreSQL JSONB storage |
| InMemoryStorageAdapter | `backend/src/core/storage/InMemoryStorageAdapter.ts` | 236L | In-memory Map (fallback) |
| RedisStorageAdapter | `backend/src/core/storage/RedisStorageAdapter.ts` | 473L | Redis storage (optional cache layer) |

---

## 6. Frontend Uygulamalari

### Issuer/Verifier Dashboard (`frontend-issuer-verifier/`)

**Stack:** React + Vite + TypeScript
**Port:** 5174

**Sayfalar:**
- `Login.tsx` -- API key + Keycloak SSO login
- `IssuerDashboard.tsx` -- Issuer overview
- `IssueCredential.tsx` -- Standard credential issuance
- `IssueAdvanced.tsx` -- Schema-driven issuance wizard
- `BatchIssue.tsx` -- Batch issuance
- `SchemaManagement.tsx` -- Credential schema CRUD
- `VerifierDashboard.tsx` -- Verifier overview
- `VerifyRequest.tsx` -- Create verification request
- `VerifyResults.tsx` -- View verification results
- `Revocation.tsx` -- Credential revocation management
- `TrustManagement.tsx` -- Trust registry management
- `AuditLogs.tsx` -- Audit log viewer
- `OAuthBridge.tsx` -- OAuth 2.0 token exchange UI
- `WebhookManagement.tsx` -- Webhook subscription management
- `TenantManagement.tsx` -- Multi-tenant administration

**Servisler:**
- `api.ts` (655L) -- Shared API client with token refresh, request helper
- `keycloak.ts` (171L) -- Native PKCE flow (crypto.subtle, no keycloak-js)
- `auth.ts` (146L) -- Auth state management, token storage
- `storage.ts` (103L) -- sessionStorage abstraction

### Web Wallet (`web-wallet/`)

**Stack:** React + Vite + TypeScript
**Port:** 5173

**Sayfalar:**
- `Dashboard.tsx` -- Wallet overview
- `Credentials.tsx` -- Credential list, type-based routing (AgentIdentityCard, DelegationCard, CapabilityCard)
- `IssueCredential.tsx` -- Receive credential offer
- `VerifyCredential.tsx` -- Credential verification
- `PresentCredential.tsx` -- VP presentation (QR scan -> backend submit)
- `Delegations.tsx` -- Delegation management
- `TrustManagement.tsx` -- Trust relationships
- `AgentDashboard.tsx` -- Agent identity management
- `AgentControl.tsx` -- Agent controls
- `Simulation.tsx` -- Test simulation

**Servisler:**
- `agent.service.ts` (526L) -- Full agent lifecycle, credential management
- `sdjwt.service.ts` (288L) -- Client-side SD-JWT parsing (base64url decode, no backend)
- `vp.service.ts` (214L) -- Client-side VP flow (Ed25519 wallet key, DID:key, direct_post)
- `api.service.ts` (194L) -- Shared API client
- `wallet-key.service.ts` (189L) -- AES-GCM-256 encrypted key storage in sessionStorage
- `sdjwt-presentation.service.ts` (54L) -- SD-JWT selective disclosure for presentations

### Mobile Wallet (`mobile-wallet/`)

**Stack:** React Native + Expo (managed workflow)
**Reuse from web-wallet:** ~60% (types 100%, vp.service 100%, sdjwt*.service 100%, wallet-key 90%)

**Ekranlar (8):**
- `HomeScreen.tsx` -- Overview dashboard
- `CredentialsScreen.tsx` -- Credential list
- `ScanScreen.tsx` -- QR code scanner (expo-camera)
- `PresentCredentialScreen.tsx` -- VP presentation flow
- `DelegationsScreen.tsx` -- Delegation management
- `AgentScreen.tsx` -- Agent identity
- `TrustScreen.tsx` -- Trust relationships
- `SettingsScreen.tsx` -- App settings

**Componentler (5):**
- `AgentIdentityCard.tsx`, `DelegationCard.tsx`, `CapabilityCard.tsx` -- Credential type cards
- `SDJWTCredentialCard.tsx` -- SD-JWT credential display
- `BiometricGate.tsx` -- Biometric authentication wrapper
- `CreateDelegationModal.tsx` -- Delegation creation modal

**Servisler (8):**
- `agent.service.ts` -- Agent lifecycle
- `api.service.ts` -- API client
- `auth.service.ts` -- Authentication
- `secure-storage.service.ts` -- expo-secure-store (Keychain/Keystore)
- `sdjwt.service.ts` -- SD-JWT parsing
- `sdjwt-presentation.service.ts` -- SD-JWT presentation
- `vp.service.ts` -- VP flow
- `wallet-key.service.ts` -- Key management (SecureStore instead of sessionStorage)
- `notification.service.ts` -- Push notifications (expo-notifications)

**Navigation:** @react-navigation -- bottom tabs (Home, Credentials, Scan, Delegations, Settings) + stack (Present, Agent, Trust)

**Deep link schemes:** `openid4vp://`, `openid-credential-offer://`, `ssi-wallet://`

---

## 7. SDK

**Paket:** `@openid-credential/agent-sdk`
**Dosya:** `sdk/src/`
**Toplam:** ~900 satir

### Modullur

| Modul | Dosya | Satir | API Yuzeyi |
|-------|-------|-------|------------|
| AgentSDK (main) | `sdk/src/client.ts` | 66L | health(), setToken(), setTenantId() |
| HttpClient | `sdk/src/http.ts` | 98L | get(), post(), put(), delete(), setToken(), setTenantId() |
| IssuerClient | `sdk/src/modules/issuer.ts` | 75L | issueAgentIdentity(), issueDelegation(), issueCapability(), schemaIssue(), batchIssue(), getBatchStatus() |
| VerifierClient | `sdk/src/modules/verifier.ts` | 51L | createVerificationRequest(), getSessionResult(), listSessions() |
| HolderClient | `sdk/src/modules/holder.ts` | 36L | receiveCredential(), presentCredential(), listCredentials(), deleteCredential() |
| DelegationClient | `sdk/src/modules/delegation.ts` | 41L | create(), get(), revoke(), verify(), subDelegate(), getChain(), getAgentDelegations() |
| WebhookClient | `sdk/src/modules/webhook.ts` | 31L | list(), create(), update(), delete(), test(), deliveries() |
| DIDCommClient | `sdk/src/modules/didcomm.ts` | 36L | createInvitation(), receiveInvitation(), listConnections(), sendMessage(), getMessages() |
| OAuthBridgeClient | `sdk/src/modules/oauth.ts` | 16L | exchangeToken(), introspect() |
| AuditClient | `sdk/src/modules/audit.ts` | 25L | query(), getStats() |
| Types | `sdk/src/types.ts` | 211L | All TypeScript type definitions |

**Kullanim ornegi:**
```typescript
const sdk = new AgentSDK({ baseUrl: 'http://localhost:3000', apiKey: 'my-key' })
const offer = await sdk.issuer.issueAgentIdentity({ holderDid: 'did:key:z6Mk...', agentType: 'autonomous', ... })
```

---

## 8. Guvenlik Katmanlari

### Authentication Chain (3-strategy, fallback)

```
Request
  |
  v
1. Keycloak JWT?  --> isKeycloakConfigured() && isKeycloakToken(token)
   |                  --> validateKeycloakToken() (JWKS cache, role mapping)
   | fail
   v
2. Local JWT?     --> jwt.verify(token, JWT_SECRET)
   |                  --> decoded: { sub, role, permissions }
   | fail
   v
3. API Key?       --> X-API-Key header -> apiKeys Map lookup
   |                  --> permissions: ['*'] (wildcard)
   | fail
   v
401 Unauthorized
```

**Dosya:** `backend/src/api/middleware/auth.middleware.ts` (250L)

**Zorunlu env vars:** `JWT_SECRET`, `API_KEY` -- server basta yoksa hata ile durur.

### Policy Authorization Engine

**Feature flag:** `security.policy-engine` (default: false)
**Dosya:** `backend/src/services/policy.service.ts` (359L)

- Built-in RBAC policies: admin, issuer, verifier, holder
- Wildcard bypass for API key users (`permissions: ['*']`)
- `enforcePolicy(action, resource)` middleware
- 30s policy cache TTL
- Audit logging: `authorization.policy` events

### Rate Limiting

7 rate limiter presets (see Section 4). Key identity: API key > IP.

### SSRF Protection

- Private IP blocking on outbound HTTP (webhook delivery, DIDComm invitation receive, VP fetch)
- `validateUrl()` helper checks hostname against private IP ranges
- Dosya: `backend/src/services/webhookDelivery.service.ts`, `backend/src/utils/url-validation.ts`

### Encryption at Rest

**Pattern:** Envelope encryption
**Dosya:** `backend/src/services/encryption.service.ts` (370L)

- KEK (Key Encryption Key) from `ENCRYPTION_KEK` env var
- Data keys generated per-entity, wrapped with KEK before DB storage
- Boot sequence: `encryptionService.initialize()` unwraps data keys from DB
- Hybrid: DB persist + memory cache (encrypt/decrypt operations are sync)

### Client-Side Key Protection

- Web wallet: AES-GCM-256 encrypted private keys in sessionStorage
- Mobile wallet: expo-secure-store (iOS Keychain / Android Keystore)
- Biometric gate for sensitive operations

### CORS

- Production: `CORS_ALLOWED_ORIGINS` env var (comma-separated whitelist)
- Development: `http://localhost:3000`, `http://localhost:5173`, `http://localhost:5174`, `http://62.244.233.69:3000`, `http://62.244.233.69:5173`, `http://62.244.233.69:5174`
- No-origin requests allowed (mobile apps, curl, Postman)
- 24-hour preflight cache
- Public IP (62.244.233.69) configured for remote Postman/browser access

### Additional Security Measures

- Helmet security headers (CSP, X-Frame-Options, HSTS, etc.)
- Body size limit: 1MB
- Request ID tracking (X-Request-ID header forwarding)
- Client credentials bcrypt hashed in database
- sessionStorage (not localStorage) for frontend token storage
- No hardcoded secrets -- all via env vars
- RFC 7807 Problem Details for error responses

---

## 9. Altyapi

### Docker Compose Servisleri

**Development (`docker-compose.dev.yml`):**

| Servis | Image | Port | Aciklama |
|--------|-------|------|----------|
| postgres | postgres:15-alpine | 5432 | PostgreSQL (ssi_dev/ssi_dev_pass/ssi_dev) |
| backend | ./backend (custom) | 3000 | Node.js API server |
| web-wallet | ./web-wallet (custom) | 5173 | Holder wallet |
| keycloak | keycloak:25.0 | 8080 | SSO (shared PostgreSQL, keycloak schema) |
| issuer-verifier-dashboard | ./frontend-issuer-verifier (custom) | 5174 | Admin dashboard |

**Monitoring Stack (`backend/docker/docker-compose.monitoring.yml`):**

| Servis | Image | Port | Aciklama |
|--------|-------|------|----------|
| prometheus | prom/prometheus:v2.48.0 | 9090 | Metrics collection |
| grafana | grafana/grafana:10.2.2 | 3100 | Visualization (custom dashboard: `ai-agent-monitoring.json`) |
| alertmanager | prom/alertmanager:v0.26.0 | 9093 | Alert handling |

**HLF Stack (`backend/docker/hlf/docker-compose.hlf.yml`):**
- Orderer + 4 peers + CLI
- Separate network (ayrr compose, ~2GB RAM)
- Chaincode: `credential-anchor` (TypeScript, fabric-contract-api)

### Kubernetes Configs

**Dosya:** `backend/k8s/`

**Base resources (`backend/k8s/base/`):**

| Resource | Dosya | Aciklama |
|----------|-------|----------|
| Namespace | `namespace.yaml` | `ai-agent-identity` namespace |
| ConfigMap | `configmap.yaml` | Environment configuration |
| Secret | `secret.yaml` | JWT_SECRET, API_KEY, DB credentials |
| RBAC | `rbac.yaml` | ServiceAccount, Role, RoleBinding |
| PostgreSQL | `postgres.yaml` | StatefulSet + Service + PVC |
| Redis | `redis.yaml` | Deployment + Service |
| Issuer | `issuer.yaml` | Deployment + Service |
| Verifier | `verifier.yaml` | Deployment + Service |
| Holder | `holder.yaml` | Deployment + Service |
| API Gateway | `api-gateway.yaml` | Deployment + Service |
| Web Wallet | `web-wallet.yaml` | Deployment + Service |
| Issuer-Verifier UI | `issuer-verifier.yaml` | Deployment + Service |
| Ingress | `ingress.yaml` | Nginx Ingress Controller |

**Overlays:**
- `backend/k8s/overlays/development/kustomization.yaml`
- `backend/k8s/overlays/production/kustomization.yaml`

### CI/CD Pipeline

**Dosya:** `.github/workflows/`

| Workflow | Dosya | Aciklama |
|----------|-------|----------|
| CI | `ci.yml` | Lint, type-check, test |
| Docker | `docker.yml` | Docker image build + push |
| Staging Deploy | `deploy-staging.yml` | Staging deployment |
| Production Deploy | `deploy-production.yml` | Production deployment |

### Monitoring

**Prometheus:**
- Config: `backend/docker/prometheus/prometheus.yml`
- Alerts: `backend/docker/prometheus/alerts.yml`
- Backend metrics endpoint: `GET /metrics` (no-auth)
- Metrics service: `backend/src/services/metrics.service.ts` (359L) -- request count, latency histograms, error rates

**Grafana:**
- Dashboard: `backend/docker/grafana/dashboards/ai-agent-monitoring.json`
- Datasource: auto-provisioned Prometheus

**Alertmanager:**
- Config: `backend/docker/alertmanager/alertmanager.yml`

---

## Boot Sequence (backend/src/index.ts)

```
1. dotenv.config()
2. initializeFeatures()                    -- Feature flag parsing
3. initializeDatabase()                    -- PostgreSQL connection (optional)
4. runMigrations()                         -- Sequential migration apply
5. initializeCore({ storageType: 'auto' }) -- Storage adapter + EventBus + Plugins
6. encryptionService.initialize()          -- Unwrap data keys from DB
7. schemaRegistry.initialize()             -- Load/seed built-in schemas
8. initializePolicies()                    -- (if security.policy-engine enabled)
9. fabricAnchor.initialize()               -- (if module.hlf-anchoring enabled)
10. initKeycloak()                         -- (if KEYCLOAK_REALM_URL configured)
11. initializeIssuerAgent()                -- Parallel agent init
12. initializeVerifierAgent()
13. initializeHolderAgent()
14. createServer()                         -- Express app (middleware + routes)
15. initializeCredoService(app)            -- Credo-TS agent + OpenID4VC routes
16. finalizeServer(app)                    -- Error/404 handlers
17. server.listen(port)
18. wsService.initialize(server)           -- WebSocket
19. EventBus wiring                        -- credential.revoked/issued/unrevoked, delegation.created/revoked -> WS + Webhook + HLF + Push
20. expirationNotifier.start()             -- Background expiration checks
21. HLF retry job (60s interval)           -- (if module.hlf-anchoring enabled)
22. DIDComm event listeners                -- (if module.didcomm enabled)
23. Webhook delivery pruning (hourly)
24. system.startup event emit
```

### Graceful Shutdown

```
SIGINT/SIGTERM ->
  1. system.shutdown event emit
  2. wsService.close()
  3. expirationNotifier.stop()
  4. Clear intervals (delivery prune, HLF retry)
  5. server.close()
  6. Agent shutdown (issuer, verifier, holder)
  7. shutdownCredoService()
  8. shutdownCore()
  9. closeDatabase()
  10. process.exit(0)
```

---

## 10. Test Altyapisi

**Framework:** Jest + supertest
**Toplam:** 49 test suite, 1097 test — tamamı gecen (2026-03-13)

### Test Kategorileri

| Kategori | Suite | Dosya Yolu | Aciklama |
|----------|-------|-----------|----------|
| Unit (services) | 16 | `backend/tests/services/*.test.ts` | Servis bazli unit testler (mock DB, mock agents) |
| Unit (middleware) | 3 | `backend/tests/middleware/*.test.ts` | Auth, rate limit, error middleware |
| Unit (agents) | 3 | `backend/tests/agents/*.test.ts` | Issuer, verifier, holder agent logic |
| Unit (core) | 3 | `backend/tests/core/*.test.ts` | EventBus, storage adapter, feature flags |
| API routes | 5 | `backend/tests/api/*.test.ts` | Route-level integration (auth, issuer, verifier, holder, audit) |
| Integration | 3 | `backend/tests/integration/*.test.ts` | OpenID4VCI, OpenID4VP, DIDComm flow'lari |
| E2E | 3 | `backend/tests/e2e/*.test.ts` | Credential flow, audit flow, delegation flow |
| Interop | 1 | `backend/tests/interop/standards-compliance.test.ts` | W3C VC, OpenID4VCI/VP, SD-JWT, DID spec compliance |
| Security | 5 | `backend/tests/security/*.test.ts` | Auth bypass, injection, SSRF, tenant isolation, rate limit |
| Performance | 3 | `backend/tests/performance/*.test.ts` | k6 config, load scenarios |
| Util | 1 | `backend/tests/utils/*.test.ts` | URL validation, SSRF check |

### Test Ortami

- `backend/tests/setup.ts` -- Global setup: API_KEY=test-api-key-12345, JWT_SECRET, mock logger
- `backend/tests/helpers.ts` -- `apiKeyRequest()` helper (supertest + API key header)
- `backend/tests/security/security-helpers.ts` -- `createSecurityTestServer()`, `authedRequest()`
- Agent-bagimsiz testler: Agent initialize olmayan test env'de 500 kabul edilir (401/403 degilse)
- Credo ESM mock'lari: `backend/__mocks__/@credo-ts/*.js` stub dosyalari

### Bilinen Sinirlamalar

- Credo-TS agent test env'de initialize edilmez — agent-bagli endpoint'ler 500 doner (graceful)
- OpenID4VCI `exchangePreAuthorizedCode` storage key mismatch (offerId vs preAuthorizedCode) — bilinen bug, test dokumante eder
- `@credo-ts/*` ESM paketleri Jest CJS ile uyumsuz — `moduleNameMapper` ile mock'lanir

---

## Ozet Istatistikler

| Metrik | Deger |
|--------|-------|
| Backend servis dosyasi | 33 |
| Backend toplam satir (services + agents + core + db) | ~19,700 |
| Route dosyasi | 27 |
| Route toplam satir | ~9,700 |
| Middleware dosyasi | 8 |
| API endpoint (toplam) | ~120+ |
| PostgreSQL tablo | 19 (migration) + 13 (storage adapter) |
| Frontend sayfa (issuer/verifier) | 15 |
| Web wallet sayfa | 10 |
| Mobile wallet ekran | 8 |
| SDK modul | 8 + main client |
| Test suite | 49 (1097 test, tumu gecen) |
| Docker Compose servis | 5 (dev) + 3 (monitoring) + HLF |
| K8s resource | 14 base + 2 overlay |
| CI/CD workflow | 4 |
| Feature flag | ~10+ (didcomm, hlf-anchoring, policy-engine, multi-tenant, etc.) |

---

## 11. Deployment Durumu (2026-03-13)

### Docker (Aktif)

| Servis | Container | Port | Durum |
|--------|-----------|------|-------|
| PostgreSQL | ssi-postgres | 5432 | healthy |
| Backend | ssi-backend | 3000 | healthy |
| Web Wallet | ssi-web-wallet | 5173 | running |
| Issuer/Verifier | ssi-issuer-verifier | 5174 | running |
| Keycloak | ssi-keycloak | 8080 | healthy |

### Erisim

| Yontem | URL | Durum |
|--------|-----|-------|
| Localhost | `http://localhost:3000` | Calisiyor |
| Public IP | `http://62.244.233.69:3000` | Calisiyor |
| Web Wallet (public) | `http://62.244.233.69:5173` | Calisiyor |
| Dashboard (public) | `http://62.244.233.69:5174` | Calisiyor |
| Postman (API key) | Header: `x-api-key: dev-api-key-docker-only` | Calisiyor |

### Dogrulanan Endpoint'ler

- `GET /health` -- 200 (healthy)
- `GET /api/v1/issuer/did` -- 200 (did:key:z6Mk...)
- `GET /api/v1/schemas` -- 200 (3 schema)
- `POST /api/v1/verifier/verify/agent-identity` -- 200 (sessionId + requestUri)
- `POST /api/v1/issuer/credentials/agent-identity` -- 200 (credentialOfferUri with public IP)
- `GET /health` via 62.244.233.69 -- 200 (public IP erisimi dogrulandi)
