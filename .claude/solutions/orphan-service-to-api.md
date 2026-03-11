---
title: "Orphan Service → Full API Stack Pattern"
tags: [architecture, api, routes, service, schema-registry]
category: architecture
difficulty: easy
date: 2026-03-11
---

## Problem

A service exists with full CRUD logic (`schemaRegistry.service.ts` — 300 lines, 3 built-in schemas, Map-based storage) but has zero API routes. The service is unreachable from HTTP.

## Approach

Instead of rewriting, add the missing layers around the existing service:

1. **Route file** — thin handlers that delegate to service methods
2. **Zod validation** — input schemas for POST/PUT bodies
3. **Server mount** — import + `app.use()` in authenticated section
4. **Frontend API** — typed fetch functions
5. **Frontend page** — CRUD UI

This is the inverse of the "wire-up" pattern: instead of connecting an existing endpoint to a new service, we connect an existing service to a new endpoint.

## Key Details

- `schema.routes.ts` (106 lines) → 5 endpoints, all delegate to `schemaRegistry` singleton
- `credentialSchemaCreateSchema` uses `z.lazy()` for recursive property definitions
- `credentialSchemaUpdateSchema = credentialSchemaCreateSchema.partial().omit({ id: true })`
- Rate limiter on mutation endpoints (POST, PUT)
- ID truncation (max 100 chars) in error responses to prevent verbose leakage
- Frontend: 3 view modes (list/detail/create) in single page component

## Lessons Learned

- Check for orphan services before planning new features. Search for services that have no route imports.
- When exposing an existing service, the work is mostly boilerplate (routes, validation, API client). The service logic is already done.
- Always add rate limiting on mutation endpoints, even for seemingly low-risk CRUD.

## Prevention

When creating a new service, always create the route file in the same PR. A service without routes is invisible to the API consumer.

Quick check: `grep -rL 'import.*from.*services/SERVICENAME' backend/src/api/routes/` reveals orphans.
