---
id: "026"
title: "Demo Uygulamalar (3 Senaryo)"
status: done
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
- [x] AI ajan ödeme senaryosu — `demos/demo1-payment-agent.ts`
- [x] Delegation credential ile kapsam kısıtlı yetki (payment scope)
- [x] OAuth bridge ile API erişim kontrolü
- [x] Gerçek zamanlı iptal senaryosu

### Demo 2: Kurumsal Asistan
- [x] AI asistan CRM/ERP entegrasyonu — `demos/demo2-enterprise-assistant.ts`
- [x] Capability credential ile API erişim kontrolü
- [x] DIDComm üzerinden ajan-ajan iletişimi
- [x] Audit trail gösterimi

### Demo 3: Çok Kiracılı SaaS
- [x] Multi-tenant senaryo (2 tenant) — `demos/demo3-multi-tenant-saas.ts`
- [x] Tenant izolasyonu demo
- [x] Tenant-scoped credential issuance/verification
- [x] Cross-tenant erişim engeli gösterimi

## Kabul Kriterleri

- [x] 3 demo uçtan uca çalışıyor (SDK-based, npx ts-node ile)
- [x] Her demo 5 dakikada gösterilebilir
