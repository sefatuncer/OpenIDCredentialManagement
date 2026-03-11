---
id: "025"
title: "Cloud HSM Performans Karakterizasyonu"
status: pending
priority: medium
category: research
wp: WP1-WP5
created: 2026-03-11
---

## Açıklama

Cloud HSM operasyonlarının credential işlemlerine eklediği gecikme süresi ek yükü ölçümü. Farklı cloud provider'lar arası karşılaştırmalı analiz. Projenin Ar-Ge belirsizliklerinden biri.

## Gereksinimler

### WP1 (Ay 1-3): Ön Değerlendirme
- [ ] AWS CloudHSM test kurulumu
- [ ] Azure Dedicated HSM test kurulumu (opsiyonel)
- [ ] Temel latency ölçümleri (key generation, signing, verification)

### WP5 (Ay 13-16): Kapsamlı Analiz
- [ ] EdDSA (Ed25519) signing latency — HSM vs software
- [ ] Credential issuance pipeline'a HSM entegrasyonu
- [ ] Batch signing performansı (100 credential)
- [ ] HSM connection pooling stratejisi
- [ ] Cloud provider karşılaştırma raporu
- [ ] Optimal HSM kullanım stratejisi önerisi

## Teknik Notlar

- Mevcut sistem `jose` ile software signing yapıyor (ephemeral key pair)
- HSM entegrasyonu PKCS#11 veya cloud provider SDK ile
- HSM latency overhead tahmini: 10-50ms/operation (doğrulanacak)
- Maliyet-performans trade-off analizi gerekli

## Kabul Kriterleri

- [ ] HSM vs software signing latency karşılaştırması ölçülmüş
- [ ] Optimal HSM stratejisi belirlenmiş (her operasyonda mı, sadece kritik olanlarda mı)
- [ ] Cloud provider karşılaştırma raporu hazır
