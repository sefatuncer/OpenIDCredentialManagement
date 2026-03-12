---
id: "033"
title: "Cerceveler Arasi Birlikte Calisabilirlik Testi"
status: pending
priority: medium
category: testing
wp: WP5
created: 2026-03-12
---

## Aciklama

Proje performans hedeflerinden biri: cerceveler arasi birlikte calisabilirlik orani %95-100. Credo tabanli sistem ile diger SSI cerceveleri (walt.id, Sphereon, MATTR vb.) arasinda credential issuance/verification interoperability testi.

## Gereksinimler

### Test Senaryolari
- [ ] Credo issuer → harici verifier (walt.id, Sphereon) ile dogrulama
- [ ] Harici issuer → Credo verifier ile dogrulama
- [ ] SD-JWT VC format uyumlulugu — farkli implementasyonlar arasi
- [ ] DID method resolution — did:key, did:web cross-framework
- [ ] OpenID4VCI credential offer/receive — cross-framework
- [ ] OpenID4VP presentation request/response — cross-framework

### Test Altyapisi
- [ ] Harici framework test instance'lari (Docker)
- [ ] Otomatik interop test suite
- [ ] Uyumluluk matrisi raporu (framework x feature x sonuc)

### Standart Uyumluluk
- [ ] W3C VC Data Model 2.0 uyumu
- [ ] SD-JWT VC (IETF draft) uyumu
- [ ] OpenID4VCI 1.0 (Final) uyumu
- [ ] OpenID4VP 1.0 uyumu
- [ ] HAIP 1.0 profil uyumu
- [ ] eIDAS 2.0 / EUDI Wallet ARF uyumu

## Teknik Notlar

- Interop testi WP5'te (Ay 13-14) yapilacak, WP4 test altyapisi uzerine
- Performans farki olcumu icin ayni credential senaryolari farkli frameworklerde calistirilacak
- Istatistiksel analiz: Cohen's d, Bonferroni duzeltmesi (development plan Bolum 10.3)

## Kabul Kriterleri

- [ ] En az 2 harici framework ile interop testi tamamlanmis
- [ ] Uyumluluk orani >= %95
- [ ] Uyumluluk matrisi raporu hazir
- [ ] Basarisiz senaryolar icin root cause analizi yapilmis
