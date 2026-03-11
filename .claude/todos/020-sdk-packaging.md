---
id: "020"
title: "Agent Identity SDK Paketleme"
status: pending
priority: medium
category: feature
wp: WP6
created: 2026-03-11
depends_on: ["012", "013", "015"]
---

## Açıklama

AI ajanlarının sisteme kolay entegre olması için tam yaşam döngüsü SDK paketi. Credo'nun TypeScript altyapısı üzerine inşa edilecek. npm paketi + REST API üzerinden dil bağımsız erişim.

## Gereksinimler

### SDK Core (TypeScript/npm)
- [ ] DID yönetimi (oluşturma, resolve, rotate)
- [ ] Credential issuance client (offer → token → credential)
- [ ] Credential verification client (VP request → submit → result)
- [ ] Selective disclosure (SD-JWT claim seçimi)
- [ ] Real-time revocation client (StatusList2021 + webhook listener)
- [ ] Delegation chain yönetimi (create → attenuate → revoke)
- [ ] Audit log erişimi (query, filter)
- [ ] OAuth bridge client (VC → OAuth token exchange)
- [ ] DIDComm messaging client (A2A iletişim)

### Dağıtım
- [ ] npm paketi (`@openid-credential/agent-sdk` veya benzeri)
- [ ] TypeScript type definitions (tam type safety)
- [ ] REST API üzerinden dil bağımsız erişim (Python, Go, Java wrapper örnekleri)
- [ ] Versiyon yönetimi (semver)

### Dokümantasyon
- [ ] TypeDoc ile otomatik API referansı
- [ ] Getting started guide (5 dakikada ilk credential)
- [ ] Kullanım örnekleri (examples/ dizini)
  - [ ] Temel credential issuance/verification
  - [ ] Delegation chain oluşturma
  - [ ] OAuth bridge kullanımı
  - [ ] DIDComm mesajlaşma

## Lisans

- SDK: Proprietary (ticari lisanslama)
- Performans test çerçevesi: Apache 2.0 (açık kaynak, OWF ekosistemi)

## Kabul Kriterleri

- [ ] `npm install` ile kurulabiliyor
- [ ] 5 dakikada temel credential flow çalıştırılabiliyor
- [ ] Tam yaşam döngüsü: issuance → verification → revocation → delegation → audit
- [ ] TypeScript type safety tam
- [ ] REST API endpoint'leri dil bağımsız erişilebilir
- [ ] Örnekler çalışır durumda
