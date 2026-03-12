---
title: "AI Agent Credential Schemas — 3-Type Integration (Agent ID, Delegation, Capability)"
date: 2026-03-12
module: all
related_todos: [029]
---

## Goal

Mevcut ayrık parçaları (schema registry, VC issuance, delegation service, capability discovery) birleştirerek AI ajanlar için uçtan uca çalışan 3-tiered credential sistemi oluşturmak. Delegation chain attenuation (kapsam daraltma) ve VC↔DB entegrasyonu eklemek.

## Research Findings

### Mevcut Durum — Zaten Çalışan Parçalar
- **Schema Registry:** 3 built-in schema mevcut (`AIAgentIdentityCredential`, `DelegationCredential`, `CapabilityCredential`) — `schemaRegistry.service.ts`
- **SD_CLAIMS_BY_TYPE:** 3 tip için SD claim tanımları — `openid4vci.service.ts:26-30`
- **Issuance Functions:** `issueAgentIdentityCredential()`, `issueDelegationCredential()`, `issueCapabilityCredential()` — `issuer.agent.ts`
- **Schema-Driven Wizard:** IssueAdvanced.tsx — schema seçimi → claim form → SD options → preview/issue
- **Delegation Service:** DB-level CRUD + verify — `delegation.service.ts`
- **Capability Discovery:** Agent profile management — `capabilityDiscovery.service.ts`

### Tespit Edilen Boşluklar (Plan'ın Odağı)

**Boşluk 1 — Delegation Chain Attenuation:**
`delegation.service.ts` has `chainDepth`, `maxDepth`, `parentDelegationId` fields but `createDelegation()` always sets `chainDepth: 0`, `parentDelegationId: null`. No sub-delegation function exists. A→B→C attenuation (scope narrowing) is not implemented.

**Boşluk 2 — VC ↔ DB Entegrasyonu:**
Delegation service ve VC issuance birbirinden habersiz:
- `delegation.service.ts` creates DB records (scope, chain, revocation)
- `issuer.agent.ts` issues VCs (JWT/SD-JWT)
- Creating a delegation doesn't issue a VC; issuing a delegation VC doesn't create a DB record.

**Boşluk 3 — Revocation Bağlantısı:**
`revokeDelegation()` DB'yi günceller ama:
- StatusList2021'de VC revoke edilmez
- EventBus'a event emit edilmez (webhook tetiklenmez)
- Cascade revocation yok (A→B revoke → B→C de revoke edilmeli)

**Boşluk 4 — Capability VC ↔ Agent Profile:**
CapabilityCredential issuance ile `capabilityDiscovery.service.ts` bağlantılı değil. Capability VC issue edildiğinde agent profile güncellenmeli.

**Boşluk 5 — Wallet Type-Specific Display:**
Web wallet generic card gösteriyor. Agent ID, Delegation, Capability için farklı görünüm yok — delegation chain, scope, constraints, expiry gibi önemli bilgiler görünmüyor.

### Related Solutions
- `.claude/solutions/schema-driven-issuance-wizard.md` — type-to-function routing pattern
- `.claude/solutions/sdjwt-vc-format-migration.md` — `_sdjwt` suffix, SD_CLAIMS_BY_TYPE
- `.claude/solutions/client-side-vp-flow.md` — wallet credential storage pattern

## Implementation Steps

### Step 1: Enrich Credential Schemas → `backend/src/services/schemaRegistry.service.ts`
- **Agent ID VC:** Add `registrationTimestamp`, `securityDomain`, `delegationChainPosition` fields
- **Delegation VC:** Add `maxAmount`, `allowedServices`, `geographicRestrictions`, `ttlPolicy` (min/max/recommended TTL), `parentDelegationId`, `attenuationLevel` fields
- **Capability VC:** Add `toolAllowList`, `maxUsageCount`, `usageResetPeriod`, `requiredContext` fields
- Update `issuanceConfig.selectiveDisclosure` arrays accordingly

### Step 2: Update SD_CLAIMS_BY_TYPE → `backend/src/services/openid4vci.service.ts`
- Add new SD-eligible claims for enriched schemas
- Delegation: `maxAmount`, `allowedServices`, `geographicRestrictions` → SD
- Capability: `toolAllowList`, `maxUsageCount` → SD
- Agent ID: `securityDomain`, `registrationTimestamp` → SD

### Step 3: Update Zod Validation Schemas → `backend/src/api/schemas/validation.schemas.ts`
- Extend `agentIdentityCredentialSchema`, `delegationCredentialSchema`, `capabilityCredentialSchema` with new fields
- Add `subDelegationSchema` for chain delegation requests

### Step 4: Delegation Chain Attenuation → `backend/src/services/delegation.service.ts`
- Add `createSubDelegation(parentDelegationId, delegateeDid, narrowedScope)` function:
  - Verify parent delegation is valid and not revoked
  - Verify `chainDepth < maxDepth`
  - Verify narrowed scope is subset of parent scope (attenuation rule)
  - Set `chainDepth = parent.chainDepth + 1`, `parentDelegationId = parent.id`
- Add `cascadeRevoke(delegationId)` — revoke delegation + all children in chain
- Add `getDelegationChain(delegationId)` — return full chain from root to leaf

### Step 5: VC ↔ Delegation Integration → `backend/src/services/delegation.service.ts` + `backend/src/agents/issuer.agent.ts`
- In `createDelegation()`: After DB insert, call `issuer.issueDelegationCredential()` to issue VC
  - Return both `delegationId` (DB) and `credentialOfferId` (VC)
- In `revokeDelegation()`: Also revoke the corresponding VC via `revocation.service.ts`
  - Emit `credential.revoked` event via EventBus (triggers webhook)
- In `createSubDelegation()`: Issue sub-delegation VC with parent reference
- Wire-up: `delegation.service.ts` needs reference to issuer agent (same pattern as `batchIssuance.setIssuer()`)

### Step 6: VC ↔ Capability Integration → `backend/src/services/capabilityDiscovery.service.ts`
- After `issueCapabilityCredential()`: auto-update agent profile with new capabilities
- Add `issueAndRegisterCapability(holderDid, capabilities)` convenience method
- On VC revocation: remove capabilities from agent profile

### Step 7: Delegation Routes Enhancement → `backend/src/api/routes/delegation.routes.ts`
- `POST /delegations/:id/sub-delegate` — Create sub-delegation (chain)
- `GET /delegations/:id/chain` — Get full delegation chain
- `POST /delegations/:id/revoke` — Enhanced: cascade revoke + VC revoke + webhook

### Step 8: Wallet Credential Type Cards → `web-wallet/src/pages/Credentials.tsx` + new components
- Create `AgentIdentityCard` component — shows agent name, type, capabilities list, trust level badge
- Create `DelegationCard` component — shows delegator→delegatee, scope (actions/resources), constraints, expiry countdown, chain depth indicator
- Create `CapabilityCard` component — shows capability type, resource, actions, usage counter, tool allow list
- Update `Credentials.tsx` to detect credential type and render appropriate card

### Step 9: Delegation Chain Visualization → `web-wallet/src/components/DelegationChainView.tsx`
- Simple vertical chain diagram: A → B → C with scope narrowing indicators
- Show each node's DID (truncated), scope summary, status (active/revoked/expired)
- Linked from DelegationCard detail view

### Step 10: Wallet API Integration → `web-wallet/src/services/api.service.ts`
- Add delegation chain fetch: `GET /delegations/:id/chain`
- Add delegation verify call for wallet-held delegation credentials

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `backend/src/services/schemaRegistry.service.ts` | Modify | Enrich 3 built-in schemas with AI-specific fields |
| `backend/src/services/openid4vci.service.ts` | Modify | Update SD_CLAIMS_BY_TYPE for new fields |
| `backend/src/api/schemas/validation.schemas.ts` | Modify | Extend Zod schemas + add subDelegationSchema |
| `backend/src/services/delegation.service.ts` | Modify | Add sub-delegation, cascade revoke, chain query, VC integration |
| `backend/src/agents/issuer.agent.ts` | Modify | Wire delegation VC issuance into delegation service |
| `backend/src/services/capabilityDiscovery.service.ts` | Modify | Auto-update profile on capability VC issuance |
| `backend/src/api/routes/delegation.routes.ts` | Modify | Add sub-delegate, chain, enhanced revoke endpoints |
| `backend/src/index.ts` | Modify | Wire delegation.service ↔ issuer agent (setIssuer pattern) |
| `web-wallet/src/components/AgentIdentityCard.tsx` | Create | Type-specific Agent ID credential card |
| `web-wallet/src/components/DelegationCard.tsx` | Create | Type-specific Delegation credential card with chain info |
| `web-wallet/src/components/CapabilityCard.tsx` | Create | Type-specific Capability credential card |
| `web-wallet/src/components/DelegationChainView.tsx` | Create | Chain visualization (A→B→C) |
| `web-wallet/src/pages/Credentials.tsx` | Modify | Route to type-specific cards by credential type |
| `web-wallet/src/services/api.service.ts` | Modify | Add delegation chain API call |

## Validation

```bash
# TypeScript compile check (all 3 modules)
cd backend && npx tsc --noEmit
cd web-wallet && npx tsc --noEmit
cd frontend-issuer-verifier && npx tsc --noEmit

# API functional test
# 1. Create delegation (should also issue VC)
curl -X POST http://localhost:3000/api/v1/delegations -H "X-API-Key: $API_KEY" \
  -d '{"delegateeToDid":"did:key:z6Mk...", "scope":{"actions":["read","write"],"resources":["files/*"]}, "duration":"P30D", "revocable":true}'

# 2. Sub-delegate with narrowed scope
curl -X POST http://localhost:3000/api/v1/delegations/{id}/sub-delegate -H "X-API-Key: $API_KEY" \
  -d '{"delegateeDid":"did:key:z6Mk...", "scope":{"actions":["read"],"resources":["files/public/*"]}}'

# 3. Get chain
curl http://localhost:3000/api/v1/delegations/{id}/chain -H "X-API-Key: $API_KEY"

# 4. Cascade revoke (should revoke VC + trigger webhook + revoke children)
curl -X POST http://localhost:3000/api/v1/delegations/{id}/revoke -H "X-API-Key: $API_KEY" \
  -d '{"reason":"Security concern","cascade":true}'
```

## Risks

1. **Delegation ↔ VC circular dependency:** delegation.service needs issuer.agent, issuer needs openid4vci.service. Mitigate with `setIssuer()` callback pattern (same as batchIssuance).
2. **Cascade revocation performance:** Deep chain (depth 3) with multiple children could be slow. Mitigate: limit maxDepth to 3, use bulk revocation.
3. **Schema migration:** Enriching built-in schemas won't affect existing credentials (additive fields only), but existing DB schema records need update. Mitigate: seed pattern already handles "exists? skip" — need `forceUpdate` flag for schema enrichment.
4. **Wallet component complexity:** 4 new components could bloat web-wallet. Mitigate: keep each under 150 lines, share common utilities.
