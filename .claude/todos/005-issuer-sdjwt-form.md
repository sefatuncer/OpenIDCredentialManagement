---
id: "005"
title: "Issuer SD-JWT Credential Form"
status: done
priority: medium
category: feature
wp: WP2
created: 2026-03-09
completed: 2026-03-12
---

## Aciklama

Issuer dashboard'da SD-JWT credential olusturma formu. Selective disclosure claim secimi ile.

## Gereksinimler

- [x] Credential type secimi (schema registry'den — todo 010 ile baglantili)
- [x] Claim input form (dynamic, schema'ya gore)
- [x] Selective disclosure claim secimi (checkbox — hangi claim'ler gizlenebilir)
- [x] Expiration date picker (validity period days)
- [x] Preview before issue
- [x] QR code generation for credential offer

## Bagimliliklar

- Todo 009 (SD-JWT VC format migration) — TAMAMLANDI
- Todo 010 (Credential schema registry) — TAMAMLANDI

## Kabul Kriterleri

- [x] Form schema'ya gore dinamik olusuyor
- [x] SD claims secilebilir (selective disclosure checkbox)
- [x] Credential offer QR kodu gosteriliyor
- [x] Issue edilen credential SD-JWT VC formatinda

## Implementation

- `frontend-issuer-verifier/src/pages/IssueAdvanced.tsx` — 3-step wizard (565 lines)
- `frontend-issuer-verifier/src/services/api.ts` — `issuerApi.issueBySchema()` method
- `backend/src/api/routes/issuer.routes.ts` — `POST /issuer/credentials/schema-issue` endpoint
- `backend/src/api/schemas/validation.schemas.ts` — `schemaIssueRequestSchema` Zod validation
- `frontend-issuer-verifier/src/App.tsx` — `/issuer/issue-advanced` route
- `frontend-issuer-verifier/src/components/Layout.tsx` — Nav link

## Bilinen Sinirlilik

`selectiveDisclosureClaims` ve `validityDays` frontend'den gonderilir ama backend mevcut `SD_CLAIMS_BY_TYPE` default'larini kullanir. Per-request SD override gelecek iterasyonda.
