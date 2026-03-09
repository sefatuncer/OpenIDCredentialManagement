---
id: "004"
title: "Production Environment Setup"
status: pending
priority: medium
category: infrastructure
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
- [ ] WAF (Web Application Firewall) - opsiyonel

### Performans
- [ ] Redis cache entegrasyonu
- [ ] CDN yapılandırması (static assets)
- [ ] Database connection pooling
- [ ] Gzip/Brotli compression

### Logging & Monitoring
- [ ] Structured logging (JSON format)
- [ ] Log aggregation (ELK veya Loki)
- [ ] APM entegrasyonu (opsiyonel)
- [ ] Error tracking (Sentry veya benzeri)

### CI/CD
- [ ] GitHub Actions workflow
- [ ] Automated testing pipeline
- [ ] Docker image build & push
- [ ] Kubernetes deployment automation

## Environment Variables

```bash
# Production required
NODE_ENV=production
DATABASE_URL=postgresql://...
JWT_SECRET=<secure-random-32-bytes>
API_KEY=<secure-random-key>
CORS_ORIGINS=https://wallet.example.com,https://issuer.example.com
```

## Kabul Kriterleri

- [ ] HTTPS zorunlu
- [ ] Secrets environment variable'dan okunuyor
- [ ] Logs JSON formatında
- [ ] CI/CD pipeline çalışıyor
