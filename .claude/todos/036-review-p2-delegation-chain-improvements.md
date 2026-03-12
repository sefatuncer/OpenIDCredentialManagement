---
id: 036
title: "Delegation chain review P2 findings"
priority: high
status: done
module: backend
created: 2026-03-12
source: review-029
---

## Findings

### N+1 in getDelegationChain()
Ancestor walk issues one SELECT per depth level. getDelegationById called twice for the target. Fix: recursive CTE or cache initial fetch.

### Cascade revocation audit trail
Child delegations are revoked with child's delegatorDid — original revoker identity lost in recursion. Fix: pass original revoker through, or add cascade_initiated_by field.

### delegation.revoked event not in WEBHOOK_EVENT_TYPES
eventBus emits 'delegation.revoked' but webhook subscribers can't register for it. Fix: add delegation events to WEBHOOK_EVENT_TYPES.

### Missing index on parent_delegation_id
getDelegationChain and cascade revoke query by parent_delegation_id — no index. Fix: add index.

### Variable shadowing in DelegationCard.tsx
scope.map((s) => ...) shadows outer const s = credential.subject. Fix: rename parameter.
