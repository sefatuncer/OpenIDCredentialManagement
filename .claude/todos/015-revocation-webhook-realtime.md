---
id: "015"
title: "Gerçek Zamanlı Revocation (Webhook Push)"
status: pending
priority: medium
category: feature
wp: WP3
created: 2026-03-11
---

## Açıklama

StatusList2021 polling-based. <1dk revocation propagation için webhook push notification hibrit yaklaşımı.

## Gereksinimler

- [ ] Webhook subscription endpoint (`POST /webhooks/subscribe`)
- [ ] Webhook event dispatcher (revocation events)
- [ ] Subscriber management (URL, event types, retry policy)
- [ ] Revocation event → webhook push + StatusList update (dual write)
- [ ] Retry logic (exponential backoff, max 3 retries)
- [ ] Webhook signature verification (HMAC-SHA256)
- [ ] Verifier SDK/client — webhook listener + local cache invalidation

## Teknik Notlar

- StatusList2021 mevcut (polling), webhook ek katman
- Webhook payload: `{ event: "credential.revoked", credentialId, statusListIndex, timestamp }`
- Subscriber'lar PostgreSQL'de saklanacak
- Dead letter queue (failed deliveries)

## Kabul Kriterleri

- [ ] Revocation <1dk içinde webhook ile bildiriliyor
- [ ] Webhook retry çalışıyor (failed delivery recovery)
- [ ] StatusList2021 + webhook birlikte çalışıyor
- [ ] Webhook signature doğrulanabiliyor
