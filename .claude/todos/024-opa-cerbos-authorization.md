---
id: "024"
title: "OPA/Cerbos Fine-Grained Authorization"
status: pending
priority: medium
category: security
wp: WP3
created: 2026-03-11
---

## Açıklama

Mevcut basit API key + JWT kimlik doğrulaması yerine OPA (Open Policy Agent) veya Cerbos ile ayrıntılı yetkilendirme politika motoru. AI ajanlarının credential kapsamına göre granüler erişim kontrolü.

## Gereksinimler

- [ ] Policy engine seçimi (OPA vs Cerbos değerlendirme)
- [ ] Policy tanımlama — credential tiplerine göre erişim kuralları
- [ ] AuthZEN profili uyumlu politika formatı
- [ ] Middleware entegrasyonu — Express route'larında policy enforcement
- [ ] Delegation scope kontrolü — credential'daki scope alanına göre yetki kısıtlama
- [ ] Admin dashboard'da politika yönetim UI
- [ ] Audit log — politika kararları loglanmalı

## Teknik Notlar

- OPA: Rego dili, sidecar pattern, Go tabanlı
- Cerbos: YAML/JSON politikalar, REST API, daha kolay entegrasyon
- Mevcut `auth.middleware.ts` genişletilecek
- Delegation credential'daki `scope`, `constraints`, `maxAmount`, `allowedServices` alanları politika inputu olarak kullanılacak

## Kabul Kriterleri

- [ ] Policy engine çalışıyor ve route'lara entegre
- [ ] Delegation scope'a göre erişim kısıtlama çalışıyor
- [ ] Politika kararları audit log'da görünüyor
- [ ] OWASP ASI07 (Yetki Yükseltme) azaltma sağlanmış
