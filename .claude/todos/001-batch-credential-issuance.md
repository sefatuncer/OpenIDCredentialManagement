---
id: "001"
title: "Batch Credential Issuance"
status: pending
priority: high
category: feature
wp: WP2
created: 2026-03-09
---

## Açıklama

Birden fazla credential'ı tek seferde issue edebilme özelliği.

## Gereksinimler

- [ ] Backend: Batch issuance service (`batch-issuance.service.ts`)
- [ ] Backend: Batch endpoint (`POST /issuer/credentials/batch`)
- [ ] Backend: Zod validation schema (batchIssuanceSchema)
- [ ] Backend: Rate limiting for batch operations
- [ ] Frontend: Batch issuance page (`/issuer/issue-batch`)
- [ ] Frontend: CSV/JSON import desteği
- [ ] Frontend: Progress tracking ve result summary UI

## Teknik Notlar

- Max batch size: 100 credentials
- Tek credential type per batch
- Serial processing (loop), partial failure handling
- Feature flag: `module.batch-issuance` (zaten mevcut, default enabled)

## Bağımlılıklar

- Issuer agent credential issuance fonksiyonları (mevcut)

## Kabul Kriterleri

- [ ] 100 credential tek request'te issue edilebilir
- [ ] Hata durumunda partial success (biri fail olursa diğerleri devam)
- [ ] İlerleme durumu ve sonuç summary UI'da gösterilir
- [ ] CSV ve JSON import çalışıyor
