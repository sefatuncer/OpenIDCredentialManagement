---
id: "029"
title: "AI Agent Credential Schemas (3-Type: Agent ID, Delegation, Capability)"
status: done
priority: high
category: feature
wp: WP2
created: 2026-03-12
---

## Aciklama

W3C VC 2.0 + SD-JWT VC formatinda AI ajanlara ozgu 3 tip credential semasi tasarimi ve implementasyonu. Mevcut schema registry (todo 010) uzerine insa edilecek.

## Gereksinimler

### 1. Ajan Kimlik Belgesi (Agent ID VC)
- [ ] SD-JWT VC sema tasarimi — AI ajanin benzersiz tanimlayicisi, sahibi, olusturulma tarihi, yetenekleri
- [ ] Schema registry'ye kayit (`credential_schemas` tablosu)
- [ ] `SD_CLAIMS_BY_TYPE` tanimlari — hangi claim'ler selectively disclosable
- [ ] `buildCredentialConfigurations()` guncelleme — issuer metadata'ya ekleme
- [ ] Issuance fonksiyonu — `issueAgentIdentityCredential()`

### 2. Yetki Devri Kimlik Belgesi (Delegation VC)
- [ ] SD-JWT VC sema tasarimi — delegasyon kapsami, kisitlamalar (tutar, servis, sure, cografi)
- [ ] TTL (Time-to-Live) parametreleri — optimal yasam dongusu (Ar-Ge)
- [ ] Zincirlenme desteyi (A -> B -> C) — her adimda kapsam daraltma (attenuation)
- [ ] Iptal mekanizmasi entegrasyonu — StatusList2021 + webhook ile kriptografik baglam
- [ ] Issuance fonksiyonu — `issueDelegationCredential()`

### 3. Yetenek Kimlik Belgesi (Capability VC)
- [ ] SD-JWT VC sema tasarimi — arac izin listeleri, yetenek sinirlari
- [ ] Secici aciklama tanimlari — sadece gerekli bilgilerin paylasimi
- [ ] Issuance fonksiyonu — `issueCapabilityCredential()`

### Frontend
- [ ] Issuer Dashboard — 3 credential tipi icin issuance wizard
- [ ] Web Wallet — credential tip gosterimi (Agent ID / Delegation / Capability)

## Teknik Notlar

- Mevcut `schemaRegistry.service.ts` ve `SD_CLAIMS_BY_TYPE` pattern'i kullanilacak
- `_sdjwt` suffix convention ile dual format (jwt_vc_json + vc+sd-jwt)
- Delegation VC'de optimal TTL parametreleri Ar-Ge konusu — kisa TTL iptal yukunu azaltir ama yenileme ek yuku olusturur
- Schema-driven issuance wizard (todo 005 pattern) yeniden kullanilacak

## Kabul Kriterleri

- [ ] 3 credential tipi basariyla issue edilebiliyor
- [ ] Her tip icin SD-JWT selective disclosure calisiyor
- [ ] Delegation chain (A->B->C) calisior, her adimda kapsam daraliyor
- [ ] Schema registry'de 3 built-in schema mevcut
- [ ] Frontend'de tip bazli issuance ve goruntumleme calisiyor
