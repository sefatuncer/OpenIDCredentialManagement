---
title: "Policy-Based Authorization Engine — Fine-Grained Access Control"
date: 2026-03-12
module: backend
related_todos: [024]
---

## Goal

Add a built-in policy authorization engine that enforces fine-grained access control based on user roles, delegation scopes, and resource-level policies. Feature-flag gated with graceful degradation (falls back to existing permission-based auth when disabled).

## Research Findings

- **Existing auth chain:** Keycloak JWT → local JWT → API key (`auth.middleware.ts:138-213`)
- **Existing permissions:** `requirePermission()` checks `user.permissions[]` against wildcard or exact match
- **Delegation scope model:** `{ actions: string[], resources: string[], constraints?: Record<string, unknown> }` — already structured for policy evaluation
- **Audit logging:** `createAuditLog()` in `audit.service.ts` — reusable for policy decisions
- **Pattern:** Feature-flag gating + middleware pattern (same as `optionalTenant`, `requireHlf`, `requireDidComm`)
- **Decision:** Built-in engine (not OPA/Cerbos sidecar) — keeps system self-contained, avoids Docker dependency, YAML policies in DB via IStorageAdapter

## Implementation Steps

### Phase 1: Policy Engine Service (2 steps)

**Step 1: Add feature flag** → `backend/src/core/feature-flags.ts`
- Add `security.policy-engine` definition, `defaultValue: false`, `envVar: 'FEATURE_POLICY_ENGINE'`

**Step 2: Create policy service** → `backend/src/services/policy.service.ts` (~200L)
- Policy types: `ResourcePolicy`, `PolicyRule`, `PolicyDecision`
- Core function: `evaluatePolicy(principal, action, resource, context)` → `{ allowed: boolean, reason: string }`
- Built-in policies:
  - Role-based: `admin` → all, `issuer` → issuance routes, `verifier` → verification routes, `holder` → wallet routes
  - Delegation scope: if principal has delegation, check `actions` contains requested action, `resources` contains target resource
  - Constraint enforcement: `maxAmount`, `allowedServices`, `geographicRestrictions` from delegation
- Policy storage: IStorageAdapter (`authorization_policies` collection) for custom policies
- Built-in defaults seeded at init (overridable)

### Phase 2: Middleware + Route Integration (2 steps)

**Step 3: Create policy middleware** → `backend/src/api/middleware/policy.middleware.ts` (~80L)
- `enforcePolicy(action: string, resource: string)` — Express middleware factory
- Reads `req.user` (from auth middleware), delegation context, calls `evaluatePolicy()`
- Logs decision to audit (fire-and-forget)
- If feature disabled → pass-through (no enforcement)

**Step 4: Apply to sensitive routes** → multiple route files
- Issuer routes: `enforcePolicy('credential:issue', 'credentials')` on POST endpoints
- Verifier routes: `enforcePolicy('verification:create', 'verifications')` on POST endpoints
- Delegation routes: `enforcePolicy('delegation:create', 'delegations')` on POST, `enforcePolicy('delegation:revoke', 'delegations')` on DELETE
- Tenant routes: `enforcePolicy('tenant:manage', 'tenants')` — admin only

### Phase 3: API + Audit (2 steps)

**Step 5: Policy CRUD routes** → `backend/src/api/routes/policy.routes.ts` (~100L)
- `GET /api/v1/policies` — list all policies
- `GET /api/v1/policies/:id` — get policy detail
- `POST /api/v1/policies` — create custom policy (admin only)
- `PUT /api/v1/policies/:id` — update policy
- `DELETE /api/v1/policies/:id` — delete custom policy
- Feature-flag gated middleware

**Step 6: Mount routes + policy init** → `backend/src/api/server.ts` + `backend/src/index.ts`
- Mount `policyRoutes` at `/api/v1/policies`
- Initialize policy service in boot sequence (seed default policies)

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `backend/src/core/feature-flags.ts` | Modify | Add `security.policy-engine` flag |
| `backend/src/services/policy.service.ts` | Create | Policy engine — evaluate, CRUD, built-in defaults (~200L) |
| `backend/src/api/middleware/policy.middleware.ts` | Create | `enforcePolicy()` Express middleware (~80L) |
| `backend/src/api/routes/policy.routes.ts` | Create | 5 CRUD endpoints, feature-flag gated (~100L) |
| `backend/src/api/server.ts` | Modify | Import + mount policy routes |
| `backend/src/index.ts` | Modify | Initialize policy service at boot |
| `backend/src/api/routes/issuer.routes.ts` | Modify | Add `enforcePolicy` to issuance endpoints |
| `backend/src/api/routes/verifier.routes.ts` | Modify | Add `enforcePolicy` to verification endpoints |
| `backend/src/api/routes/delegation.routes.ts` | Modify | Add `enforcePolicy` to delegation endpoints |
| `backend/src/api/routes/tenant.routes.ts` | Modify | Add `enforcePolicy` to tenant management |

## Validation

```bash
# 1. TypeScript compile
cd backend && npx tsc --noEmit

# 2. Feature disabled — policies endpoint 404, routes pass-through
curl http://localhost:3000/api/v1/policies
# → 404 "Policy engine is not enabled"

# 3. Enable policy engine
export FEATURE_POLICY_ENGINE=true
# Restart server

# 4. List default policies
curl http://localhost:3000/api/v1/policies \
  -H "Authorization: Bearer $TOKEN"
# → { "policies": [...] }  (role-based defaults)

# 5. Test enforcement — holder trying issuer action
# (with holder-role token)
curl -X POST http://localhost:3000/api/v1/issuer/credentials \
  -H "Authorization: Bearer $HOLDER_TOKEN" \
  -d '...'
# → 403 "Policy denied: role 'holder' cannot perform 'credential:issue'"

# 6. Test delegation scope enforcement
# (with delegated token that has limited scope)
# → 403 or 200 depending on scope match
```

## Risks

1. **Performance overhead**: Policy evaluation on every request. Mitigation: In-memory policy cache (same pattern as webhook subscription cache — 30s TTL).
2. **Breaking existing API key auth**: API keys currently have `permissions: ['*']`. Mitigation: Wildcard permission bypasses policy evaluation (backward compat).
3. **Delegation context availability**: Policy middleware needs delegation data. Mitigation: Only enforce delegation-level policies when `req.user.delegationId` is present.
4. **Default policies too restrictive**: Could lock out existing users. Mitigation: Feature flag defaults to `false`; when enabled, default policies match current `requirePermission()` behavior exactly.
