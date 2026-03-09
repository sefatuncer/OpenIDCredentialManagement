---
id: "002"
title: "PostgreSQL Persistence"
status: pending
priority: high
category: infrastructure
created: 2026-03-09
---

## Açıklama

In-memory storage yerine PostgreSQL veritabanı entegrasyonu.

## Gereksinimler

- [ ] PostgreSQL connection setup (pg veya prisma)
- [ ] Database schema tasarımı
- [ ] Migration sistem kurulumu
- [ ] Mevcut servislerin DB'ye geçişi:
  - [ ] Credentials storage
  - [ ] Revocation lists
  - [ ] Trust registry
  - [ ] Audit logs
  - [ ] Nonce management
- [ ] Connection pooling
- [ ] Health check endpoint güncelleme

## Teknik Notlar

- Prisma ORM tercih edilebilir (type-safe)
- Migration'lar version controlled olmalı
- Development için Docker Compose ile PostgreSQL

## Dosya Yapısı

```
backend/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   └── database/
│       ├── client.ts
│       └── repositories/
```

## Kabul Kriterleri

- [ ] Tüm data PostgreSQL'de persist ediliyor
- [ ] Server restart sonrası data korunuyor
- [ ] Migration'lar düzgün çalışıyor
