---
title: "Hyperledger Fabric Integration — Immutable Hash Anchoring"
date: 2026-03-12
module: backend
related_todos: [011]
---

## Goal

Integrate Hyperledger Fabric as an immutable hash anchor layer for revocation events and delegation chain records. On-chain data is minimal (SHA-256 hash + timestamp + event type) — credential content NEVER stored on-chain. Feature-flag gated with graceful degradation when HLF is unavailable.

## Research Findings

- **EventBus pattern** already handles async event delivery (index.ts:183-211) — HLF anchoring hooks into same pattern
- **Feature flags** system ready (`backend/src/core/feature-flags.ts`) — add `module.hlf-anchoring` with `defaultValue: false`
- **Revocation hook**: `revokeCredential()` at revocation.service.ts:247 emits `credential.revoked`
- **Delegation hooks**: `createDelegation()` emits `delegation.created` (delegation.service.ts:118), `revokeDelegation()` emits `delegation.revoked` (delegation.service.ts:300)
- **Boot sequence**: After `schemaRegistry.initialize()` (index.ts:82), before agents
- **Migration**: Next version is 19
- **Docker**: Current 5 services, HLF adds orderer + 2 peers + CA + CLI (5 new containers)
- **Risk mitigation**: Start with RevocationAnchor only (per todo 011 risk note), DelegationChain in same PR

## Implementation Steps

### Faz 1: Infrastructure (5 steps)

**Step 1: Add feature flag** → `backend/src/core/feature-flags.ts`
- Add `module.hlf-anchoring` definition, `defaultValue: false`, `envVar: 'FEATURE_HLF_ANCHORING'`

**Step 2: Database migration (v19)** → `backend/src/database/migrations.ts`
- Create `fabric_anchor_records` table:
  ```sql
  CREATE TABLE fabric_anchor_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    record_type VARCHAR(50) NOT NULL,        -- 'revocation' | 'delegation_created' | 'delegation_revoked'
    reference_id VARCHAR(255) NOT NULL,       -- credentialId or delegationId
    data_hash VARCHAR(64) NOT NULL,           -- SHA-256 hex
    fabric_tx_id VARCHAR(255),                -- HLF transaction ID (null until confirmed)
    fabric_block_number INTEGER,
    status VARCHAR(20) DEFAULT 'pending',     -- 'pending' | 'confirmed' | 'failed'
    retry_count INTEGER DEFAULT 0,
    payload JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    confirmed_at TIMESTAMP,
    error_message TEXT
  );
  CREATE INDEX idx_fabric_anchor_reference ON fabric_anchor_records(reference_id);
  CREATE INDEX idx_fabric_anchor_status ON fabric_anchor_records(status);
  ```

**Step 3: HLF chaincode** → `backend/chaincode/credential-anchor/`
- `index.ts` — Fabric contract entry point
- `credential-anchor.ts` — Smart contract with 3 functions:
  - `writeAnchor(recordType, referenceId, dataHash, timestamp)` — write anchor record
  - `readAnchor(referenceId)` — read anchor by reference
  - `verifyAnchor(referenceId, expectedHash)` — verify hash matches on-chain record
- Chaincode is TypeScript (fabric-contract-api), compiled to JS for deployment

**Step 4: Docker Compose HLF network** → `docker/hlf/`
- `docker-compose.hlf.yml` — standalone HLF network (orderer, 2 peers, CA, CLI)
- `configtx.yaml` — channel configuration (ssi-channel, 2 orgs)
- `crypto-config.yaml` — crypto material generation
- `scripts/setup-channel.sh` — create channel + join peers + deploy chaincode
- Not merged into `docker-compose.dev.yml` — runs separately (`docker compose -f docker/hlf/docker-compose.hlf.yml up`)

**Step 5: Fabric anchor service** → `backend/src/services/fabricAnchor.service.ts` (~200 lines)
- `initialize(config)` — connect to Fabric gateway, get network/contract
- `anchorRecord(type, referenceId, payload)` — compute SHA-256 hash, write to DB (pending) + submit to chaincode
- `verifyAnchor(referenceId)` — query chaincode, compare with DB record
- `retryPendingAnchors()` — background job: retry failed/pending records (max 3 retries)
- `getAnchorStatus(referenceId)` — return local DB status + HLF confirmation
- Graceful degradation: if HLF unavailable, log warning and return (never throw)

### Faz 2: Event Bus Wiring (3 steps)

**Step 6: Wire revocation anchor** → `backend/src/index.ts`
- In `credential.revoked` handler (line 183): add HLF anchor call
- Pattern: `fabricAnchor.anchorRecord('revocation', credentialId, { reason, statusListId }).catch(log)`
- Feature-flag gated: `isFeatureEnabled('module.hlf-anchoring')`

**Step 7: Wire delegation anchors** → `backend/src/index.ts`
- Add `delegation.created` EventBus handler → anchor delegation hash
- Add `delegation.revoked` EventBus handler → anchor revocation hash
- Same pattern: non-blocking `.catch(log)`

**Step 8: Boot sequence** → `backend/src/index.ts`
- After `schemaRegistry.initialize()` (line 82): conditionally initialize HLF
  ```typescript
  if (isFeatureEnabled('module.hlf-anchoring')) {
    const { initialize: initFabric } = await import('./services/fabricAnchor.service')
    await initFabric({ /* env vars */ })
    logger.info('Hyperledger Fabric anchor service initialized')
  }
  ```

### Faz 3: API & Verification (3 steps)

**Step 9: Anchor verification routes** → `backend/src/api/routes/fabric.routes.ts` (~80 lines)
- `GET /api/v1/fabric/anchors/:referenceId` — get anchor status for a credential/delegation
- `GET /api/v1/fabric/anchors` — list recent anchors (paginated)
- `POST /api/v1/fabric/anchors/:referenceId/verify` — verify on-chain hash matches
- Auth required, feature-flag gated

**Step 10: Mount routes** → `backend/src/api/server.ts`
- Import and mount `fabricRoutes` at `/api/v1/fabric`

**Step 11: Background retry job** → `backend/src/index.ts`
- `setInterval(() => fabricAnchor.retryPendingAnchors(), 60_000)` — retry failed anchors every 60s
- Only when HLF feature enabled

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `backend/src/core/feature-flags.ts` | Modify | Add `module.hlf-anchoring` flag |
| `backend/src/database/migrations.ts` | Modify | Add v19 `fabric_anchor_records` table |
| `backend/chaincode/credential-anchor/index.ts` | Create | Chaincode entry point |
| `backend/chaincode/credential-anchor/credential-anchor.ts` | Create | Smart contract (~120 lines) |
| `backend/chaincode/credential-anchor/package.json` | Create | Chaincode dependencies |
| `backend/chaincode/credential-anchor/tsconfig.json` | Create | Chaincode TS config |
| `docker/hlf/docker-compose.hlf.yml` | Create | HLF network (orderer, peers, CA) |
| `docker/hlf/configtx.yaml` | Create | Channel config |
| `docker/hlf/crypto-config.yaml` | Create | Crypto material config |
| `docker/hlf/scripts/setup-channel.sh` | Create | Network setup script |
| `backend/src/services/fabricAnchor.service.ts` | Create | Fabric gateway + anchor logic (~200L) |
| `backend/src/api/routes/fabric.routes.ts` | Create | Anchor verification API (~80L) |
| `backend/src/api/server.ts` | Modify | Mount fabric routes |
| `backend/src/index.ts` | Modify | Boot sequence + EventBus wiring |
| `backend/package.json` | Modify | Add `@hyperledger/fabric-gateway` dependency |

## Validation

```bash
# 1. TypeScript compile
cd backend && npx tsc --noEmit

# 2. Migration runs (feature disabled — table created but no HLF calls)
curl http://localhost:3000/health/detailed | jq '.features'
# → "module.hlf-anchoring": false

# 3. Enable HLF feature + start network
export FEATURE_HLF_ANCHORING=true
docker compose -f docker/hlf/docker-compose.hlf.yml up -d
cd docker/hlf && ./scripts/setup-channel.sh

# 4. Revoke a credential → verify anchor created
curl -X POST http://localhost:3000/api/v1/revocation/revoke \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"credentialId":"...","reason":"test"}'

# 5. Check anchor status
curl http://localhost:3000/api/v1/fabric/anchors/$CREDENTIAL_ID \
  -H "Authorization: Bearer $TOKEN"
# → { "status": "confirmed", "fabricTxId": "...", "dataHash": "..." }

# 6. Verify on-chain
curl -X POST http://localhost:3000/api/v1/fabric/anchors/$CREDENTIAL_ID/verify \
  -H "Authorization: Bearer $TOKEN"
# → { "verified": true, "onChainHash": "...", "localHash": "..." }

# 7. Graceful degradation — stop HLF, revoke again
docker compose -f docker/hlf/docker-compose.hlf.yml down
# Revoke still works, anchor status = "pending", retry job picks up later
```

## Risks

1. **HLF SDK compatibility with Node.js 20+**: `@hyperledger/fabric-gateway` v1.5+ supports Node 18+. Verify with `npx tsc --noEmit`.
2. **Docker resource usage**: HLF network adds ~5 containers (~2GB RAM). Keep separate from `docker-compose.dev.yml` to avoid dev overhead.
3. **Chaincode deployment complexity**: First-time HLF setup has steep learning curve. Mitigation: shell script automates channel creation + chaincode install.
4. **Crypto material management**: HLF requires X.509 certificates. Generated via `cryptogen` tool in setup script. Dev-only — production would use Fabric CA.
5. **Performance**: HLF anchor write takes 1-3s (consensus). Non-blocking design ensures main flow isn't affected.
