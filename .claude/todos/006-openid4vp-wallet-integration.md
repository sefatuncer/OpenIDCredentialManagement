---
id: "006"
title: "OpenID4VP Wallet Integration"
status: pending
priority: medium
category: feature
created: 2026-03-09
---

## Açıklama

Web-wallet'ta OpenID4VP ile credential presentation flow'u.

## Gereksinimler

### Wallet Tarafı
- [ ] QR code scanner (verification request)
- [ ] Presentation definition parsing
- [ ] Credential selection UI
- [ ] SD-JWT claim selection (which to disclose)
- [ ] Consent screen
- [ ] Presentation submission

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

- [ ] QR scan ile verification flow başlıyor
- [ ] SD-JWT credential'larda claim selection çalışıyor
- [ ] Verification sonucu wallet'ta gösteriliyor
