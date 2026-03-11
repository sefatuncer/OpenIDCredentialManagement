---
id: "009"
title: "SD-JWT VC Format Migration"
status: done
priority: high
category: feature
wp: WP2
created: 2026-03-11
---

## Açıklama

Proje referansı tüm credential'ların SD-JWT VC formatında olmasını gerektiriyor. Şu an credential'lar `jwt_vc_json` formatında issue ediliyor (plain JWT-VC). SD-JWT VC formatına geçiş gerekli — eIDAS 2.0 / EUDI ARF uyumluluğu için.

## Gereksinimler

- [x] `openid4vci.service.ts` — `issueCredential()` SD-JWT VC formatında credential üretmeli
- [x] `sdjwt.service.ts` — credential issuance entegrasyonu (mevcut servis verification/parsing için, issuance eksik)
- [x] Issuer metadata — `credential_configurations_supported` formatı `vc+sd-jwt` olmalı
- [x] Selective disclosure tanımları — her credential type için hangi claim'ler SD olacak
- [x] Backward compat — mevcut `jwt_vc_json` formatını da desteklemeye devam et (format parametresi ile)
- [x] Wallet — SD-JWT credential'ları düzgün parse ediyor (mevcut, doğrulanacak)

## Teknik Notlar

- SD-JWT VC formatı: `<issuer-jwt>~<disclosure1>~<disclosure2>~...~<kb-jwt>`
- `sdjwt.service.ts` zaten SD-JWT parsing/verification yapıyor, issuance tarafı eksik
- `@sd-jwt/sd-jwt-vc` paketi veya `jose` ile manual SD-JWT oluşturma
- Credential configuration ID: `AIAgentIdentityCredential_sdjwt` gibi ayrı config eklenebilir

## Kabul Kriterleri

- [x] Yeni issue edilen credential'lar SD-JWT VC formatında
- [x] Selective disclosure claim'leri gizlenebilir
- [x] Mevcut jwt_vc_json formatı da destekleniyor (backward compat)
- [x] Wallet SD-JWT credential'ları doğru gösteriyor
