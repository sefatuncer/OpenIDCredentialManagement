---
title: "Multi-Tenant Credential Isolation"
date: 2026-03-12
module: all
related_todos: [014]
---

## Goal

SaaS senaryolarında kiracılar arası kriptografik ve veri izolasyonu. Her tenant'ın kendi namespace'i, her sorgunun tenant filtresi, tenant CRUD API'si ve frontend tenant yonetim paneli.

## Research Findings

- **`multiTenant.service.ts` (528L) zaten mevcut** — Tenant CRUD, usage tracking, config, rate limits, `extractTenantFromRequest()` helper. Orphan service: route yok, middleware yok, query filtre yok.
- **Storage adapter pattern:** `createStorageAdapter<T>(collection)` → PostgreSQL JSONB. Tum sorgular `query({ where: { field } })` ile JSONB field filtreleme yapar. `tenantId` data icine eklenirse otomatik calisir.
- **Auth middleware:** `AuthenticatedRequest` interface'inde tenant yok. 3-strategy auth (Keycloak → JWT → API key).
- **Feature flag:** `module.multi-tenant` mevcut, development'ta `false`, testing'de `true`.
- **Route mount pattern:** `server.ts`'de `authenticateAny()` sonrasi `/api/v1` altina mount.
- **13+ storage collection** tenant-unaware — `credential_offers`, `holder_credentials`, `issuer_issued_credentials`, `partner_keys`, `verification_sessions`, `revocation_lists`, `audit_logs`, vs.

## Implementation Steps

### Adim 1: Tenant middleware olusturma → `backend/src/api/middleware/tenant.middleware.ts`
- `AuthenticatedRequest` interface'ine `tenantId?: string` ve `tenant?: Tenant` ekle (auth.middleware.ts'de)
- `requireTenant()` middleware: `extractTenantFromRequest(req)` cagir → tenant active mi kontrol → `req.tenantId` ve `req.tenant` set et. Tenant bulunamazsa veya suspended ise 403.
- `optionalTenant()` middleware: Tenant varsa set et, yoksa devam et (backward compat).
- Feature flag gate: `module.multi-tenant` false ise middleware skip.

### Adim 2: Tenant-scoped storage helper → `backend/src/services/tenant-storage.service.ts`
- `withTenantFilter(tenantId, filter)` — mevcut QueryFilter'a `tenantId` where clause ekler
- `saveTenantData(storage, key, tenantId, data)` — data'ya `tenantId` inject eder, save eder
- `queryTenantData(storage, tenantId, filter)` — otomatik tenant filtre ile query
- Tum servisler bu helper'i kullanarak tenant izolasyonu saglar
- "default" tenant ID: `MULTI_TENANT=false` iken tum data `tenantId: 'default'` ile kaydedilir (migration backward compat)

### Adim 3: Kritik servislere tenant filtre eklenmesi
- **`openid4vci.service.ts`**: `createCredentialOffer()`, `exchangePreAuthorizedCode()`, `getCredentialOfferDetails()` — tenantId parametre ekle, storage query'lerine filtre ekle
- **`openid4vp.service.ts`**: `createVerificationRequest()`, `handleDirectPost()` — tenantId filtre
- **`credential-lifecycle.service.ts`**: `revokeCredential()`, `checkExpirations()` — tenant-scoped
- Her service fonksiyonuna optional `tenantId?: string` parametre ekle (backward compat)

### Adim 4: Tenant CRUD route'lari → `backend/src/api/routes/tenant.routes.ts`
- `POST /api/v1/tenants` — createTenant (admin only)
- `GET /api/v1/tenants` — listTenants (admin only)
- `GET /api/v1/tenants/:id` — getTenant (admin or own tenant)
- `PUT /api/v1/tenants/:id` — updateTenant (admin only)
- `POST /api/v1/tenants/:id/suspend` — suspendTenant (admin only)
- `POST /api/v1/tenants/:id/activate` — activateTenant (admin only)
- `DELETE /api/v1/tenants/:id` — deleteTenant (admin only)
- `GET /api/v1/tenants/:id/usage` — getUsage (admin or own tenant)
- Zod validation schemas eklenmesi (validation.schemas.ts)

### Adim 5: Route mount + server entegrasyonu → `backend/src/api/server.ts`
- Tenant routes'u `/api/v1/tenants` altina mount et
- `optionalTenant()` middleware'i `authenticateAny()` sonrasina ekle (tum protected routes icin)
- Tenant context'i mevcut route handler'lara pass-through (breaking change yok)

### Adim 6: Frontend tenant yonetim paneli → `frontend-issuer-verifier/`
- `src/services/tenant.ts` — API client (CRUD + usage)
- `src/pages/TenantManagement.tsx` — Tenant listesi, olusturma, suspend/activate, usage goruntuleme
- `src/pages/Login.tsx` — Tenant secim (opsiyonel, multi-tenant aktifse)
- Navigation'a tenant yonetim linki (admin role icin)

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `backend/src/api/middleware/tenant.middleware.ts` | Create | Tenant context middleware (requireTenant, optionalTenant) |
| `backend/src/api/middleware/auth.middleware.ts` | Modify | AuthenticatedRequest'e tenantId/tenant ekle |
| `backend/src/services/tenant-storage.service.ts` | Create | Tenant-scoped storage helpers |
| `backend/src/api/routes/tenant.routes.ts` | Create | Tenant CRUD endpoints |
| `backend/src/api/schemas/validation.schemas.ts` | Modify | Tenant Zod schemas |
| `backend/src/api/server.ts` | Modify | Route mount + tenant middleware |
| `backend/src/services/openid4vci.service.ts` | Modify | tenantId filtre ekleme |
| `backend/src/services/openid4vp.service.ts` | Modify | tenantId filtre ekleme |
| `backend/src/services/credential-lifecycle.service.ts` | Modify | tenantId filtre ekleme |
| `frontend-issuer-verifier/src/services/tenant.ts` | Create | Tenant API client |
| `frontend-issuer-verifier/src/pages/TenantManagement.tsx` | Create | Tenant yonetim UI |
| `frontend-issuer-verifier/src/pages/Login.tsx` | Modify | Tenant secim |

## Validation

```bash
# TypeScript compilation
cd backend && npx tsc --noEmit
cd frontend-issuer-verifier && npx tsc --noEmit

# API test — tenant CRUD
curl -X POST localhost:3000/api/v1/tenants -H "X-API-Key: $KEY" \
  -d '{"name":"Test Tenant","slug":"test-tenant"}'

# Tenant-scoped credential issuance
curl -X POST localhost:3000/api/v1/issuer/credentials/agent-identity \
  -H "X-API-Key: $KEY" -H "X-Tenant-ID: tenant-xxx" -d '{...}'

# Cross-tenant isolation test
# Tenant A credential should NOT be visible to Tenant B
```

## Risks

1. **Breaking change riski:** Mevcut API'ler tenant olmadan calismali. `optionalTenant()` + `tenantId?: string` optional parametre ile backward compat korunur.
2. **Performance:** Her query'ye ekstra WHERE clause. JSONB GIN index zaten var, minimal etki.
3. **Data migration:** Mevcut data'ya `tenantId: 'default'` eklenmesi gerekebilir — ilk query'de handle edilir (null tenantId = tum data).
4. **multiTenant.service.ts 528L:** Zaten buyuk, yeni helper'lar ayri dosyada (`tenant-storage.service.ts`).
