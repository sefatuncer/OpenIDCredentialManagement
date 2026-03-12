---
title: "Real-time Webhook Notification Pipeline — EventBus→WebSocket→HTTP Webhook"
tags: [webhook, notification, eventbus, websocket, realtime, revocation, hmac, ssrf]
category: architecture
difficulty: medium
date: 2026-03-12
---

## Problem

Backend had all the pieces for real-time notifications (EventBus, WebSocket service, ExpirationNotifier) but none were wired together. Additionally, there was no HTTP webhook system for notifying external systems about credential lifecycle events.

## Approach

Three-layer notification pipeline:

1. **Wire-up** — Connect existing orphaned services (`wsService.initialize()`, `expirationNotifier.start()`, EventBus listeners)
2. **Webhook CRUD** — Subscription management with HMAC-SHA256 signed delivery and retry
3. **Frontend** — WebSocket hook with auto-reconnect + toast notifications + webhook management UI

Key architectural decisions:
- **Single event handler per event** — one `eventBus.on()` handler does both WS broadcast and webhook delivery (avoids double-processing)
- **Service split** — CRUD in `webhook.service.ts` (180L), delivery engine in `webhookDelivery.service.ts` (229L) — respects ~300L limit
- **Subscription cache** — 30s TTL in-memory cache for `deliverEvent()` to avoid DB read on every event
- **Delivery pruning** — hourly interval removes deliveries exceeding 100 per webhook

## Key Details

### Files
- `backend/src/services/webhook.service.ts` — CRUD + re-exports delivery functions
- `backend/src/services/webhookDelivery.service.ts` — HMAC delivery, retry, cache, pruning
- `backend/src/api/routes/webhook.routes.ts` — 7 endpoints (CRUD + test + deliveries)
- `backend/src/index.ts` — Wire-up: WS init, EventBus→WS/webhook bridge, ExpirationNotifier start
- `frontend-issuer-verifier/src/hooks/useWebSocket.ts` — Stable ref pattern for callback
- `frontend-issuer-verifier/src/components/NotificationToast.tsx` — Event-driven toasts
- `frontend-issuer-verifier/src/pages/WebhookManagement.tsx` — CRUD + delivery history UI

### Webhook Delivery
- HMAC-SHA256 signature in `X-Webhook-Signature: sha256=<hex>` header
- Retry: 3 attempts with exponential backoff (1s → 10s → 60s)
- Timeout: 10s per request
- Response body captured (truncated to 500 chars) for debugging

### Security
- SSRF protection: `isPrivateUrl()` blocks localhost, 10.x, 172.16-31.x, 192.168.x, 169.254.x, .local, .internal
- HTTPS enforced in production via Zod `.refine()`
- Secret shown only on creation, masked (`8chars...`) on GET
- Max 20 subscriptions limit
- Rate limiting on all mutation endpoints

### Cache Invalidation
- `invalidateSubscriptionCache()` called on create/update/delete
- Cache TTL: 30s — stale subscriptions auto-refresh within 30s even without explicit invalidation

## Lessons Learned

1. **Wire-up before building new** — Check if services exist but aren't initialized. `wsService` and `expirationNotifier` had full implementations but zero callers in `index.ts`. This is the "orphan service" pattern at the infrastructure level.

2. **Single handler per event** — Registering multiple `eventBus.on()` for the same event creates divergence risk. Consolidate into one handler that fans out to multiple targets.

3. **useRef for callback stability** — React hooks that accept callbacks and manage side effects (WebSocket connections) should use `useRef` for the callback to prevent reconnection loops when parent re-renders.

4. **SSRF is hostname-level only** — String-based URL checks can't prevent DNS rebinding. Full protection requires connect-level IP verification, which is a v2 improvement.

5. **Service file splitting** — When a service grows past ~300L, split by concern (CRUD vs engine). The "thin wrapper + re-export" pattern keeps the public API surface unchanged.

## Prevention

- When adding a new service, always check `index.ts` for initialization calls — add to boot sequence AND shutdown.
- When registering EventBus listeners, grep for existing listeners on the same event type first.
- For any outbound HTTP from user-provided URLs, add SSRF checks.
- For React hooks with external connections, always use `useRef` for mutable callback references.
