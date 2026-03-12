---
title: "Delegation Chain Attenuation — A→B→C Sub-delegation with Scope Narrowing"
tags: [delegation, chain, attenuation, scope, sub-delegation, cascade-revocation, vc-integration]
category: architecture
difficulty: hard
date: 2026-03-12
---

## Problem

Delegation service had DB fields for chain support (`chainDepth`, `maxDepth`, `parentDelegationId`) but no implementation — `createDelegation()` always set `chainDepth: 0`, no sub-delegation, no cascade revoke, no VC↔DB linkage. Five gaps identified:
1. No scope attenuation (child must be subset of parent)
2. VC issuance and DB records disconnected
3. No cascade revocation through chain
4. Capability VC not linked to agent profiles
5. Wallet showed generic cards for all credential types

## Approach

### 1. setDelegationIssuer() Callback Pattern
Avoids circular dependency between `delegation.service.ts` and `issuer.agent.ts`. Same pattern as `batchIssuance.setIssuer()` — service declares a function slot, agent wires it at boot.

```typescript
// delegation.service.ts
type IssueDelegationVCFn = (holderDid: string, subject: Record<string, unknown>, options?: { format?: string }) => Promise<{ credentialOfferId: string; credentialOfferUri: string }>
let _issueDelegationVC: IssueDelegationVCFn | null = null
export function setDelegationIssuer(fn: IssueDelegationVCFn): void { _issueDelegationVC = fn }

// issuer.agent.ts — at init time
setDelegationIssuer(async (holderDid, subject, options) => {
  return issueDelegationCredential(holderDid, subject as Partial<DelegationCredentialSubject>,
    options ? { format: options.format as 'jwt_vc_json' | 'vc+sd-jwt' } : undefined)
})
```

### 2. Scope Attenuation (validateScopeSubset)
Child actions/resources must be strict subset of parent. Wildcard `*` in parent permits anything in child. Prefix wildcards (`files/*`) use `startsWith()`.

### 3. Sub-delegation Constraints
- `chainDepth < maxDepth` (default max = 3)
- Sub-delegation expiry capped to parent's expiry
- Only parent's delegatee can sub-delegate
- Parent must be active (not revoked, not expired)

### 4. Cascade Revocation
Recursive: revoke parent → find children → revoke each with `cascade=true`. EventBus emits `delegation.revoked` per node.

### 5. Wallet Type-Specific Cards
Route by credential type string → `AgentIdentityCard`, `DelegationCard`, `CapabilityCard`. Handle both camelCase and snake_case field names (backend uses snake_case, some contexts use camelCase).

## Key Details

- `backend/src/services/delegation.service.ts` — createSubDelegation, getDelegationChain, cascade revoke, validateScopeSubset, setDelegationIssuer
- `backend/src/api/routes/delegation.routes.ts` — POST /:id/sub-delegate, GET /:id/chain
- `backend/src/api/schemas/validation.schemas.ts` — subDelegationSchema (Zod)
- `backend/src/agents/issuer.agent.ts` — wire-up at initializeIssuerAgent()
- `web-wallet/src/components/AgentIdentityCard.tsx` — trust level colors, capabilities tags
- `web-wallet/src/components/DelegationCard.tsx` — delegator→delegatee, scope, expiry, chain depth
- `web-wallet/src/components/CapabilityCard.tsx` — capability type, tool allow list, usage counter
- `web-wallet/src/components/DelegationChainView.tsx` — vertical chain modal with status colors

## Lessons Learned

1. **DB schema must match service code.** Adding `credential_id` to UPDATE queries without a migration causes runtime crashes. Always add migration BEFORE writing service code that references new columns.
2. **Header-based caller identity is spoofable.** `X-Delegator-Did` can be set by anyone. Use authenticated identity (JWT sub, API key mapping) for authorization-critical operations.
3. **EventBus event types and webhook subscription types must stay in sync.** Emitting `delegation.revoked` without adding it to `WEBHOOK_EVENT_TYPES` means subscribers can never receive it.
4. **Recursive tree operations need index support.** `parent_delegation_id` needs an index for chain queries and cascade revocation.
5. **Variable shadowing in React map callbacks is easy to miss.** Using `(s) =>` when outer scope has `const s = ...` compiles fine but confuses readers and linters.
6. **Use `WITH RECURSIVE` CTE for tree traversal.** The initial N+1 while-loop (1 SELECT per ancestor + duplicate target fetch) was replaced with a single recursive CTE that fetches ancestors + target + descendants in one query. Pattern: two CTEs (ancestors walking up via parent_id, descendants walking down), UNION ALL, ORDER BY depth.

## Prevention

- Before writing `UPDATE/INSERT` with new columns, check migration file has the column defined
- Grep for EventBus.emit patterns and verify matching subscription types in validation schemas
- For recursive DB queries, always check if the FK column has an index
- Use authenticated identity for authorization decisions, never trust client-provided headers for security-critical operations
