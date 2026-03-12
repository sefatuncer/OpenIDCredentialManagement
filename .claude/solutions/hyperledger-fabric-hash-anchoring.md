---
title: "Hyperledger Fabric Immutable Hash Anchoring"
tags: [hlf, fabric, blockchain, anchoring, revocation, delegation, hash, sha256, feature-flag, graceful-degradation]
category: architecture
difficulty: hard
date: 2026-03-12
---

## Problem

Credential revocation and delegation events need immutable audit trails beyond PostgreSQL. A permissioned blockchain (HLF) provides tamper-proof anchoring, but the integration must not affect core system availability or performance.

## Approach

**Minimal on-chain data**: Only SHA-256 hash + timestamp + event type stored on-chain. Credential content NEVER on ledger.

**Write-ahead to PostgreSQL**: Every anchor record is first persisted to `fabric_anchor_records` table with status `pending`. HLF confirmation is attempted non-blocking. If HLF unavailable, records stay pending and retry job picks them up.

**Event-driven anchoring**: EventBus handlers (`credential.revoked`, `delegation.created`, `delegation.revoked`) trigger non-blocking HLF anchor calls via dynamic import + `.catch(log)`.

**Feature-flag gated**: `module.hlf-anchoring` (default: false, env: `FEATURE_HLF_ANCHORING`). All HLF code paths check this flag — zero overhead when disabled.

**Optional SDK dependency**: `@hyperledger/fabric-gateway` and `@grpc/grpc-js` are dynamically imported. System compiles and runs without them installed.

## Key Details

### Files
- `backend/src/services/fabricAnchor.service.ts` — Core service (anchor, verify, retry, status)
- `backend/src/api/routes/fabric.routes.ts` — 4 API endpoints (status, list, get, verify)
- `backend/src/core/feature-flags.ts` — `module.hlf-anchoring` flag
- `backend/src/database/migrations.ts` — v19 `fabric_anchor_records` table
- `backend/chaincode/credential-anchor/` — TypeScript smart contract (fabric-contract-api)
- `backend/docker/hlf/` — Docker Compose, configtx, crypto-config, setup script

### Architecture Decisions
1. **Separate Docker Compose** — HLF network in `docker/hlf/docker-compose.hlf.yml`, not merged with dev compose (avoids ~2GB RAM overhead for non-HLF development)
2. **Dynamic import** with `@ts-ignore` for optional SDK — compiles without HLF packages installed
3. **Composite keys** on ledger: `Anchor~recordType~referenceId` + `Ref~referenceId~recordType` for dual-axis lookup
4. **Retry job**: 60s interval, max 3 retries, LIMIT 10 per batch — prevents thundering herd
5. **Hash computation**: `SHA-256(JSON.stringify({ recordType, referenceId, ...payload }))` — deterministic, computed once at anchor time

### EventBus Integration Pattern
```typescript
// In EventBus handler (non-blocking):
if (isFeatureEnabled('module.hlf-anchoring')) {
  import('./services/fabricAnchor.service').then(({ anchorRecord }) => {
    anchorRecord('revocation', credentialId, { reason, revokedAt })
      .catch(err => logger.error('HLF anchor failed', { error: err }))
  })
}
```

### API Endpoints
- `GET /api/v1/fabric/status` — HLF connection status
- `GET /api/v1/fabric/anchors` — List anchors (paginated)
- `GET /api/v1/fabric/anchors/:referenceId` — Anchor status for credential/delegation
- `POST /api/v1/fabric/anchors/:referenceId/verify` — Verify on-chain hash match

## Lessons Learned

1. **Optional SDK via dynamic import** avoids forcing all developers to install HLF packages. `@ts-ignore` is acceptable for optional peer dependencies — the alternative is creating empty declaration files.
2. **Feature-flag + dynamic import** is the cleanest pattern for heavy optional modules. Boot-time init is conditionally skipped, EventBus handlers check flag before import.
3. **Write-ahead PostgreSQL + async HLF** is the correct order. Never block the main flow on blockchain consensus (1-3s per write).
4. **Separate Docker Compose** was critical — HLF adds 5 containers and ~2GB RAM. Developers not working on blockchain features shouldn't pay this cost.

## Prevention

- When adding optional blockchain/ledger integrations, always:
  1. Feature-flag gate with default OFF
  2. Dynamic import the SDK (never static import)
  3. Write to local DB first, confirm on-chain async
  4. Separate infrastructure (Docker Compose) from core dev environment
  5. Background retry job for failed writes
