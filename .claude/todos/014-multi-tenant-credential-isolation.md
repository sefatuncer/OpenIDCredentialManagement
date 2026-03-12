---
id: "014"
title: "Multi-Tenant Credential İzolasyonu"
status: done
priority: high
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

- **Credo @credo-ts/tenants modülü:** Shared agent + tenant context mimarisi — tek Credo ajan instance'ı üzerinde birden fazla kiracı
- Her tenant ayrı Askar wallet (kriptografik izolasyon) — kiracı başına izole encrypted storage
- PostgreSQL RLS (Row Level Security) ile data izolasyonu
- API key veya JWT'de tenant claim
- **Kubernetes namespace izolasyonu:** Her kiracı için ayrı namespace, network policy'ler ile iletişim kontrolü
- **AI Ajan Adaptasyonu (Ar-Ge):** Credo tenants modülü insan kullanıcılar için tasarlanmış — AI ajanların yüksek frekanslı kısa ömürlü credential kullanımı, otonom yenileme/iptal döngüleri, çoklu seçici açıklama senaryoları adaptasyonu gerekli
- Helm charts ile tekrarlanabilir kiracı ortamı oluşturma

## Kabul Kriterleri

- [ ] Tenant A credential'larına Tenant B erişemiyor
- [ ] Her tenant'ın kendi DID'i var
- [ ] Penetration test ile izolasyon doğrulanmış
- [ ] Tenant oluşturma/silme API'si çalışıyor
