---
id: "031"
title: "walt.id Framework Evaluation (Yedek Plan)"
status: pending
priority: medium
category: research
wp: WP1
created: 2026-03-12
---

## Aciklama

TUBİTAK WP1 deliverable: Credo Framework secim gerekcesininin kanitlarla dogrulanmasi. walt.id alternatif cerceve degerlendirmesi — OID4VC-only mimari fizibilite, kurumsal lisans maliyet degerlendirmesi, performans kiyaslama.

## Gereksinimler

### Teknik Degerlendirme
- [ ] walt.id SDK kurulumu ve PoC implementasyonu
- [ ] OpenID4VCI/VP akisi — walt.id ile credential issuance/verification
- [ ] SD-JWT VC destek durumu
- [ ] DID method destek karsilastirmasi (did:key, did:web, did:peer)
- [ ] Multi-tenancy yeteneyi degerlendirmesi

### Performans Kiyaslama
- [ ] Credential issuance latency — Credo vs walt.id
- [ ] Credential verification latency — Credo vs walt.id
- [ ] SD-JWT selective disclosure performansi
- [ ] Bellek kullanimi ve startup suresi karsilastirmasi

### Lisans ve Maliyet
- [ ] walt.id Community vs Enterprise lisans farklari
- [ ] Kotlin/React Native kopruleme gereksinimleri
- [ ] 5 yillik TCO (Total Cost of Ownership) analizi

### Rapor
- [ ] Credo secim gerekceleri — performans kanitleri
- [ ] walt.id guclu/zayif yonleri
- [ ] Gecis maliyeti degerlendirmesi (eger gerekirse)
- [ ] MS1 cikti raporu parcasi

## Teknik Notlar

- walt.id: Kotlin Multiplatform, OID4VC-only (DIDComm destek yok)
- Credo: TypeScript, DIDComm + OpenID4VC hibrit
- Performans farki bilinmiyor (Belirsizlik 1 — development plan Bolum 11.1)
- Risk: Credo OpenID4VC deneysel API degisiklikleri → walt.id yedek plan

## Kabul Kriterleri

- [ ] Performans kiyaslama raporu hazir (en az 3 metrik)
- [ ] TCO analizi tamamlanmis
- [ ] Credo secim gerekceleri kanitlarla desteklenmis
- [ ] MS1 raporuna entegre edilmis
