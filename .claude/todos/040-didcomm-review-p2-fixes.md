---
id: "040"
title: "DIDComm Integration P2 Review Fixes"
status: done
priority: medium
category: bugfix
created: 2026-03-12
---

## Findings

### 1. Missing outbound transport (credo.agent.ts:275)
- `outboundTransports: []` means the agent cannot send outbound DIDComm messages
- `sendBasicMessage()` and connection handshake responses will fail at runtime
- Fix: Add `DidCommHttpOutboundTransport` to outbound transports array

### 2. SSRF risk in receiveDidCommInvitation (didcomm.routes.ts:57)
- `receiveInvitationFromUrl()` accepts user-provided URL that may trigger outbound HTTP
- OOB invitations typically use inline `?oob=<base64>` format, but URL could point to internal services
- Fix: Validate that invitationUrl contains `?oob=` inline data or apply SSRF protection (private IP blocking)
