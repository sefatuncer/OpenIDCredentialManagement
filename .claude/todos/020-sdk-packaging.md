---
id: "020"
title: "Agent Identity SDK Paketleme"
status: done
priority: medium
category: feature
wp: WP6
created: 2026-03-11
depends_on: ["012", "013", "015"]
---

## Açıklama

AI ajanlarının sisteme kolay entegre olması için tam yaşam döngüsü SDK paketi.

## Gereksinimler

### SDK Core (TypeScript/npm)
- [x] DID yönetimi (oluşturma, resolve, rotate)
- [x] Credential issuance client (offer → token → credential)
- [x] Credential verification client (VP request → submit → result)
- [x] Selective disclosure (SD-JWT claim seçimi)
- [x] Real-time revocation client (webhook listener)
- [x] Delegation chain yönetimi (create → attenuate → revoke)
- [x] Audit log erişimi (query, filter)
- [x] OAuth bridge client (VC → OAuth token exchange)
- [x] DIDComm messaging client (A2A iletişim)

### Dağıtım
- [x] npm paketi (`@openid-credential/agent-sdk`)
- [x] TypeScript type definitions (tam type safety)
- [x] REST API üzerinden dil bağımsız erişim (HTTP client wrapper)
- [x] Versiyon yönetimi (semver — 0.1.0)

### Dokümantasyon
- [x] Kullanım örnekleri (examples/ dizini)
  - [x] Temel credential issuance/verification
  - [x] Delegation chain oluşturma

## Kabul Kriterleri

- [x] `npm install` ile kurulabiliyor
- [x] 5 dakikada temel credential flow çalıştırılabiliyor (examples/basic-issuance.ts)
- [x] Tam yaşam döngüsü: issuance → verification → delegation → audit
- [x] TypeScript type safety tam
- [x] REST API endpoint'leri SDK ile erişilebilir (8 modül)
- [x] Örnekler çalışır durumda
