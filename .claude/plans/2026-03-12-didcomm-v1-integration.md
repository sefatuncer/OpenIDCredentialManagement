---
title: "DIDComm v1 Integration — Agent-to-Agent Messaging"
date: 2026-03-12
module: backend
related_todos: [013]
---

## Goal

Enable DIDComm v1 agent-to-agent messaging using Credo-TS's `@credo-ts/didcomm` module — connections, basic messages, credential issuance, and proof presentation over DIDComm. Feature-flag gated with graceful degradation.

## Research Findings

- **`@credo-ts/didcomm` v0.6.3 already installed** — just not loaded in agent modules
- **Modules available:** `DidCommModule` auto-registers `connections`, `oob`, `discovery`, `credentials`, `proofs`, `basicMessages`, `messagePickup`, `mediator`, `mediationRecipient`
- **Transports:** `DidCommHttpInboundTransport` from `@credo-ts/node` accepts existing Express `app` instance + custom path
- **Outbound:** `DidCommHttpOutboundTransport`, `DidCommWsOutboundTransport` from `@credo-ts/didcomm`
- **did:peer resolution** already supported in `didResolver.service.ts:329-453` (numalgo 0 + 2)
- **Pattern:** Same as OpenID4VC module — Credo auto-registers routes on Express, feature-flag gates
- **Boot sequence:** Insert DIDComm module in `credo.agent.ts` module list, transport setup at init time

## Implementation Steps

### Phase 1: Credo DIDComm Module Activation (3 steps)

**Step 1: Add feature flag** → `backend/src/core/feature-flags.ts`
- Add `module.didcomm` definition, `defaultValue: false`, `envVar: 'FEATURE_DIDCOMM'`

**Step 2: Activate DIDComm module in Credo agent** → `backend/src/agents/credo.agent.ts`
- Import `DidCommModule` from `@credo-ts/didcomm`
- Import `DidCommHttpInboundTransport` from `@credo-ts/node`
- Import `DidCommHttpOutboundTransport` from `@credo-ts/didcomm`
- Add `didComm` module to agent modules (conditional on feature flag):
  ```typescript
  didComm: new DidCommModule({
    endpoints: [`${config.issuerBaseUrl}/didcomm`],
    inboundTransports: [new DidCommHttpInboundTransport({ app: credoApp, path: '/didcomm', port: 3000 })],
    outboundTransports: [new DidCommHttpOutboundTransport()],
  }),
  ```
- DIDComm module auto-registers connections, basic-messages, credentials, proofs, oob sub-modules

**Step 3: Export DIDComm API wrappers** → `backend/src/agents/credo.agent.ts`
- Add functions for DIDComm operations (using Credo agent API):
  - `createDidCommInvitation()` — create OOB invitation with did:peer
  - `receiveDidCommInvitation(invitationUrl)` — accept invitation, establish connection
  - `getDidCommConnections()` — list connections
  - `sendBasicMessage(connectionId, message)` — send text message
  - `getBasicMessages(connectionId)` — retrieve message history

### Phase 2: DIDComm API Routes (2 steps)

**Step 4: Create DIDComm routes** → `backend/src/api/routes/didcomm.routes.ts` (~120 lines)
- Feature-flag gated middleware (same pattern as `fabric.routes.ts`)
- Endpoints:
  - `POST /api/v1/didcomm/invitations` — create OOB invitation
  - `POST /api/v1/didcomm/invitations/receive` — receive/accept invitation
  - `GET /api/v1/didcomm/connections` — list connections
  - `GET /api/v1/didcomm/connections/:id` — connection detail
  - `POST /api/v1/didcomm/connections/:id/messages` — send basic message
  - `GET /api/v1/didcomm/connections/:id/messages` — get message history

**Step 5: Mount routes + Credo service wrapper** → `backend/src/api/server.ts` + `backend/src/services/credo.service.ts`
- Mount `didcommRoutes` at `/api/v1/didcomm`
- Add DIDComm wrapper exports to `credo.service.ts`

### Phase 3: Event Integration (2 steps)

**Step 6: DIDComm event wiring** → `backend/src/index.ts`
- Listen for Credo DIDComm events:
  - `DidCommConnectionStateChanged` → `eventBus.emit('didcomm.connection.established')`
  - `DidCommBasicMessageStateChanged` → `eventBus.emit('didcomm.message.received')`
- Wire to WebSocket for real-time frontend notifications

**Step 7: DIDComm status in health endpoint** → `backend/src/agents/credo.agent.ts`
- Add `isDidCommEnabled()` export
- Include DIDComm status in `/health/detailed` response

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `backend/src/core/feature-flags.ts` | Modify | Add `module.didcomm` flag |
| `backend/src/agents/credo.agent.ts` | Modify | Add DidCommModule + API wrappers |
| `backend/src/services/credo.service.ts` | Modify | Export DIDComm wrapper functions |
| `backend/src/api/routes/didcomm.routes.ts` | Create | 6 DIDComm API endpoints (~120L) |
| `backend/src/api/server.ts` | Modify | Mount didcomm routes |
| `backend/src/index.ts` | Modify | DIDComm event wiring |

## Validation

```bash
# 1. TypeScript compile
cd backend && npx tsc --noEmit

# 2. Feature disabled — DIDComm endpoints return 404
curl http://localhost:3000/api/v1/didcomm/connections
# → 404 "DIDComm is not enabled"

# 3. Enable DIDComm
export FEATURE_DIDCOMM=true
# Restart server

# 4. Create invitation
curl -X POST http://localhost:3000/api/v1/didcomm/invitations \
  -H "Authorization: Bearer $TOKEN"
# → { "invitationUrl": "https://...", "outOfBandId": "..." }

# 5. Receive invitation (from another agent or same agent for testing)
curl -X POST http://localhost:3000/api/v1/didcomm/invitations/receive \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"invitationUrl":"https://..."}'
# → { "connectionId": "...", "state": "request-sent" }

# 6. List connections
curl http://localhost:3000/api/v1/didcomm/connections \
  -H "Authorization: Bearer $TOKEN"
# → { "connections": [...] }

# 7. Send message
curl -X POST http://localhost:3000/api/v1/didcomm/connections/$CONN_ID/messages \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"content":"Hello from agent A"}'
```

## Risks

1. **Credo DIDComm ESM/CJS conflict**: Same as OpenID4VC module — may need `@ts-ignore` or preloader. Mitigation: Use same `register-askar.js` preload pattern.
2. **DIDComm module initialization order**: Must come before `finalizeServer()`. Mitigation: Add in same Credo agent `modules` object — initialized together.
3. **Port conflict**: `DidCommHttpInboundTransport` can use existing Express app (no new port needed) — pass `app` + custom `path: '/didcomm'`.
4. **did:peer creation**: Credo handles this automatically when establishing connections. No manual creation needed.
5. **Credential issuance/proof over DIDComm**: Available in `@credo-ts/didcomm` but complex protocol flows. Scope this to connections + basic messages first; credential/proof protocols as follow-up if needed.
