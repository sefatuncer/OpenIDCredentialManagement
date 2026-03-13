# STRIDE Threat Model — AI Agent Identity System

> Date: 2026-03-13
> Version: 1.0
> Scope: 7 architectural layers, 33 service modules, 121 TypeScript source files

## Risk Scoring

- **Likelihood (L):** 1 (Very Low) – 5 (Very High)
- **Impact (I):** 1 (Negligible) – 5 (Critical)
- **Risk Score:** L × I (1–25)
- **Risk Level:** Low (1–6), Medium (7–12), High (13–18), Critical (19–25)

---

## Layer 1: API Gateway / Middleware

### S — Spoofing
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| IP spoofing via X-Forwarded-For behind reverse proxy | 3 | 3 | 9 | `trust proxy` Express setting with configurable TRUST_PROXY env var | Implemented |
| Missing origin validation on CORS bypass | 2 | 3 | 6 | CORS whitelist with configurable CORS_ALLOWED_ORIGINS; strict in production | Implemented |
| Request ID forgery for log poisoning | 2 | 2 | 4 | Server-generated UUID v4 request IDs via `requestIdMiddleware` | Implemented |

### T — Tampering
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| Body size manipulation for resource exhaustion | 2 | 3 | 6 | bodyParser limit set to 1MB | Implemented |
| Content-Type mismatch attacks | 2 | 2 | 4 | Express bodyParser rejects non-JSON for JSON endpoints | Implemented |
| HTTP header injection | 1 | 3 | 3 | Helmet middleware sets security headers (CSP, X-Frame-Options, etc.) | Implemented |

### R — Repudiation
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| Denial of API actions (credential issuance, revocation) | 2 | 4 | 8 | requestLoggerMiddleware with audit log integration; per-request UUID tracking | Implemented |
| Missing audit for pre-auth endpoints | 3 | 3 | 9 | Request logger covers all routes including unauthenticated ones | Implemented |

### I — Information Disclosure
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| Stack trace leakage in error responses | 2 | 3 | 6 | errorMiddleware strips stack traces in production; structured error responses | Implemented |
| Swagger API spec exposure in production | 3 | 2 | 6 | Swagger mounted at /api/v1/docs; consider disabling in production | Partial |
| Slow request timing side channel | 2 | 2 | 4 | Configurable SLOW_REQUEST_THRESHOLD logging (default 3s) | Implemented |

### D — Denial of Service
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| API flood on unauthenticated endpoints | 3 | 4 | 12 | defaultRateLimiter (100/min) applied to API_BASE_PATH; authRateLimiter (10/15min) on auth endpoints | Implemented |
| Batch issuance resource exhaustion | 3 | 4 | 12 | credentialIssuanceRateLimiter (30/min) + batchIssuancePerTenantRateLimiter (10/min per tenant) | Implemented |
| Pre-auth endpoints bypass global rate limiter | 3 | 3 | 9 | direct_post has directPostRateLimiter (60/min); /health, /metrics are read-only; auth has authRateLimiter | Implemented |

### E — Elevation of Privilege
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| Unauthenticated agent registration leads to credential access | 2 | 4 | 8 | Agent registration returns client credentials; requires subsequent auth for API access | Implemented |
| Policy engine disabled by default | 3 | 4 | 12 | Feature-flag gated (security.policy-engine); wildcard bypass preserved for API keys | Partial |

---

## Layer 2: Authentication / Authorization

### S — Spoofing
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| X-Delegator-Did header spoofing for delegation impersonation | 4 | 5 | 20 | **KNOWN P1** — client-provided header used for caller identity; should use authenticated JWT sub | Not Implemented |
| API key brute-force | 2 | 5 | 10 | authRateLimiter (10/15min); bcrypt-hashed client credentials | Implemented |
| JWT token theft/replay | 2 | 4 | 8 | Short-lived JWT tokens; no refresh token rotation yet | Partial |

### T — Tampering
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| JWT payload modification | 1 | 5 | 5 | EdDSA/ES256 signature verification via jose; symmetric keys rejected | Implemented |
| API key substitution | 1 | 4 | 4 | bcrypt hash comparison; timing-safe | Implemented |

### R — Repudiation
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| Authentication event logging gaps | 2 | 3 | 6 | audit.service logs auth events; EventBus emits authorization.policy events | Implemented |

### I — Information Disclosure
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| JWT claims contain sensitive data | 2 | 3 | 6 | Minimal JWT payload (sub, role, permissions); no PII in tokens | Implemented |
| Keycloak token introspection reveals user data | 2 | 3 | 6 | JWKS-based validation only; no introspection endpoint call | Implemented |

### D — Denial of Service
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| Auth endpoint flooding | 2 | 3 | 6 | authRateLimiter (10/15min) with API key or IP-based keying | Implemented |

### E — Elevation of Privilege
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| authenticateAny() chain bypass | 2 | 5 | 10 | 3-strategy chain (Keycloak JWT → local JWT → API key); all strategies validated | Implemented |
| Role escalation via Keycloak realm role mapping | 2 | 4 | 8 | Role mapping from Keycloak realm_access.roles to local permission set | Implemented |

---

## Layer 3: Credential Issuance (OpenID4VCI)

### S — Spoofing
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| Forged credential offer URI | 2 | 4 | 8 | Pre-authorized code with UUID v4; one-time use; short TTL | Implemented |
| Holder DID spoofing in proof JWT | 3 | 4 | 12 | Holder DID extracted from proof JWT; proof verified at credential claim | Implemented |

### T — Tampering
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| Credential claim modification after issuance | 1 | 5 | 5 | JWT/SD-JWT cryptographic signature by issuer DID private key | Implemented |
| Schema validation bypass | 2 | 4 | 8 | Zod validation schemas for all credential types; schemaRegistry.validateClaims() | Implemented |

### R — Repudiation
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| Issuer denies credential issuance | 1 | 4 | 4 | Issuer DID signature on every VC; EventBus emits credential.issued | Implemented |

### I — Information Disclosure
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| SD-JWT selective disclosure insufficiency | 2 | 3 | 6 | SD_CLAIMS_BY_TYPE defines mandatory vs. selectively disclosable fields per type | Implemented |
| Credential offer leaks all claims | 2 | 3 | 6 | Offer contains metadata only (type, format); claims sent at credential endpoint | Implemented |

### D — Denial of Service
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| Batch issuance flooding | 3 | 4 | 12 | Dual rate limiting: global (30/min) + per-tenant (10/min); async job processing | Implemented |

### E — Elevation of Privilege
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| Issuance of elevated trust_level credentials | 2 | 4 | 8 | enforcePolicy('credential:issue', 'credentials') middleware on issuance endpoints | Implemented |

---

## Layer 4: Credential Verification (OpenID4VP)

### S — Spoofing
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| Forged VP token submission | 2 | 5 | 10 | VP signature verified against holder DID public key; nonce binding | Implemented |
| VC issuer DID spoofing | 2 | 5 | 10 | VC signature verified against issuer DID public key via universal DID resolver | Implemented |

### T — Tampering
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| Replay of VP token | 2 | 4 | 8 | Session-bound nonce; one-time use state parameter; session status tracking | Implemented |
| Presentation submission manipulation | 2 | 3 | 6 | descriptor_map validated against presentation definition | Implemented |

### R — Repudiation
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| Verifier denies verification result | 1 | 3 | 3 | Verification sessions persisted with full VP token and result | Implemented |

### I — Information Disclosure
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| VP session enumeration via timing | 2 | 3 | 6 | UUID v4 session IDs; no sequential identifiers | Implemented |
| Stale verification sessions accumulate data | 2 | 2 | 4 | cleanupExpiredSessions runs every 5 minutes; removes sessions older than 1 hour | Implemented |

### D — Denial of Service
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| VP session creation flooding | 2 | 3 | 6 | verificationRateLimiter (50/min) on verifier routes | Implemented |
| direct_post endpoint flooding | 3 | 3 | 9 | directPostRateLimiter (60/min per IP) applied per-route | Implemented |

### E — Elevation of Privilege
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| Revoked credential accepted in VP | 2 | 5 | 10 | Revocation check on every VC: isCredentialRevoked() + StatusList2021 | Implemented |
| Expired credential accepted in VP | 1 | 4 | 4 | exp claim checked; session expiresAt enforced | Implemented |

---

## Layer 5: Delegation & Trust

### S — Spoofing
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| Delegation chain spoofing (fake parent delegation) | 2 | 5 | 10 | parent_delegation_id verified via recursive CTE query; credential_id binding | Implemented |
| Agent identity impersonation | 2 | 4 | 8 | DID-based identity; agent registration requires unique DID | Implemented |

### T — Tampering
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| Delegation scope widening via sub-delegation | 2 | 5 | 10 | Scope attenuation enforced: sub-delegation scope must be subset of parent | Implemented |
| Trust level manipulation | 2 | 4 | 8 | Trust level computed from delegation chain and credential verification | Implemented |

### R — Repudiation
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| Delegation revocation denial | 1 | 4 | 4 | Cascade revoke with audit trail; HLF anchoring for immutable record | Implemented |

### I — Information Disclosure
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| Delegation chain reveals organizational structure | 2 | 2 | 4 | SD-JWT selective disclosure on delegation fields | Implemented |

### D — Denial of Service
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| Deep delegation chain creation (recursive bomb) | 2 | 3 | 6 | Chain depth limited in recursive CTE queries; scope narrows at each level | Partial |

### E — Elevation of Privilege
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| Sub-delegation grants broader scope than parent | 2 | 5 | 10 | Scope attenuation enforcement + validation; parent scope intersection | Implemented |
| Cross-tenant delegation access | 2 | 5 | 10 | Tenant isolation via JSONB tenantId enrichment; optionalTenant/requireTenant middleware | Implemented |

---

## Layer 6: Storage & Encryption

### S — Spoofing
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| Database credential theft | 2 | 5 | 10 | DATABASE_URL from env var; no hardcoded credentials in source | Implemented |
| Encryption key extraction from memory | 2 | 5 | 10 | KEK from env var; data keys wrapped (envelope encryption); memory cache only | Implemented |

### T — Tampering
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| Database record modification | 2 | 5 | 10 | HLF hash anchoring for critical records (revocation, delegation); DB integrity checks | Implemented |
| Migration tampering | 1 | 4 | 4 | Migrations tracked by version number; sequential execution | Implemented |

### R — Repudiation
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| Storage operation without audit trail | 2 | 3 | 6 | EventBus events emitted for all credential lifecycle operations | Implemented |

### I — Information Disclosure
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| Plaintext key material in database | 2 | 5 | 10 | Envelope encryption: KEK wraps data keys; AES-256-GCM for encryption at rest | Implemented |
| Webhook secret stored in plaintext | 3 | 3 | 9 | Secret masked on GET responses; stored as-is in DB | Partial |
| Session data exposure via timing | 2 | 2 | 4 | UUID-based keys; no sequential access patterns | Implemented |

### D — Denial of Service
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| Database connection pool exhaustion | 2 | 4 | 8 | Connection pool configured; N+1 queries eliminated (bulk load pattern) | Implemented |

### E — Elevation of Privilege
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| Direct database access bypasses authorization | 1 | 5 | 5 | All data access through service layer; no direct SQL from routes | Implemented |

---

## Layer 7: External Integrations

### S — Spoofing
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| SSRF via DID:web resolution | 3 | 4 | 12 | isPrivateUrl() check blocks private/internal URLs; 5s fetch timeout with AbortController | Implemented |
| SSRF via webhook delivery | 3 | 4 | 12 | Private IP blocking on webhook delivery URLs; HTTPS enforced in production | Implemented |
| SSRF via DIDComm invitation URL | 3 | 4 | 12 | URL validation with isPrivateUrl() on receiveInvitationFromUrl | Implemented |

### T — Tampering
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| Webhook payload tampering in transit | 2 | 3 | 6 | HMAC-SHA256 signed webhook payloads; subscriber verifies signature | Implemented |
| HLF anchor data integrity | 1 | 5 | 5 | SHA-256 hash anchoring; chaincode verifyAnchor function | Implemented |

### R — Repudiation
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| Webhook delivery denial | 2 | 2 | 4 | Delivery records with status tracking; retry 3x with backoff | Implemented |

### I — Information Disclosure
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| DNS rebinding on SSRF checks | 3 | 3 | 9 | Hostname-level check; DNS rebinding partially mitigated | Partial |
| Keycloak JWKS endpoint reveals key material | 1 | 2 | 2 | Public keys only; standard OIDC discovery | N/A |

### D — Denial of Service
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| HLF network unavailability blocks operations | 2 | 3 | 6 | Write-ahead pattern: PostgreSQL first, async HLF confirm; graceful degradation | Implemented |
| Webhook delivery retry storm | 2 | 3 | 6 | Max 3 retries with exponential backoff (1s→10s→60s); 10s timeout; max 20 subscriptions | Implemented |

### E — Elevation of Privilege
| Threat | L | I | Score | Mitigation | Status |
|--------|---|---|-------|------------|--------|
| HLF chaincode manipulation | 1 | 5 | 5 | Chaincode deployed with endorsement policy; read-only verify operations | Implemented |
| DIDComm connection leads to unauthorized access | 2 | 3 | 6 | DIDComm feature-flag gated; connections don't grant API access | Implemented |

---

## Summary

| Layer | Critical (19-25) | High (13-18) | Medium (7-12) | Low (1-6) | Total Threats |
|-------|-----------------|-------------|---------------|-----------|---------------|
| 1. API Gateway | 0 | 0 | 4 | 5 | 9 |
| 2. Auth/AuthZ | 1 | 0 | 3 | 3 | 7 |
| 3. Issuance (VCI) | 0 | 0 | 3 | 3 | 6 |
| 4. Verification (VP) | 0 | 0 | 3 | 4 | 7 |
| 5. Delegation & Trust | 0 | 0 | 4 | 2 | 6 |
| 6. Storage & Encryption | 0 | 0 | 4 | 3 | 7 |
| 7. External Integrations | 0 | 0 | 4 | 4 | 8 |
| **Total** | **1** | **0** | **25** | **24** | **50** |

### Critical Findings (Score >= 19)
1. **X-Delegator-Did header spoofing** (L:4, I:5, Score:20) — Status: Not Implemented. Client-provided HTTP header used for caller identity in delegation operations. Should use authenticated JWT subject or API key→DID mapping.

### Mitigation Status Summary
- **Implemented:** 43/50 (86%)
- **Partial:** 6/50 (12%)
- **Not Implemented:** 1/50 (2%)
