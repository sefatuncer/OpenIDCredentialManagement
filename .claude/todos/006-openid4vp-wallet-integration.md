---
id: "006"
title: "OpenID4VP Wallet Integration"
status: done
priority: medium
category: feature
created: 2026-03-09
---

## Açıklama

Web-wallet'ta OpenID4VP ile credential presentation flow'u.

## Gereksinimler

### Wallet Tarafı
- [x] QR code scanner (verification request)
- [x] Presentation definition parsing (backend-driven)
- [ ] Credential selection UI (todo 007 — client-side flow)
- [ ] SD-JWT claim selection (todo 007 — client-side flow)
- [x] Consent screen
- [x] Presentation submission

### Backend Tarafı
- [ ] Authorization request endpoint
- [ ] Presentation submission endpoint
- [ ] Verification result callback

## Flow

```
1. Verifier → QR Code (authorization_request_uri)
2. Wallet → Scan QR
3. Wallet → Fetch presentation_definition
4. Wallet → Select matching credential
5. Wallet → (SD-JWT) Select claims to disclose
6. Wallet → User consent
7. Wallet → Submit presentation
8. Verifier → Verify & respond
```

## Kabul Kriterleri

- [x] QR scan ile verification flow başlıyor
- [ ] SD-JWT credential'larda claim selection çalışıyor (todo 007)
- [x] Verification sonucu wallet'ta gösteriliyor
