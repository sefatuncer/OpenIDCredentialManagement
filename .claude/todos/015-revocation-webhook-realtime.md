---
id: "015"
title: "Gerçek Zamanlı Revocation (Webhook Push)"
status: done
priority: medium
category: feature
wp: WP3
created: 2026-03-11
completed: 2026-03-12
---

## Açıklama

StatusList2021 polling-based. <1dk revocation propagation için webhook push notification hibrit yaklaşımı.

## Gereksinimler

- [x] Webhook subscription CRUD (7 endpoints: POST/GET/PUT/DELETE + test + deliveries)
- [x] Webhook event dispatcher (EventBus→WebSocket+HTTP webhook bridge)
- [x] Subscriber management (URL, event types, HMAC secret, metadata)
- [x] Revocation event → webhook push + WebSocket broadcast (single handler per event)
- [x] Retry logic (exponential backoff: 1s→10s→60s, max 3 retries)
- [x] Webhook HMAC-SHA256 signature (X-Webhook-Signature header)
- [x] SSRF protection (private IP blocking)
- [x] Frontend: WebhookManagement UI + WebSocket auto-reconnect hook + toast notifications

## Teknik Notlar

- StatusList2021 mevcut (polling), webhook ek katman
- Webhook payload: `{ event: "credential.revoked", credentialId, statusListIndex, timestamp }`
- Subscriber'lar PostgreSQL'de saklanacak
- Dead letter queue (failed deliveries)

## Kabul Kriterleri

- [x] Revocation <1dk içinde webhook ile bildiriliyor
- [x] Webhook retry çalışıyor (exponential backoff recovery)
- [x] StatusList2021 + webhook birlikte çalışıyor (EventBus bridge)
- [x] Webhook HMAC-SHA256 signature doğrulanabiliyor
