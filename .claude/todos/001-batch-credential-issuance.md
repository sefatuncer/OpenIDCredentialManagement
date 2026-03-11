---
id: "001"
title: "Batch Credential Issuance"
status: done
priority: high
category: feature
wp: WP2
created: 2026-03-09
completed: 2026-03-11
---

## Açıklama

Birden fazla credential'ı tek seferde issue edebilme özelliği.

## Gereksinimler

- [x] Backend: `batchIssuanceService` wire-up (`setIssuer()` callback)
- [x] Backend: `issueCredentialDirect()` — offer flow bypass
- [x] Backend: 3 batch endpoint (POST job, GET status, GET results)
- [x] Backend: Zod validation schema (`batchIssuanceSchema`)
- [x] Backend: Rate limiting (`credentialIssuanceRateLimiter`)
- [x] Frontend: BatchIssue.tsx wizard page (`/issuer/issue-batch`)
- [x] Frontend: JSON/CSV import + preview
- [x] Frontend: Progress polling (2sn interval) + result summary

## Teknik Notlar

- Async job pattern: POST → 202 + jobId → polling → results
- `batchIssuanceService` kullanıyor (10 concurrent, 3 retry, 50/chunk)
- Max batch size: 100 recipients
- Tek credential type per batch
- Job tracking in-memory Map (Fase 2'de PostgreSQL'e migrate edilecek)

## Review Findings (P2)

- `batchJobIdParamSchema` tanımlı ama GET endpoint'lerde kullanılmıyor
- Batch results tüm authenticated kullanıcılara açık (multi-tenant risk)
