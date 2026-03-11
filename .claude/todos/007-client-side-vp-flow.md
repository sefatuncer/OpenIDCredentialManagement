---
id: "007"
title: "Client-Side VP Flow (Wallet-Only Credentials)"
status: pending
priority: medium
category: feature
created: 2026-03-11
related: [006]
---

## Açıklama

Şu an VP flow backend-driven: wallet URI'yi backend'e gönderiyor, backend kendi in-memory credential storage'ından matching credential bulup VP token oluşturuyor. Wallet'ın local encrypted storage'ındaki credential'lar backend holder agent'ta yok.

Bu todo, wallet'ın kendi credential'larını kullanarak client-side VP flow yapabilmesini sağlar.

## Gereksinimler

- [ ] Wallet local credential'lardan presentation definition'a matching yapma
- [ ] Client-side VP token oluşturma (jose ile JWT signing)
- [ ] Direct_post endpoint'ine client-side submission
- [ ] SD-JWT credential'lar için selective disclosure seçimi (mevcut CreatePresentationModal kullanılabilir)
- [ ] Credential selection UI (birden fazla matching credential varsa)

## Teknik Notlar

- Wallet'ta private key gerekli (VP token signing için)
- `jose` library wallet'a eklenmeli
- Backend `direct_post` endpoint'i zaten dış wallet'lardan submission kabul ediyor
- `presentation_submission` descriptor map oluşturulmalı
- Mevcut `CreatePresentationModal` SD-JWT disclosure seçimi için yeniden kullanılabilir

## Önkoşul

- Todo 006 (OpenID4VP Wallet Integration) tamamlanmalı
