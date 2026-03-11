---
id: "021"
title: "API Dokümantasyonu ve Referans Mimari Raporu"
status: pending
priority: medium
category: documentation
wp: WP6
created: 2026-03-11
---

## Açıklama

Kapsamlı API dokümantasyonu, kullanım rehberleri ve referans mimari raporu. TypeDoc ile otomatik üretim + elle yazılmış kılavuzlar.

## Gereksinimler

### OpenAPI/Swagger
- [ ] OpenAPI 3.0 spec — tüm endpoint'ler (mevcut Swagger annotations genişletilecek)
- [ ] Swagger UI hosting (`/api-docs`)
- [ ] Her endpoint için request/response örnekleri

### Kullanım Kılavuzları
- [ ] Authentication guide (API key, JWT, DID-based auth, VC-based machine auth)
- [ ] Credential lifecycle guide (issue → hold → present → verify → revoke)
- [ ] Delegation chain guide (create → attenuate → monitor → revoke)
- [ ] DIDComm integration guide
- [ ] OAuth bridge integration guide
- [ ] HLF anchor verification guide
- [ ] Multi-tenant setup guide
- [ ] Error code reference
- [ ] Rate limiting documentation

### SDK Dokümantasyonu
- [ ] TypeDoc otomatik API referansı
- [ ] SDK quick start guide (5 dakikada ilk credential)
- [ ] Migration guide (mevcut OAuth → VC-based auth geçişi)

### Referans Mimari Raporu
- [ ] Açık erişim teknik rapor (CC BY 4.0)
- [ ] Yayın: OWF + arXiv
- [ ] Mimari kararlar ve gerekçeleri
- [ ] Performans karakterizasyonu özeti
- [ ] Güvenlik analizi özeti

## Kabul Kriterleri

- [ ] Swagger UI tüm endpoint'leri gösteriyor
- [ ] Her endpoint için request/response örnekleri var
- [ ] Credential lifecycle end-to-end belgelenmiş
- [ ] Referans mimari raporu yayınlanmış (CC BY 4.0)
- [ ] TypeDoc API referansı güncel
