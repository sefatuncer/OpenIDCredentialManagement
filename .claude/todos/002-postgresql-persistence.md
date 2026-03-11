---
id: "002"
title: "PostgreSQL Persistence — Kalan Map-based Servisler"
status: in-progress
priority: high
category: infrastructure
wp: WP2
created: 2026-03-09
updated: 2026-03-11
---

## Açıklama

Kritik servisler zaten PostgreSQL'e geçirildi (IStorageAdapter pattern). Kalan in-memory Map kullanan servislerin storage adapter'a geçişi.

## Tamamlanan (Önceki Cycle)

- [x] Credentials storage (openid4vci.service.ts)
- [x] Revocation lists (revocation.service.ts)
- [x] Trust registry (trustRegistry.service.ts)
- [x] Audit logs (audit.service.ts)
- [x] Nonce management (openid4vci.service.ts)
- [x] VP sessions (openid4vp.service.ts)
- [x] Connection pooling, health check, migrations
- [x] Multi-tenant storage (multiTenant.service.ts)

## Fase 1 — CRITICAL (restart = veri kaybı) ✅ TAMAMLANDI

- [x] `holder.agent.ts` — storedCredentials Map → storage adapter (`holder_credentials`)
- [x] `issuer.agent.ts` — credentialOffers Map → storage adapter (`issuer_credential_offers`)
- [x] `issuer.agent.ts` — issuedCredentials Map → storage adapter (`issuer_issued_credentials`)
- [x] `agentCredentialRequest.service.ts` — partnerKeys + orgAgentCounts Map → storage adapter (`partner_keys`, `org_agent_counts`)

## Fase 2 — HIGH (session kaybı) ✅ TAMAMLANDI

- [x] `oidc.service.ts` — configs Map → storage adapter (`oidc_provider_configs`). metadataCache (1h TTL cache) ve sessions (10min OAuth CSRF) transient → Map olarak kaldı.
- [x] `batchIssuance.service.ts` — jobs Map → storage adapter (`batch_jobs`). processJob() explicit save per chunk (crash recovery).

## Fase 3 — MEDIUM (defer edilebilir)

- [ ] `expirationNotifier.service.ts` — credentials + notifiedCredentials Map → storage adapter
- [ ] `encryption.service.ts` — keys Map → storage adapter
- [ ] `schemaRegistry.service.ts` — schemas Map → storage adapter
- [ ] `capabilityDiscovery.service.ts` — agents Map → storage adapter

## Fase 4 — LOW (bırakılabilir, transient state)

- [ ] `websocket.service.ts` — clients Map (transient, reconnect OK)
- [ ] `event-bus.ts` — eventHistory array (debug only)
- [ ] `feature-flags.ts` — featureState Map (env var fallback OK)
- [ ] `plugin-registry.ts` — plugins Map (re-init on boot OK)
- [ ] `simulation/` — tüm Map'ler (izole modül, migration gereksiz)

## Kabul Kriterleri

- [x] Fase 1 tamamlandı — CRITICAL data PostgreSQL'de persist ediliyor
- [x] Fase 2 tamamlandı — OIDC configs + batch jobs persistent
- [x] Mevcut API kontratları değişmiyor (backward compat)
- [x] IStorageAdapter pattern kullanılıyor (yeni repo yazmaya gerek yok)
- [x] TypeScript compile — zero errors
- [ ] Server restart sonrası holder credentials, issuer offers, partner keys korunuyor (manual test gerekli)
