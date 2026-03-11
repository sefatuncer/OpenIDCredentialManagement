---
id: "004"
title: "Production Environment Setup"
status: pending
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
- [ ] HTTPS/TLS sertifika yapılandırması
- [ ] CORS production whitelist
- [ ] Rate limiting production değerleri
- [ ] Secret management (Vault veya K8s Secrets)
- [ ] API key rotation mekanizması

### Performans
- [ ] Redis cache entegrasyonu
- [ ] CDN yapılandırması (static assets)
- [ ] Gzip/Brotli compression

### Logging & Monitoring
- [ ] Structured logging (JSON format — Winston zaten yapıyor, production config)
- [ ] Log aggregation (ELK veya Loki)
- [ ] Error tracking (Sentry veya benzeri)

## Kabul Kriterleri

- [ ] HTTPS zorunlu
- [ ] Secrets environment variable'dan okunuyor (zaten mevcut, doğrulanacak)
- [ ] Logs JSON formatında
- [ ] Redis cache aktif
