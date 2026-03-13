---
id: "T001"
title: "Webhook + WebhookDelivery Service Tests"
status: pending
priority: critical
---
## Scope
- `backend/src/services/webhook.service.ts` — CRUD, subscription cache, validation
- `backend/src/services/webhookDelivery.service.ts` — HMAC signing, retry logic, SSRF protection, pruning
