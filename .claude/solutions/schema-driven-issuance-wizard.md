---
title: "Schema-Driven Credential Issuance Wizard"
tags: [openid4vci, schema, frontend, wizard, sd-jwt, selective-disclosure, issuance]
category: architecture
difficulty: medium
date: 2026-03-12
---

## Problem

Mevcut `CredentialForm` 3 hardcoded credential type destekliyor (407 satir). Schema registry eklendikten sonra, dinamik olarak herhangi bir schema'ya gore claim formu, SD claim secimi ve onizleme sunmak gerekti.

## Approach

Mevcut form'u genisletmek yerine yeni bir schema-driven wizard sayfasi olusturuldu (`IssueAdvanced.tsx`). Bu, mevcut formu bozmadan schema registry ile entegre calisir.

### 3-Step Wizard Pattern

1. **Schema & Claims** — Schema dropdown (API'den), dinamik claim form alanlari (property type'a gore: string/number/boolean/array), holder DID, format secimi
2. **SD Options** (sadece `vc+sd-jwt` formatinda) — SD-eligible claim checkbox listesi (schema'dan), validity period, revocable toggle
3. **Preview & Issue** — Claim'lerin JSON preview'u SD/visible badge'lariyla, Issue butonu, basariliysa QR code

### Backend: Schema-to-Function Mapping

`POST /issuer/credentials/schema-issue` endpoint'i:
1. Schema'yi registry'den yukle
2. `schemaRegistry.validateClaims()` ile claim'leri dogrula
3. `schema.type` → mevcut issuance fonksiyonuna yonlendir (SCHEMA_TYPE_TO_CREDENTIAL map)
4. Bilinmeyen schema type icin 400 hata don (fallback issuance degil)

## Key Details

### Frontend
- `IssueAdvanced.tsx`: 565 satir (wizard pattern icin kabul edilebilir)
- `schemaApi.list()` → sadece `active` schema'lar dropdown'da
- Schema degisince: claims reset, SD claims reset, validity/revocable defaults reload
- Property type → input mapping: string→text, number→number, boolean→select, array→comma-separated

### Backend
- `SCHEMA_TYPE_TO_CREDENTIAL` map: schema type → issuance function routing
- Zod `schemaIssueRequestSchema`: holderDid + schemaId + claims + format + sdClaims + validity + revocable
- `schemaRegistry.validateClaims()` catches missing required fields and type mismatches

### Known Limitation
`selectiveDisclosureClaims` ve `validityDays` frontend'den gonderilir ama backend'de mevcut issuance fonksiyonlarina iletilmez — backend `SD_CLAIMS_BY_TYPE` default'larini kullanir. Per-request SD override gelecek iterasyonda eklenebilir.

## Lessons Learned

1. **Bilinmeyen schema type icin fallback issuance kullanma.** Agent-identity fonksiyonunu generic fallback olarak kullanmak, beklenmeyen claim yapilariyla kirik credential'lar uretir. 400 hata donmek daha guvenli.
2. **Wizard sayfalarinda state reset onemli.** Schema degistikce claims, SD secimleri ve default'lar sifirlanmali — aksi halde onceki schema'nin state'i kalintisi hataya yol acar.
3. **Mevcut fonksiyonlara delege et.** Yeni issuance logic yazmak yerine, mevcut `issueAgentIdentityCredential`/`issueDelegation`/`issueCapability` fonksiyonlarina route et — test edilmis, offer/QR flow dahil.

## Prevention

- Yeni credential type eklerken: schema registry'ye seed + `SCHEMA_TYPE_TO_CREDENTIAL` map'e entry + `SD_CLAIMS_BY_TYPE`'a entry
- Frontend wizard pattern'i yeniden kullanilabilir — schema-driven form alani olusturma logic'i extract edilebilir
