# Threat Matrix — Cross-Reference Summary

> Date: 2026-03-13
> Version: 1.0

## Threat × Component × Mitigation × Status

| # | Threat | Component | STRIDE | OWASP ASI | Risk Score | Mitigation | Status |
|---|--------|-----------|--------|-----------|------------|------------|--------|
| 1 | X-Delegator-Did header spoofing | Auth Middleware | S | ASI05 | **20 (C)** | Use authenticated JWT sub instead of client header | Not Impl |
| 2 | Batch issuance resource exhaustion | Issuer Routes | D | ASI06 | 12 (M) | Dual rate limit: global 30/min + per-tenant 10/min | Implemented |
| 3 | Policy engine disabled by default | Policy Middleware | E | ASI06 | 12 (M) | Feature flag `security.policy-engine`; wildcard bypass | Partial |
| 4 | SSRF via DID:web resolution | DID Resolver | S | ASI04 | 12 (M) | isPrivateUrl() + 5s AbortController timeout | Implemented |
| 5 | SSRF via webhook delivery | Webhook Service | S | ASI04 | 12 (M) | Private IP blocking + HTTPS enforcement | Implemented |
| 6 | SSRF via DIDComm invitation URL | DIDComm Service | S | ASI04 | 12 (M) | URL validation with isPrivateUrl() | Implemented |
| 7 | Holder DID spoofing in proof JWT | Issuer Agent | S | ASI10 | 12 (M) | Proof JWT signature verification | Implemented |
| 8 | VP token forgery | VP Service | S | ASI10 | 10 (M) | VP sig verified against holder DID public key + nonce | Implemented |
| 9 | VC issuer DID spoofing | VP Service | S | ASI10 | 10 (M) | VC sig verified against issuer DID + revocation check | Implemented |
| 10 | API key brute-force | Auth Middleware | S | ASI07 | 10 (M) | authRateLimiter 10/15min + bcrypt hash | Implemented |
| 11 | authenticateAny() chain bypass | Auth Middleware | E | ASI07 | 10 (M) | 3-strategy validation chain | Implemented |
| 12 | Delegation chain spoofing | Delegation Service | S | ASI03 | 10 (M) | Recursive CTE verification + credential binding | Implemented |
| 13 | Scope widening via sub-delegation | Delegation Service | T | ASI07 | 10 (M) | Scope attenuation enforcement (subset check) | Implemented |
| 14 | Cross-tenant delegation access | Tenant Middleware | E | ASI07 | 10 (M) | JSONB tenantId enrichment + middleware | Implemented |
| 15 | DB credential theft | Storage Layer | S | ASI08 | 10 (M) | Env var credentials + envelope encryption | Implemented |
| 16 | KEK extraction from memory | Encryption Service | S | ASI09 | 10 (M) | KEK from env var; wrapped data keys | Implemented |
| 17 | DB record modification | Storage Layer | T | ASI03 | 10 (M) | HLF hash anchoring for critical records | Implemented |
| 18 | Revoked credential accepted in VP | VP Service | E | ASI10 | 10 (M) | Double revocation check (local + StatusList2021) | Implemented |
| 19 | Pre-auth endpoints bypass rate limiter | Server.ts | D | ASI06 | 9 (M) | Endpoints before rate limiter; per-route limiters needed | Partial |
| 20 | Webhook secret plaintext storage | Webhook Service | I | ASI08 | 9 (M) | Masked on GET; stored as-is in DB | Partial |
| 21 | DNS rebinding on SSRF checks | URL Validation | I | ASI04 | 9 (M) | Hostname-level check only | Partial |
| 22 | Missing audit for pre-auth endpoints | Request Logger | R | ASI06 | 9 (M) | Logger covers all routes | Implemented |
| 23 | No npm audit in CI/CD | Build Pipeline | — | ASI08 | — | Not configured | Not Impl |
| 24 | No SBOM generation | Build Pipeline | — | ASI08 | — | Not configured | Not Impl |

## Risk Heat Map

```
           Low (1-6)    Medium (7-12)   High (13-18)   Critical (19-25)
          ┌────────────┬───────────────┬──────────────┬────────────────┐
Layer 1   │ █████      │ ████          │              │                │
Layer 2   │ ███        │ ███           │              │ █              │
Layer 3   │ ███        │ ███           │              │                │
Layer 4   │ ████       │ ███           │              │                │
Layer 5   │ ██         │ ████          │              │                │
Layer 6   │ ███        │ ████          │              │                │
Layer 7   │ ████       │ ████          │              │                │
          └────────────┴───────────────┴──────────────┴────────────────┘
```

## Priority Remediation Backlog

### P0 — Critical (Must Fix)
| # | Finding | Effort | Owner |
|---|---------|--------|-------|
| 1 | X-Delegator-Did header spoofing → use authenticated JWT sub | Medium | Backend |

### P1 — High Priority
| # | Finding | Effort | Owner |
|---|---------|--------|-------|
| 23 | Add npm audit to CI/CD pipeline | Low | DevOps |
| 24 | Generate SBOM with releases | Low | DevOps |
| 3 | Enable policy engine by default in production | Low | Backend |

### P2 — Medium Priority
| # | Finding | Effort | Owner |
|---|---------|--------|-------|
| 19 | Add per-route rate limiter on pre-auth endpoints (direct_post, /credentials/request) | Low | Backend |
| 20 | Hash/encrypt webhook secrets before DB storage | Low | Backend |
| 21 | Implement DNS resolution check (resolve then validate IP) for SSRF | Medium | Backend |

### P3 — Low Priority / Enhancement
| # | Finding | Effort | Owner |
|---|---------|--------|-------|
| — | Add explicit MAX_DELEGATION_DEPTH config | Low | Backend |
| — | Delegation expiration notifications | Low | Backend |
| — | Agent activity rate monitoring / anomaly detection | High | Backend |
| — | Swagger UI disable in production | Low | Backend |

## Mitigation Coverage

| Category | Implemented | Partial | Not Implemented | Total |
|----------|-------------|---------|-----------------|-------|
| STRIDE (50 threats) | 41 (82%) | 8 (16%) | 1 (2%) | 50 |
| OWASP ASI (10 items) | 2 (20%) | 7 (70%) | 1 (10%) | 10 |

**OWASP Agentic AI Top 10 Overall Compliance: 85%**
**Target: >= 90% — Gap: 5% (ASI08 Supply Chain is primary gap)**
