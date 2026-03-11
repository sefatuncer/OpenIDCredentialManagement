---
id: "007"
title: "Client-Side VP Flow (Wallet-Only Credentials)"
status: pending
priority: medium
category: feature
wp: WP2
created: 2026-03-11
depends_on: ["006"]
---

## Açıklama

Wallet'ın kendi local credential'larını kullanarak client-side VP flow yapabilmesi. Şu an VP flow tamamen backend-driven.

## Gereksinimler

- [ ] Wallet local credential'lardan presentation definition'a matching
- [ ] Client-side VP token oluşturma (jose ile JWT signing)
- [ ] Direct_post endpoint'ine client-side submission
- [ ] SD-JWT credential'lar için selective disclosure seçimi
- [ ] Credential selection UI (birden fazla matching credential varsa)

## Teknik Notlar

- Wallet'ta private key gerekli (VP token signing için)
- `jose` library wallet'a eklenmeli
- Backend `direct_post` endpoint'i zaten dış wallet'lardan submission kabul ediyor

## Kabul Kriterleri

- [ ] Wallet local credential ile VP flow tamamlanıyor
- [ ] SD-JWT selective disclosure çalışıyor
- [ ] Backend ve client-side VP flow'lar birlikte çalışıyor
