---
id: "002"
title: "PostgreSQL Persistence"
status: in-progress
priority: high
category: infrastructure
created: 2026-03-09
---

## Açıklama

In-memory storage yerine PostgreSQL veritabanı entegrasyonu.

## Gereksinimler

- [x] PostgreSQL connection setup (pg — `database/connection.ts`)
- [x] Database schema tasarımı (17 migration — `database/migrations.ts`)
- [x] Migration sistem kurulumu (`runMigrations()` — startup'ta otomatik)
- [x] Mevcut servislerin DB'ye geçişi (storage adapter ile):
  - [x] Credentials storage (`openid4vci.service.ts` — `createStorageAdapter`)
  - [x] Revocation lists (`revocation.service.ts` — `createStorageAdapter`)
  - [x] Trust registry (`trustRegistry.service.ts` — `createStorageAdapter`)
  - [x] Audit logs (`audit.service.ts` — `createStorageAdapter`)
  - [x] Nonce management (`openid4vci.service.ts` — `createStorageAdapter`)
- [x] Connection pooling (`database/connection.ts` — max 20, idle 30s)
- [x] Health check endpoint güncelleme (`/health/storage`, `/health/detailed`)
- [x] Dev ortam PostgreSQL (`docker-compose.dev.yml` — postgres:15-alpine)

## Kalan İş

- [ ] `Map<>` kullanan servislerin adapter'a geçişi (batchIssuance, expirationNotifier, agentCredentialRequest, oidc sessions) — ayrı plan olarak ele alınacak

## Kabul Kriterleri

- [x] Kritik servisler PostgreSQL'de persist ediliyor (VCI, VP, audit, revocation, trust)
- [ ] Tüm data PostgreSQL'de persist ediliyor (Map kullanan servisler kaldı)
- [x] Server restart sonrası data korunuyor (adapter kullanan servisler için)
- [x] Migration'lar düzgün çalışıyor
