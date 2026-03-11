---
id: "005"
title: "Issuer SD-JWT Credential Form"
status: pending
priority: medium
category: feature
wp: WP2
created: 2026-03-09
---

## Açıklama

Issuer dashboard'da SD-JWT credential oluşturma formu. Selective disclosure claim seçimi ile.

## Gereksinimler

- [ ] Credential type seçimi (schema registry'den — todo 010 ile bağlantılı)
- [ ] Claim input form (dynamic, schema'ya göre)
- [ ] Selective disclosure claim seçimi (checkbox — hangi claim'ler gizlenebilir)
- [ ] Expiration date picker
- [ ] Preview before issue
- [ ] QR code generation for credential offer

## Bağımlılıklar

- Todo 009 (SD-JWT VC format migration) — credential'lar SD-JWT formatında olmalı
- Todo 010 (Credential schema registry) — dinamik schema desteği

## Kabul Kriterleri

- [ ] Form schema'ya göre dinamik oluşuyor
- [ ] SD claims seçilebilir (selective disclosure checkbox)
- [ ] Credential offer QR kodu gösteriliyor
- [ ] Issue edilen credential SD-JWT VC formatında
