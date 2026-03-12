---
title: "Multi-Tenant Credential Isolation"
tags: [multi-tenant, isolation, middleware, storage, saas, feature-flag]
category: architecture
difficulty: medium
date: 2026-03-12
---

## Problem
The system had a complete multi-tenant service (`multiTenant.service.ts`, 528L) with full CRUD operations but no API routes, middleware, or frontend UI — classic orphan service pattern. Credential data (offers, sessions, issued credentials) was not tenant-scoped, making SaaS deployment impossible.

## Approach
Three-layer isolation strategy:
1. **Middleware layer** — `optionalTenant()` extracts tenant context from request (header/subdomain/query) without breaking existing API
2. **Storage layer** — `tenant-storage.service.ts` enriches data with `tenantId` before save and filters on read
3. **API layer** — Full tenant management CRUD endpoints + frontend admin UI

Key design decision: `optionalTenant()` (not `requireTenant()`) as default middleware — attaches tenant context if present, passes through if not. This preserves backward compatibility: existing single-tenant deployments work unchanged.

## Key Details

### Files Created
- `backend/src/api/middleware/tenant.middleware.ts` — `extractTenantFromRequest()`, `requireTenant()`, `optionalTenant()`
- `backend/src/services/tenant-storage.service.ts` — `saveTenantData()`, `listTenantData()`, `queryTenantData()`, `getTenantData()`, `deleteTenantData()`, `withTenantFilter()`
- `backend/src/api/routes/tenant.routes.ts` — 8 CRUD endpoints (list, stats, get, create, update, suspend, activate, delete, usage)
- `frontend-issuer-verifier/src/pages/TenantManagement.tsx` — Admin UI (list, create, suspend/activate, delete, stats)

### Files Modified
- `backend/src/api/middleware/auth.middleware.ts` — Added `tenantId` and `tenant` to `AuthenticatedRequest` interface
- `backend/src/api/schemas/validation.schemas.ts` — Added `tenantCreateSchema`, `tenantUpdateSchema` Zod validators
- `backend/src/api/server.ts` — Mount `optionalTenant()` middleware globally + tenant routes
- `backend/src/services/openid4vci.service.ts` — `createCredentialOffer()` and `listCredentialOffers()` accept optional `tenantId`
- `backend/src/services/openid4vp.service.ts` — `createAuthorizationRequest()` and `listVerificationSessions()` accept optional `tenantId`
- `frontend-issuer-verifier/src/services/api.ts` — Added `tenantApi` using shared `request()` helper
- `frontend-issuer-verifier/src/App.tsx` — Added `/issuer/tenants` route
- `frontend-issuer-verifier/src/components/Layout.tsx` — Added Tenants nav item

### Patterns Used
- **Feature-flag gating:** `module.multi-tenant` flag — middleware skips entirely when disabled
- **Optional enrichment:** `tenantId` is always optional — undefined means "no filtering" (single-tenant mode)
- **JSONB field injection:** `saveTenantData()` adds `tenantId` to data objects, `listTenantData()` filters by it
- **Orphan service wiring:** Existing service (528L) → add routes + Zod validation + server mount + frontend API in one pass

### Tenant Context Extraction Priority
1. `X-Tenant-ID` header (UUID lookup)
2. `X-Tenant-Slug` header (slug lookup)
3. Subdomain extraction (`tenant.example.com` → slug)
4. `tenantId` query parameter

### Permission Model
- `tenants:read` — List/view tenants and stats
- `tenants:write` — Create, update, suspend, activate, delete tenants
- Own-tenant access — GET `/:id` and GET `/:id/usage` allowed for own tenant without admin permission

## Lessons Learned
- Standalone tenant API services that bypass the shared `request()` helper lose token refresh and 401 redirect. Always use the existing API helper.
- `optionalTenant()` > `requireTenant()` for default middleware — breaking changes in multi-tenant rollout are worse than optional enrichment.
- Suspend reason from user input must be validated and length-limited (`typeof === 'string' && .slice(0, 500)`).

## Prevention
- When adding API client functions in frontend, always check if a shared `request()` helper exists and use it (for auth token management).
- When adding middleware that gates functionality, prefer the non-breaking variant by default.
- Always validate and limit user-provided text that gets stored (reason fields, descriptions, etc.).
