---
title: "DIDComm P2 Review Fixes — Outbound Transport + SSRF Protection"
date: 2026-03-12
module: backend
related_todos: [040]
---

## Goal

Fix 2 P2 review findings from DIDComm integration: (1) add missing outbound transport so message sending works, (2) add SSRF protection on invitation URL input.

## Research Findings

- `DidCommHttpOutboundTransport` is exported from `@credo-ts/didcomm` — same package as `DidCommModule`
- `isPrivateUrl()` helper exists in `webhook.service.ts:66` — reusable pattern for SSRF blocking
- Credo's `receiveInvitationFromUrl()` may fetch from the URL if it's not an inline OOB (`?oob=<base64>`) — SSRF risk
- OOB invitations typically use inline format, but API should validate regardless

## Implementation Steps

### Step 1: Add outbound transport → `backend/src/agents/credo.agent.ts`
- Import `DidCommHttpOutboundTransport` from same dynamic import of `@credo-ts/didcomm`
- Replace `outboundTransports: []` with `outboundTransports: [new DidCommHttpOutboundTransport()]`
- ~3 line change

### Step 2: Extract `isPrivateUrl()` to shared utility → `backend/src/utils/url-validation.ts`
- Move `isPrivateUrl()` from `webhook.service.ts` to shared utility
- Re-export from `webhook.service.ts` to avoid breaking existing callers
- ~20 lines new file

### Step 3: Add SSRF validation in didcomm service → `backend/src/services/didcomm.service.ts`
- Import `isPrivateUrl` from `../utils/url-validation`
- In `receiveDidCommInvitation()`: parse URL, check `isPrivateUrl()` before passing to Credo
- If URL is private, throw 400 error
- ~5 line change

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `backend/src/agents/credo.agent.ts` | Modify | Add DidCommHttpOutboundTransport to outbound array |
| `backend/src/utils/url-validation.ts` | Create | Extract `isPrivateUrl()` as shared utility (~25L) |
| `backend/src/services/webhook.service.ts` | Modify | Import from shared utility, remove local copy |
| `backend/src/services/didcomm.service.ts` | Modify | Add SSRF check in receiveDidCommInvitation |

## Validation

```bash
# 1. TypeScript compile
cd backend && npx tsc --noEmit

# 2. Verify outbound transport in agent config (code review)

# 3. Test SSRF blocking
# With FEATURE_DIDCOMM=true:
curl -X POST http://localhost:3000/api/v1/didcomm/invitations/receive \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"invitationUrl":"http://127.0.0.1:8080/internal"}'
# → 400 "Private/internal URLs are not allowed"
```

## Risks

1. **Dynamic import order**: `DidCommHttpOutboundTransport` must be imported in same block as `DidCommModule` — already from same package, no risk.
2. **Inline OOB URLs**: URLs with `?oob=<base64>` pointing to localhost domain would be blocked. Mitigation: OOB invitations don't need DNS resolution (data is inline), so the URL domain doesn't matter — Credo extracts the `oob` param directly. But to be safe, skip SSRF check if URL contains `?oob=` parameter.
