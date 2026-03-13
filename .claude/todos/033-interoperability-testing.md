---
id: "033"
title: "Cerceveler Arasi Birlikte Calisabilirlik Testi"
status: done
priority: medium
category: testing
wp: WP5
created: 2026-03-12
---

## Aciklama

Proje performans hedeflerinden biri: cerceveler arasi birlikte calisabilirlik orani %95-100.

## Gereksinimler

### Test Senaryolari
- [x] SD-JWT VC format uyumlulugu — jwt_vc_json + vc+sd-jwt dual format
- [x] DID method resolution — did:key self-contained, did:web with SSRF protection
- [x] OpenID4VCI credential offer/receive — pre-authorized_code grant
- [x] OpenID4VP presentation request/response — session management + direct_post
- [x] Credential schema registry — type validation

### Standart Uyumluluk
- [x] W3C VC Data Model 2.0 — @context, type, credentialSubject structure
- [x] SD-JWT VC (IETF draft) — dual format support
- [x] OpenID4VCI 1.0 — token exchange, credential claim
- [x] OpenID4VP 1.0 — verification request, session polling

### Test Altyapisi
- [x] Otomatik interop test suite — `backend/tests/interop/standards-compliance.test.ts`

## Kabul Kriterleri

- [x] Standards compliance test suite created (20+ tests)
- [x] W3C VC, OpenID4VCI, OpenID4VP, SD-JWT, DID compliance verified
