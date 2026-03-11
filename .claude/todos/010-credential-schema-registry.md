---
id: "010"
title: "Credential Schema Registry"
status: done
priority: medium
category: feature
wp: WP2
created: 2026-03-11
---

## Açıklama

Dinamik credential tipi tanımlama ve yönetimi. Şu an credential tipleri (Agent Identity, Delegation, Capability) kodda hardcoded. Schema registry ile yeni credential tipleri runtime'da eklenebilmeli.

## Gereksinimler

- [ ] Schema registry service (`schema-registry.service.ts`)
- [ ] CRUD API: credential schema oluşturma, listeleme, güncelleme
- [ ] Schema format: JSON Schema veya W3C credential schema
- [ ] Issuer metadata otomatik güncelleme (`credential_configurations_supported`)
- [ ] Issuer dashboard'da schema yönetim UI
- [ ] SD-JWT disclosure tanımları schema'da belirtilmeli

## Teknik Notlar

- PostgreSQL'de `credential_schemas` tablosu
- Mevcut 3 credential tipi seed data olarak migrate edilmeli
- `buildCredentialSubject()` fonksiyonu schema registry'den dinamik okuma yapmalı

## Kabul Kriterleri

- [ ] Yeni credential tipi API üzerinden tanımlanabiliyor
- [ ] Issue edilen credential'lar dinamik schema'ya göre oluşuyor
- [ ] Issuer metadata otomatik güncelleniyor
