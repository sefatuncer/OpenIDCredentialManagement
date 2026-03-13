# OWASP Agentic AI Top 10 — Compliance Assessment

> Date: 2026-03-13
> Version: 1.0
> Reference: OWASP Agentic AI Top 10 (2026)
> Scope: AI Agent Identity System — credential-based delegation architecture

## Scoring

- **Compliance:** Full (100%), Substantial (70-99%), Partial (30-69%), Minimal (1-29%), None (0%)
- **Overall Target:** >= 90% per ASI item

---

## ASI01: Agent Goal Hijacking

**Threat:** An attacker manipulates an AI agent to pursue unauthorized goals, bypassing its intended purpose and constraints.

**Current Controls:**
- Delegation credentials bind agent to specific scope with `scope` field listing permitted actions
- Scope attenuation on sub-delegation prevents scope widening
- `valid_until` temporal constraints enforce time-bounded authority
- `constraints` field in DelegationCredentialSubject allows fine-grained restrictions (amount limits, service restrictions, time windows)
- CapabilityCredential limits `actions` to specific `resource` targets

**Gaps:**
- No runtime goal monitoring (agent behavior not tracked against declared purpose)
- No anomaly detection on agent actions relative to delegation scope

**Recommendations:**
- Add action logging per delegation to detect scope-exceeding behavior
- Implement velocity checks on delegated operations

**Compliance: Substantial (85%)**

---

## ASI02: Memory Poisoning

**Threat:** An attacker corrupts an agent's memory or context to influence its future decisions.

**Current Controls:**
- Stateless credential model: each VC is self-contained, cryptographically signed, independently verifiable
- No persistent agent memory/context stored in the system — credentials are immutable after issuance
- SD-JWT claims are cryptographically bound; selective disclosure doesn't modify underlying data
- Context isolation via tenant boundaries (optionalTenant/requireTenant middleware)

**Gaps:**
- Agent profile metadata stored in PostgreSQL could be modified if DB access is compromised (mitigated by envelope encryption)

**Recommendations:**
- Consider HLF hash anchoring for critical agent profile changes

**Compliance: Full (95%)**

---

## ASI03: Chained Planning Errors

**Threat:** Cascading failures in multi-step agent plans due to inadequate validation at each step.

**Current Controls:**
- Delegation chain with multi-layer validation: each delegation level verified independently
- Scope attenuation enforced at every sub-delegation level (parent scope intersection)
- Recursive CTE queries validate full chain integrity
- Cascade revocation propagates through entire chain when parent is revoked
- Schema validation (Zod) at every API endpoint; schemaRegistry.validateClaims() for credential issuance

**Gaps:**
- No maximum chain depth limit explicitly enforced (CTE recursion is bounded by database but not application-level)

**Recommendations:**
- Add explicit MAX_DELEGATION_DEPTH configuration (e.g., 10 levels)

**Compliance: Substantial (90%)**

---

## ASI04: Insecure Tool Usage

**Threat:** An agent uses tools or services in ways that exceed its authorization or introduce vulnerabilities.

**Current Controls:**
- CapabilityCredential constrains tool access: `capability_type`, `resource`, `actions` fields
- Tool permission lists enforced via `conditions` field in CapabilityCredentialSubject
- enforcePolicy middleware checks action + resource against agent role permissions
- Delegation scope explicitly lists permitted operations; unlisted operations rejected

**Gaps:**
- No runtime enforcement that agent only calls APIs matching its capability credentials (enforcement is at issuance/verification time, not runtime call-by-call)

**Recommendations:**
- Consider API gateway-level capability enforcement using VP-based auth tokens (OAuth bridge)

**Compliance: Substantial (80%)**

---

## ASI05: Human-Agent Trust Exploitation

**Threat:** An agent exploits the trust relationship with its human principal to perform unauthorized actions.

**Current Controls:**
- Explicit delegation approval flow: human creates DelegationCredential with specific scope
- Delegation revocable at any time; revocation propagates via StatusList2021 + webhook (30-60s)
- Audit trail: all delegation creation/revocation events logged and optionally HLF-anchored
- Web wallet and mobile wallet provide delegation management UI for human oversight
- Real-time WebSocket notifications on credential/delegation lifecycle events

**Gaps:**
- No periodic re-confirmation of long-lived delegations
- No notification when delegation is about to expire (expiration notifier exists but focuses on credentials)

**Recommendations:**
- Add delegation expiration notifications via expirationNotifier
- Consider periodic re-authorization for high-privilege delegations

**Compliance: Substantial (85%)**

---

## ASI06: Non-Compliance / Governance

**Threat:** Agent operations violate regulatory requirements or organizational governance policies.

**Current Controls:**
- Policy authorization engine with RBAC: built-in admin/issuer/verifier/holder roles
- enforcePolicy middleware on sensitive endpoints (credential issuance, delegation management, tenant operations)
- Comprehensive audit logging: EventBus events for all credential lifecycle + policy decisions
- Multi-tenant credential isolation with per-tenant data boundaries
- SD-JWT selective disclosure supports data minimization (eIDAS 2.0 / EUDI ARF compliance)
- W3C VC Data Model compliance; OpenID4VCI/VP spec adherence

**Gaps:**
- Policy engine disabled by default (feature flag); requires explicit opt-in
- No automated compliance reporting

**Recommendations:**
- Enable policy engine by default in production deployments
- Add compliance audit report generation endpoint

**Compliance: Substantial (80%)**

---

## ASI07: Privilege Escalation

**Threat:** An agent gains higher privileges than initially granted through delegation chain manipulation or credential exploitation.

**Current Controls:**
- Least privilege credentials: each credential type has specific, bounded claims
- Scope attenuation on sub-delegation: child scope ⊆ parent scope (enforced by `attenuateScope()`)
- Cascade revocation: revoking parent automatically revokes all children
- Trust level hierarchy: basic → standard → elevated → critical → maximum
- Cross-tenant access blocked by JSONB tenantId enrichment; requireTenant() enforcement
- Wildcard permission (*) only for pre-existing API key holders (backward compatibility)

**Gaps:**
- No dynamic privilege reduction (can't shrink active delegation without revocation + re-issue)

**Recommendations:**
- Consider delegation amendment mechanism for scope narrowing without full revocation

**Compliance: Substantial (90%)**

---

## ASI08: Supply Chain Attack

**Threat:** Compromised dependencies, MCP servers, or third-party components introduce vulnerabilities.

**Current Controls:**
- Dependency management via npm; package-lock.json for reproducible builds
- Optional heavy modules loaded via dynamic import with feature flags (HLF SDK, Credo-TS modules)
- Credo-TS pinned at v0.6.3; @openwallet-foundation packages pinned
- No untrusted MCP server connections; all integrations are direct service calls

**Gaps:**
- No automated dependency vulnerability scanning (npm audit not in CI/CD)
- No Software Bill of Materials (SBOM) generation
- No integrity verification of dynamic imports

**Recommendations:**
- Add `npm audit` to CI/CD pipeline
- Generate SBOM with each release
- Consider dependency pinning with integrity hashes

**Compliance: Partial (60%)**

---

## ASI09: Remote Code Execution

**Threat:** An attacker achieves code execution through agent-controlled input processing.

**Current Controls:**
- All user input validated with Zod schemas; no eval() or dynamic code execution
- JSON.parse() used with try/catch; no `new Function()` or `vm.runInContext()`
- DIDComm message content treated as data only; no script execution
- Credential claims are structured JSON; no template injection vectors
- HLF chaincode sandboxed in Docker container

**Gaps:**
- None identified — the system processes structured data (JSON, JWTs) only; no code execution paths

**Recommendations:**
- Maintain zero eval()/Function() policy in code reviews

**Compliance: Full (100%)**

---

## ASI10: Rogue Agents

**Threat:** Malicious or compromised agents operate within the system using valid credentials.

**Current Controls:**
- DID-based agent attribution: every action traceable to agent DID
- Real-time revocation: StatusList2021 + webhook (30-60s propagation)
- Revocation check on every VP verification (isCredentialRevoked + StatusList2021 double-check)
- Agent status tracking: active/suspended/revoked states
- Trust registry for issuer/verifier authorization
- HLF immutable anchoring for revocation/delegation events (tamper-evident log)
- EventBus + WebSocket for real-time monitoring of agent activities

**Gaps:**
- No behavioral anomaly detection (rate of operations, unusual access patterns)
- No agent quarantine mechanism (must fully revoke; no temporary suspension with auto-reinstatement)

**Recommendations:**
- Add agent activity rate monitoring
- Implement soft suspension with configurable auto-reinstatement window

**Compliance: Substantial (85%)**

---

## Summary

| ASI | Threat | Compliance | Score |
|-----|--------|------------|-------|
| ASI01 | Agent Goal Hijacking | Substantial | 85% |
| ASI02 | Memory Poisoning | Full | 95% |
| ASI03 | Chained Planning Errors | Substantial | 90% |
| ASI04 | Insecure Tool Usage | Substantial | 80% |
| ASI05 | Human-Agent Trust Exploitation | Substantial | 85% |
| ASI06 | Non-Compliance / Governance | Substantial | 80% |
| ASI07 | Privilege Escalation | Substantial | 90% |
| ASI08 | Supply Chain Attack | Partial | 60% |
| ASI09 | Remote Code Execution | Full | 100% |
| ASI10 | Rogue Agents | Substantial | 85% |
| **Overall** | | **Substantial** | **85%** |

### Key Strengths
1. Cryptographically-bound credentials eliminate most spoofing/tampering vectors
2. Delegation chain attenuation + cascade revocation provide strong privilege control
3. Multi-layer authentication (Keycloak + JWT + API key) with graceful degradation
4. Real-time revocation (StatusList2021 + webhook) enables rapid response to compromised agents

### Priority Remediation
1. **ASI08 (Supply Chain):** Add npm audit to CI/CD, generate SBOM — **effort: low, impact: high**
2. **ASI04 (Insecure Tool Usage):** Runtime capability enforcement via OAuth bridge — **effort: medium, impact: medium**
3. **ASI06 (Governance):** Enable policy engine by default in production — **effort: low, impact: medium**
