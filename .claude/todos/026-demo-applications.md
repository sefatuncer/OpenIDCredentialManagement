---
id: "026"
title: "Demo Uygulamalar (3 Senaryo)"
status: pending
priority: medium
category: feature
wp: WP6
created: 2026-03-11
depends_on: ["012", "014", "020"]
---

## Açıklama

Proje çıktılarını somutlaştıran 3 demo uygulama. TRL 6 doğrulaması ve ticarileşme için kritik.

## Gereksinimler

### Demo 1: Ödeme Ajanı
- [ ] AI ajan ödeme senaryosu
- [ ] Delegation credential ile kapsam kısıtlı yetki (maxAmount, allowedServices)
- [ ] OAuth bridge ile ödeme API'sine erişim
- [ ] Gerçek zamanlı iptal senaryosu

### Demo 2: Kurumsal Asistan
- [ ] AI asistan CRM/ERP entegrasyonu senaryosu
- [ ] Capability credential ile API erişim kontrolü
- [ ] DIDComm üzerinden ajan-ajan iletişimi
- [ ] Audit trail gösterimi

### Demo 3: Çok Kiracılı SaaS
- [ ] Multi-tenant senaryo (2+ tenant)
- [ ] Tenant izolasyonu demo
- [ ] Tenant yönetim dashboard
- [ ] Cross-tenant erişim engeli gösterimi

## Kabul Kriterleri

- [ ] 3 demo uçtan uca çalışıyor
- [ ] Her demo 5 dakikada gösterilebilir
- [ ] Demo videoları hazır
