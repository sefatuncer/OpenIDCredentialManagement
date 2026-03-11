---
id: "014"
title: "Multi-Tenant Credential İzolasyonu"
status: pending
priority: medium
category: security
wp: WP3
created: 2026-03-11
---

## Açıklama

SaaS senaryolarında kiracılar arası kriptografik izolasyon. Her tenant'ın kendi DID'i, key pair'i ve credential namespace'i olmalı.

## Gereksinimler

- [ ] Tenant management service (`tenant.service.ts`)
- [ ] Tenant bazlı DID ve key pair yönetimi
- [ ] Credential namespace izolasyonu (tenant_id prefix)
- [ ] PostgreSQL row-level security (tenant_id column)
- [ ] API authentication'da tenant context
- [ ] Tenant-scoped issuer metadata
- [ ] Cross-tenant erişim kontrolü (varsayılan: deny)

## Teknik Notlar

- Credo-TS multi-tenancy: `@credo-ts/tenants` modülü kullanılabilir
- Her tenant ayrı Askar wallet (kriptografik izolasyon)
- PostgreSQL RLS (Row Level Security) ile data izolasyonu
- API key veya JWT'de tenant claim

## Kabul Kriterleri

- [ ] Tenant A credential'larına Tenant B erişemiyor
- [ ] Her tenant'ın kendi DID'i var
- [ ] Penetration test ile izolasyon doğrulanmış
- [ ] Tenant oluşturma/silme API'si çalışıyor
