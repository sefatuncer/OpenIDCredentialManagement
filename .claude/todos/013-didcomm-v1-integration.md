---
id: "013"
title: "DIDComm v1/v2 Entegrasyonu"
status: done
priority: medium
category: feature
wp: WP3
created: 2026-03-11
---

## Açıklama

Agent-to-Agent (A2A) iletişimi için DIDComm mesajlaşma protokolü. OpenID4VC web servisleri ile birlikte çalışacak hibrit iletişim. v1 ile başlanacak, WP3 sonunda v2 geçiş değerlendirmesi yapılacak.

## Gereksinimler

### DIDComm v1 (Ana hedef)
- [ ] Credo-TS DIDComm modülü aktivasyonu
- [ ] DIDComm endpoint (`/didcomm` veya Credo'nun kendi endpoint'i)
- [ ] did:peer oluşturma ve resolution (A2A için)
- [ ] Basic message protocol (trust-ping, basicmessage)
- [ ] Issue credential protocol (DIDComm üzerinden)
- [ ] Present proof protocol (DIDComm üzerinden)
- [ ] Message routing (DIDComm ↔ OpenID4VC protocol switch)

### DIDComm v2 Değerlendirme (WP3 sonu, Ay 10-12)
- [ ] v2 spesifikasyon hazırlık durumu değerlendirmesi
- [ ] Credo v2 desteği analizi
- [ ] v1→v2 geçiş planı (gerekirse proje sonrası yol haritasına)

## Teknik Notlar

- Credo-TS zaten DIDComm v1 destekliyor (`@credo-ts/core` içinde)
- did:peer method 2 (inline service endpoints)
- DIDComm mesajları encrypted (AuthCrypt/AnonCrypt)
- OpenID4VC ve DIDComm aynı credential'ları paylaşır, sadece transport farklı
- v2 gecikmesi riski var → v1 ile proje tamamlanır, v2 proje sonrası (Risk tablosu)

## Kabul Kriterleri

- [ ] İki ajan DIDComm v1 üzerinden mesajlaşabiliyor
- [ ] DIDComm üzerinden credential issuance çalışıyor
- [ ] DIDComm üzerinden presentation exchange çalışıyor
- [ ] Protocol geçişi (DIDComm ↔ OpenID4VC) sorunsuz
- [ ] v2 geçiş değerlendirme raporu hazır
