---
id: 037
title: "P1: Keycloak client_id mismatch + missing PKCE code_verifier in code exchange"
priority: critical
status: done
created: 2026-03-12
category: security
---

## Problem
Frontend auth URL uses `ssi-frontend` (public PKCE client) but backend `exchangeAuthorizationCode()` sends code to Keycloak with `ssi-backend` (confidential client). Keycloak binds authorization codes to the requesting client — this exchange will fail.

Additionally, the PKCE `code_verifier` is generated and stored in sessionStorage but never sent to the backend callback endpoint. Keycloak requires it for PKCE-enabled token exchanges.

## Files
- `backend/src/services/keycloak.service.ts` (line 155-201) — `exchangeAuthorizationCode()`
- `frontend-issuer-verifier/src/services/keycloak.ts` (line 70-88, 94-137) — `startKeycloakLogin()`, `handleKeycloakCallback()`
- `backend/src/api/schemas/validation.schemas.ts` — `keycloakCallbackSchema` needs `codeVerifier` field

## Fix
1. Frontend: send `code_verifier` from sessionStorage in callback POST body
2. Backend `keycloakCallbackSchema`: add `codeVerifier` field
3. Backend `exchangeAuthorizationCode`: use `frontendClientId` (not `clientId`), add `code_verifier` param, remove `client_secret` (public client doesn't use it)
