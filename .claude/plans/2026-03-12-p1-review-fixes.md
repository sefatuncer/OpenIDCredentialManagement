---
title: "P1 Review Fixes — credential_id migration + sub-delegation auth"
date: 2026-03-12
module: backend
related_todos: [034, 035, 036]
---

## Goal

Fix the 2 P1 findings that block deploy, plus address the most impactful P2 findings (missing index, webhook event types, variable shadowing).

## Research Findings

- **Migration system:** 17 versioned migrations in `backend/src/database/migrations.ts`. Last is v17 (`client_credentials`). Need v18.
- **Auth model:** `authenticateAny()` global middleware on all `/api/v1/*` routes. Caller is authenticated (JWT or API key). However, the existing `POST /delegations` also takes `delegatorDid` from the request body — same trust model. Moving `X-Delegator-Did` from header to body maintains consistency with the existing create endpoint pattern.
- **Parent delegatee check:** `delegation.service.ts:149` validates `parent.delegateeDid !== delegatorDid` — the service layer enforces that only the parent's delegatee can sub-delegate, regardless of how the DID is passed.
- **WEBHOOK_EVENT_TYPES:** Defined in `validation.schemas.ts:202-207`, controls what subscribers can register for.
- **DelegationCard variable shadowing:** `scope.map((s) => ...)` at line 89 shadows outer `const s` at line 18.

## Implementation Steps

### Step 1: Add migration v18 → `backend/src/database/migrations.ts`
- `ALTER TABLE delegations ADD COLUMN IF NOT EXISTS credential_id VARCHAR(255);`
- `CREATE INDEX IF NOT EXISTS idx_delegations_parent ON delegations(parent_delegation_id);`
- Resolves: Todo 034 (P1) + P3 missing index

### Step 2: Move delegatorDid from header to body → `backend/src/api/routes/delegation.routes.ts`
- Add `delegatorDid` to `subDelegationSchema` in `validation.schemas.ts`
- Replace `req.headers['x-delegator-did']` with `req.body.delegatorDid` (Zod-validated)
- Consistent with existing `POST /delegations` which takes `delegatorDid` from body
- Resolves: Todo 035 (P1)

### Step 3: Add delegation events to WEBHOOK_EVENT_TYPES → `backend/src/api/schemas/validation.schemas.ts`
- Add `'delegation.created'`, `'delegation.revoked'` to the enum
- Resolves: Todo 036 P2 (webhook event types)

### Step 4: Fix variable shadowing → `web-wallet/src/components/DelegationCard.tsx`
- Rename `(s)` to `(scopeItem)` in scope.map callback at line 89
- Resolves: Todo 036 P2 (TypeScript)

### Step 5: Add delegation.created EventBus emit → `backend/src/services/delegation.service.ts`
- Emit `delegation.created` in `createDelegation()` and `createSubDelegation()`
- Matches the new webhook event type

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `backend/src/database/migrations.ts` | Modify | Add v18 migration (credential_id + parent index) |
| `backend/src/api/routes/delegation.routes.ts` | Modify | Move delegatorDid from header to body |
| `backend/src/api/schemas/validation.schemas.ts` | Modify | Add delegatorDid to subDelegationSchema + delegation webhook events |
| `web-wallet/src/components/DelegationCard.tsx` | Modify | Fix variable shadowing |
| `backend/src/services/delegation.service.ts` | Modify | Emit delegation.created events |

## Validation

```bash
# 1. TypeScript compile
cd backend && npx tsc --noEmit
cd web-wallet && npx tsc --noEmit

# 2. Verify migration runs (if DB available)
# The migration will auto-run on backend startup

# 3. Verify sub-delegation body validation
curl -X POST http://localhost:3000/api/v1/delegations/{id}/sub-delegate \
  -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"delegatorDid":"did:key:z6Mk...","delegateeDid":"did:key:z6Mk...","scope":{"actions":["read"],"resources":["files/*"]}}'
# Should work (delegatorDid in body, validated by Zod)

# Without delegatorDid → 400 validation error
curl -X POST http://localhost:3000/api/v1/delegations/{id}/sub-delegate \
  -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" \
  -d '{"delegateeDid":"did:key:z6Mk...","scope":{"actions":["read"],"resources":["files/*"]}}'
```

## Risks

1. **Migration on existing DB:** `ADD COLUMN IF NOT EXISTS` is safe — no-op if column already exists.
2. **API breaking change:** `X-Delegator-Did` header → body parameter. This endpoint was just created and not yet deployed, so no backward compat concern.
