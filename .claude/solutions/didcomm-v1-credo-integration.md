---
title: "DIDComm v1 Agent-to-Agent Messaging via Credo-TS"
tags: [didcomm, credo, agent-messaging, connections, oob, feature-flag]
category: architecture
difficulty: medium
date: 2026-03-12
---

## Problem
Need agent-to-agent messaging (connections, basic messages, OOB invitations) using DIDComm v1 protocol, integrated with the existing Credo-TS agent. Must be optional (feature-flag gated) and not break existing OpenID4VC flows.

## Approach
1. Credo-TS `@credo-ts/didcomm` v0.6.3 was already installed but not loaded. Activated it conditionally via dynamic import + feature flag.
2. Refactored Credo agent's `modules` object from inline to variable to allow conditional module addition.
3. Created separate `didcomm.service.ts` (214L) rather than adding wrappers to already-large `credo.agent.ts` (676L).
4. Same pattern as HLF integration: feature-flag gate + dynamic import + graceful degradation.

## Key Details

### Files
- `backend/src/core/feature-flags.ts` — `module.didcomm` (default: false, env: `FEATURE_DIDCOMM`)
- `backend/src/agents/credo.agent.ts` — Conditional `DidCommModule` loading via dynamic import
- `backend/src/services/didcomm.service.ts` — 6 wrapper functions around Credo DIDComm API
- `backend/src/api/routes/didcomm.routes.ts` — 6 REST endpoints, feature-flag middleware
- `backend/src/api/server.ts` — Route mount at `/api/v1/didcomm`
- `backend/src/index.ts` — Event wiring (ConnectionStateChanged, BasicMessageStateChanged → WebSocket)
- `backend/src/services/websocket.service.ts` — `didcomm:connection`, `didcomm:message` event types
- `backend/src/api/routes/health.routes.ts` — DIDComm status in `/health/detailed`

### Architecture Pattern
```
Feature Flag (module.didcomm)
  └─ credo.agent.ts: dynamic import @credo-ts/didcomm → DidCommModule added to agent modules
  └─ didcomm.service.ts: requireAgent() guard → Credo DIDComm API wrappers
  └─ didcomm.routes.ts: requireDidComm middleware → service calls
  └─ index.ts: agent.events.on() → wsService.broadcast() + eventBus.emit()
```

### DIDComm Module Setup
```typescript
// Dynamic import — @ts-ignore for optional peer dependency
const { DidCommModule } = await import('@credo-ts/didcomm')
const { DidCommHttpInboundTransport } = await import('@credo-ts/node')

agentModules.didComm = new DidCommModule({
  endpoints: [`${config.issuerBaseUrl}/didcomm`],
  inboundTransports: [
    new DidCommHttpInboundTransport({ app: credoApp, path: '/didcomm', port })
  ],
  outboundTransports: [new DidCommHttpOutboundTransport()],  // REQUIRED for sending!
})
```

### Service Guard Pattern
```typescript
function requireAgent(): any {
  if (!isDidCommEnabled()) throw new Error('DIDComm is not enabled')
  const agent = getCredoAgent()
  if (!agent) throw new Error('Credo agent not available')
  if (!agent.modules.didComm) throw new Error('DIDComm module not loaded')
  return agent
}
```

## Lessons Learned
1. **Outbound transport required**: `outboundTransports: []` silently prevents message sending. Always include `DidCommHttpOutboundTransport` for bidirectional communication.
2. **Module refactoring needed**: Adding conditional modules to Credo agent requires extracting the modules object from inline to a variable (`Record<string, unknown>`) and casting with `as any` at construction.
3. **Service extraction**: When the host file (credo.agent.ts) is already large, create a separate service file that imports the agent getter rather than adding more exports to the host.
4. **Event name discovery**: Credo uses string event names like `ConnectionStateChanged`, `BasicMessageStateChanged` — check Credo source for exact names.

## Prevention
- When adding optional Credo modules, always check: (1) inbound transport, (2) outbound transport, (3) endpoints config. Missing any of these causes silent failures.
- For user-provided URLs fed to Credo's `receiveInvitationFromUrl()`, apply SSRF validation — Credo may fetch from the URL.
