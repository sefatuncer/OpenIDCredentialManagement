---
title: "Built-in Policy Authorization Engine"
tags: [authorization, policy, rbac, delegation-scope, fine-grained, middleware]
category: security
difficulty: medium
date: 2026-03-12
---

## Problem
Need fine-grained access control beyond simple API key + JWT authentication. Delegation scopes, role-based access, and resource-level policies required (OWASP ASI07 mitigation). External sidecar (OPA/Cerbos) adds operational complexity.

## Approach
Built-in policy engine with:
1. Policy rules stored in IStorageAdapter (same pattern as other services)
2. In-memory cache (30s TTL) for evaluation performance
3. Express middleware `enforcePolicy(action, resource)` — drops in front of existing handlers
4. Feature-flag gated — pass-through when disabled (backward compat)
5. Built-in default policies seeded at init (role-based: admin/issuer/verifier/holder)
6. Wildcard permission bypass (`permissions: ['*']`) for existing API keys

## Key Details

### Files
- `backend/src/core/feature-flags.ts` — `security.policy-engine` (default: false)
- `backend/src/services/policy.service.ts` — Engine: evaluate, CRUD, defaults, cache
- `backend/src/api/middleware/policy.middleware.ts` — `enforcePolicy()` middleware
- `backend/src/api/routes/policy.routes.ts` — 5 CRUD endpoints (admin only)
- Route files: issuer, verifier, delegation, tenant — `enforcePolicy()` on write endpoints

### Policy Evaluation Order
1. Wildcard permission bypass (API keys with `*`)
2. Priority-sorted rules (highest first)
3. Delegation scope fallback (if present on principal)
4. Default deny (when engine enabled and no rule matches)

### Middleware Usage
```typescript
// In route files:
router.post('/credentials/agent-identity',
  enforcePolicy('credential:issue', 'credentials'),  // ← policy check
  rateLimiter,
  validateBody(schema),
  asyncHandler(handler),
)
```

### Built-in Policies
- `admin-full-access` (priority 100): admin role → all actions, all resources
- `issuer-credential-ops` (priority 90): issuer → credential:issue, revoke, list
- `verifier-verification-ops` (priority 90): verifier → verification:create, read
- `holder-wallet-ops` (priority 90): holder → wallet ops, present, delegation:read
- `wildcard-permission-bypass` (priority 200): API keys with `*` → bypass

## Lessons Learned
1. **Audit type extension needed**: Adding new event types to `AuditEventType` and `AuditAction` unions is required when creating audit-producing services. Check type compatibility early.
2. **Wildcard bypass is critical**: Existing API keys have `permissions: ['*']` — breaking this would lock out all users. Built-in policy with highest priority handles this.
3. **Cache invalidation on CRUD**: Policy changes must invalidate the cache immediately, otherwise stale policies evaluated for up to TTL duration.

## Prevention
- When adding policy enforcement to routes, always test with feature flag both enabled and disabled.
- Never remove the wildcard bypass — it's the backward compat escape hatch.
