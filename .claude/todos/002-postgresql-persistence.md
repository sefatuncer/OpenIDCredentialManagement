---
id: "002"
title: "PostgreSQL Persistence — Kalan Map-based Servisler"
status: in-progress
priority: high
category: infrastructure
wp: WP2
created: 2026-03-09
---

## Açıklama

Kritik servisler zaten PostgreSQL'e geçirildi. Kalan in-memory Map kullanan servislerin storage adapter'a geçişi.

## Tamamlanan

- [x] Credentials storage (openid4vci.service.ts)
- [x] Revocation lists (revocation.service.ts)
- [x] Trust registry (trustRegistry.service.ts)
- [x] Audit logs (audit.service.ts)
- [x] Nonce management (openid4vci.service.ts)
- [x] VP sessions (openid4vp.service.ts)
- [x] Connection pooling, health check, migrations

## Kalan İş

- [ ] `issuer.agent.ts` — credentialOffers Map → storage adapter
- [ ] `issuer.agent.ts` — issuedCredentials Map → storage adapter
- [ ] Batch issuance tracking (todo 001 ile birlikte)
- [ ] Expiration cleanup — storage adapter üzerinden

## Kabul Kriterleri

- [ ] Tüm data PostgreSQL'de persist ediliyor (Map kullanan servisler kaldı)
- [ ] Server restart sonrası tüm data korunuyor
