---
title: "Agent Identity SDK Packaging"
date: 2026-03-13
module: all
related_todos: [020]
---

## Goal
Create a standalone TypeScript SDK package that wraps the backend REST API, providing a typed client for the full agent identity lifecycle.

## Research Findings
- Backend API routes cover all required functionality (issuer, verifier, holder, delegation, webhook, DIDComm, OAuth bridge)
- SDK should be a thin HTTP client wrapper — all logic stays in the backend
- Package structure: `sdk/` directory at repo root with its own `package.json`

## Implementation Steps

1. Create `sdk/` package structure with package.json, tsconfig, build setup
2. Create `sdk/src/types.ts` — all response/request type definitions
3. Create `sdk/src/client.ts` — main AgentSDK class with HTTP client
4. Create `sdk/src/modules/` — modular clients (issuer, verifier, holder, delegation, didcomm, oauth, audit, webhook)
5. Create `sdk/src/index.ts` — barrel exports
6. Create `sdk/examples/` — usage examples

## Files to Create
| File | Action | Description |
|------|--------|-------------|
| `sdk/package.json` | Create | Package config |
| `sdk/tsconfig.json` | Create | TypeScript config |
| `sdk/src/index.ts` | Create | Barrel exports |
| `sdk/src/client.ts` | Create | Main AgentSDK class |
| `sdk/src/types.ts` | Create | Type definitions |
| `sdk/src/http.ts` | Create | HTTP client helper |
| `sdk/src/modules/issuer.ts` | Create | Issuer client |
| `sdk/src/modules/verifier.ts` | Create | Verifier client |
| `sdk/src/modules/holder.ts` | Create | Holder client |
| `sdk/src/modules/delegation.ts` | Create | Delegation client |
| `sdk/src/modules/webhook.ts` | Create | Webhook client |
| `sdk/src/modules/didcomm.ts` | Create | DIDComm client |
| `sdk/src/modules/oauth.ts` | Create | OAuth bridge client |
| `sdk/src/modules/audit.ts` | Create | Audit client |
| `sdk/examples/basic-issuance.ts` | Create | Getting started example |
| `sdk/examples/delegation-chain.ts` | Create | Delegation example |
