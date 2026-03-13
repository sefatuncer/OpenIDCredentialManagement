---
id: "004"
title: "Production Environment Setup"
status: done
priority: medium
category: infrastructure
wp: WP4
created: 2026-03-09
depends_on: ["002", "003"]
---

## Açıklama

Production ortamı için güvenlik ve performans yapılandırmaları.

## Gereksinimler

### Güvenlik
- [x] HTTPS/TLS sertifika yapılandırması — `config/tls.config.ts`, mTLS destekli
- [x] CORS production whitelist — `CORS_ALLOWED_ORIGINS` env var, default-deny in production
- [x] Rate limiting production değerleri — 7 rate limiter (default/strict/issuance/verification/auth/batch/directPost)
- [x] Secret management (K8s Secrets) — `backend/k8s/base/secret.yaml`, production uses external (Vault)
- [x] API key rotation mekanizması — env var based, no hardcoded secrets

### Performans
- [x] Redis cache entegrasyonu — `RedisStorageAdapter.ts`, optional with graceful degradation
- [x] Gzip/Brotli compression — Express `compression` middleware + Nginx gzip
- [ ] CDN yapılandırması (static assets) — Nginx caching configured, CDN external dependency

### Logging & Monitoring
- [x] Structured logging (JSON format) — Winston, production JSON format, file rotation (10MB, 30 files)
- [x] Log aggregation — Prometheus + Grafana + AlertManager stack
- [ ] Error tracking (Sentry) — Not integrated, external dependency

## Kabul Kriterleri

- [x] HTTPS zorunlu — TLS_ENABLED + HTTP→HTTPS redirect
- [x] Secrets environment variable'dan okunuyor
- [x] Logs JSON formatında
- [x] Redis cache aktif (optional, graceful degradation)
