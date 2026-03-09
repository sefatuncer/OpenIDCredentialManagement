---
id: "005"
title: "Issuer SD-JWT Credential Form"
status: pending
priority: medium
category: feature
created: 2026-03-09
---

## Açıklama

Issuer dashboard'da SD-JWT credential oluşturma formu.

## Gereksinimler

- [ ] Credential type seçimi (schema registry'den)
- [ ] Claim input form (dynamic)
- [ ] Selective disclosure claim seçimi (checkbox)
- [ ] Expiration date picker
- [ ] Preview before issue
- [ ] QR code generation for credential offer

## UI Mockup

```
┌─────────────────────────────────────┐
│ Issue SD-JWT Credential             │
├─────────────────────────────────────┤
│ Credential Type: [Dropdown]         │
│                                     │
│ Claims:                             │
│ ┌─────────────────────────────────┐ │
│ │ [x] agentName: [input]          │ │
│ │ [ ] capabilities: [input]  (SD) │ │
│ │ [ ] trustLevel: [input]    (SD) │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Expires: [Date Picker]              │
│                                     │
│ [Preview] [Issue Credential]        │
└─────────────────────────────────────┘
```

## Bağımlılıklar

- Schema registry service
- SD-JWT backend service

## Kabul Kriterleri

- [ ] Form schema'ya göre dinamik oluşuyor
- [ ] SD claims seçilebilir
- [ ] Credential offer QR kodu gösteriliyor
