---
id: 038
title: "P2: Keycloak SSO cleanup — leaked token, unused var, file size"
priority: important
status: done
created: 2026-03-12
category: architecture
---

## Items
1. **Remove `keycloak_access_token` from callback response** — `auth.routes.ts:326`. Unnecessary token exposure; local JWT already issued.
2. **Remove unused variable** — `keycloak.service.ts:114` `const systemRole = mapToSystemRole(realmRoles)` assigned but never used.
3. **Extract Keycloak routes** — `auth.routes.ts` now ~332L, exceeds ~300L limit. Move Keycloak endpoints to `keycloak-auth.routes.ts`.
