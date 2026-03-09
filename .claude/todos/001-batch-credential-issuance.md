---
id: "001"
title: "Batch Credential Issuance"
status: pending
priority: high
category: feature
created: 2026-03-09
---

## Açıklama

Birden fazla credential'ı tek seferde issue edebilme özelliği.

## Gereksinimler

- [ ] Backend: Batch issuance endpoint (`POST /api/v1/credentials/batch`)
- [ ] Backend: Transaction support (all-or-nothing)
- [ ] Backend: Rate limiting for batch operations
- [ ] Frontend Issuer: Batch issuance form
- [ ] Frontend Issuer: CSV/JSON import desteği
- [ ] Progress tracking ve error reporting

## Teknik Notlar

- Max batch size: 100 credentials
- Async processing with job queue (optional)
- Partial failure handling strategy needed

## Bağımlılıklar

- OpenID4VCI service
- Credential schema registry

## Kabul Kriterleri

- [ ] 100 credential tek request'te issue edilebilir
- [ ] Hata durumunda transaction rollback
- [ ] İlerleme durumu UI'da gösterilir
