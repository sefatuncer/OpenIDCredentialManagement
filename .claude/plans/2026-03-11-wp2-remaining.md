---
title: "WP2 Remaining Tasks — Schema Registry, SD-JWT Form, Client VP"
date: 2026-03-11
module: all
related_todos: [005, 007, 010]
---

## Goal

Complete the remaining WP2 Alfa Prototip tasks: expose the existing schema registry via API (todo 010), enhance the issuer form with SD claim selection (todo 005), and add client-side VP flow to the wallet (todo 007).

## Research Findings

### Todo 010 — Credential Schema Registry
- `schemaRegistry.service.ts` already has full CRUD: `registerSchema()`, `getSchema()`, `getAllSchemas()`, `updateSchema()`, `deactivateSchema()`, `validateClaims()`, `getCredentialConfiguration()`
- 3 built-in schemas with `issuanceConfig.selectiveDisclosure` arrays
- Uses in-memory Map — needs IStorageAdapter migration (aligns with todo 002 Fase 3)
- **ZERO API routes** — service is orphaned from HTTP layer
- **Action:** Create route layer + Zod schemas + frontend UI. Service logic already done.

### Todo 005 — Issuer SD-JWT Form
- `CredentialForm.tsx` already supports format selection (`vc+sd-jwt` default) and all 3 credential types
- `SD_CLAIMS_BY_TYPE` in `openid4vci.service.ts` defines which claims are selectively disclosable
- **Gap:** No UI for issuer to choose which claims become SD (selective disclosure). Currently backend decides based on `SD_CLAIMS_BY_TYPE`.
- **Action:** Add SD claim selection checkboxes when format is `vc+sd-jwt`. Fetch schema from registry to know which claims are SD-eligible. Add QR code for credential offer URI.

### Todo 007 — Client-Side VP Flow
- Currently VP is fully backend-driven: wallet sends URI → backend does everything
- Wallet needs: `jose` library, private key access, VP token signing, direct_post submission
- `direct_post` endpoint already accepts external submissions
- **Most complex task** — requires wallet-side JWT signing + credential matching + SD-JWT disclosure selection

## Implementation Order

**Phase A: Todo 010 — Schema Registry API** (smallest, unblocks 005)
**Phase B: Todo 005 — SD-JWT Issuer Form** (depends on schema registry for SD claim info)
**Phase C: Todo 007 — Client-Side VP Flow** (independent, most complex)

---

## Phase A: Schema Registry API (Todo 010)

### Step 1 — Schema Registry Routes → `backend/src/api/routes/schema.routes.ts`
Create new route file with 5 endpoints:
- `GET /schemas` — list all active schemas
- `GET /schemas/:id` — get schema by ID
- `POST /schemas` — register new schema (validated)
- `PUT /schemas/:id` — update schema
- `DELETE /schemas/:id` — deactivate schema (soft delete)

### Step 2 — Zod Validation → `backend/src/api/schemas/validation.schemas.ts`
Add `credentialSchemaSchema` for POST/PUT body validation:
- `id`: string identifier
- `name`, `description`: string
- `type`, `version`: string
- `credentialSubject.properties`: object
- `required`: string[]
- `issuanceConfig`: optional object with `selectiveDisclosure` string array

### Step 3 — Register Routes → `backend/src/api/index.ts` or `app.ts`
Mount `/schemas` route on main router.

### Step 4 — Frontend API Functions → `frontend-issuer-verifier/src/services/api.ts`
Add `schemaApi` object with `list()`, `get()`, `create()`, `update()`, `deactivate()`.

### Step 5 — Schema Management Page → `frontend-issuer-verifier/src/pages/SchemaManagement.tsx`
- List all schemas in a table
- "Create Schema" button → modal/form
- Edit/deactivate actions per row
- Show SD-eligible claims from `issuanceConfig.selectiveDisclosure`

### Step 6 — Register Frontend Route → `frontend-issuer-verifier/src/App.tsx`
Add `/issuer/schemas` route + nav link in IssuerDashboard.

## Files to Create/Modify (Phase A)

| File | Action | Description |
|------|--------|-------------|
| `backend/src/api/routes/schema.routes.ts` | Create | 5 CRUD endpoints |
| `backend/src/api/schemas/validation.schemas.ts` | Modify | Add schema validation |
| `backend/src/api/index.ts` or `app.ts` | Modify | Mount `/schemas` routes |
| `frontend-issuer-verifier/src/services/api.ts` | Modify | Add schemaApi |
| `frontend-issuer-verifier/src/pages/SchemaManagement.tsx` | Create | Schema CRUD UI |
| `frontend-issuer-verifier/src/App.tsx` | Modify | Add route |
| `frontend-issuer-verifier/src/pages/IssuerDashboard.tsx` | Modify | Add nav card |

---

## Phase B: SD-JWT Issuer Form (Todo 005)

### Step 1 — Fetch Schemas in CredentialForm → `frontend-issuer-verifier/src/components/CredentialForm.tsx`
- When `vc+sd-jwt` format selected, fetch schema for current credential type via `schemaApi.get()`
- Extract `issuanceConfig.selectiveDisclosure` claim list

### Step 2 — SD Claim Checkboxes → `frontend-issuer-verifier/src/components/CredentialForm.tsx`
- Below each claim field, show a checkbox: "Selectively Disclosable"
- Pre-check based on schema's `selectiveDisclosure` array
- Issuer can override (add/remove SD claims)
- Send `sdClaims: string[]` in form data

### Step 3 — Backend SD Claims Override → `backend/src/agents/issuer.agent.ts`
- Accept optional `sdClaims` parameter in issue functions
- Pass to `sdjwtService.createSDJWTVC()` to override `SD_CLAIMS_BY_TYPE` default

### Step 4 — QR Code for Credential Offer → `frontend-issuer-verifier/src/components/CredentialForm.tsx`
- After successful issuance, show QR code with `credentialOfferUri`
- Use `qrcode.react` or similar lightweight library

## Files to Create/Modify (Phase B)

| File | Action | Description |
|------|--------|-------------|
| `frontend-issuer-verifier/src/components/CredentialForm.tsx` | Modify | SD claim checkboxes + QR |
| `backend/src/agents/issuer.agent.ts` | Modify | Accept sdClaims param |
| `backend/src/services/openid4vci.service.ts` | Modify | Override SD claims |
| `frontend-issuer-verifier/package.json` | Modify | Add qrcode.react dep |

---

## Phase C: Client-Side VP Flow (Todo 007)

### Step 1 — Add jose to Wallet → `web-wallet/package.json`
`npm install jose` for client-side JWT signing.

### Step 2 — Wallet Key Management → `web-wallet/src/services/crypto.service.ts`
- Generate Ed25519 key pair at wallet init (or import from agent)
- Store private key in sessionStorage (encrypted)
- Export `signJWT()`, `getPublicKey()`, `getDid()` functions

### Step 3 — Credential Matcher → `web-wallet/src/services/presentation.service.ts`
- Parse presentation_definition from authorization_request URI
- Match local credentials against `input_descriptors`
- Support both JWT-VC and SD-JWT credential matching
- For SD-JWT: determine which disclosures to include based on requested claims

### Step 4 — VP Token Builder → `web-wallet/src/services/presentation.service.ts`
- Build `vp_token` JWT with matched credentials
- Sign with wallet's private key using `jose.SignJWT`
- Handle SD-JWT selective disclosure (include only requested disclosures)

### Step 5 — Direct Post Submission → `web-wallet/src/services/presentation.service.ts`
- Submit VP token to `direct_post` endpoint
- Handle response (success/failure)

### Step 6 — UI: PresentCredential Enhancement → `web-wallet/src/pages/PresentCredential.tsx`
- After scanning QR / entering URI: show matched credentials
- Let user select which credential to present
- For SD-JWT: show claim checkboxes (which claims to disclose)
- Submit button → client-side VP flow
- Fallback to backend-driven flow if local signing fails

## Files to Create/Modify (Phase C)

| File | Action | Description |
|------|--------|-------------|
| `web-wallet/package.json` | Modify | Add jose dep |
| `web-wallet/src/services/crypto.service.ts` | Create | Key management + signing |
| `web-wallet/src/services/presentation.service.ts` | Create | Credential matching + VP token |
| `web-wallet/src/pages/PresentCredential.tsx` | Modify | Client-side VP UI |

---

## Validation

### Phase A
```bash
# Backend compile
cd backend && npx tsc --noEmit

# Test endpoints
curl http://localhost:3000/api/schemas
curl http://localhost:3000/api/schemas/AIAgentIdentityCredential
```

### Phase B
```bash
cd frontend-issuer-verifier && npx tsc --noEmit
# Issue SD-JWT credential with custom SD claims via UI
# Verify QR code renders with credential offer URI
```

### Phase C
```bash
cd web-wallet && npx tsc --noEmit
# Full flow: Verifier creates request → Wallet scans QR → Client-side VP → Verifier receives
```

## Risks

1. **Phase C complexity:** Client-side VP signing requires careful key management. Mitigate by keeping backend-driven flow as fallback.
2. **SD-JWT disclosure selection:** Matching presentation_definition fields to SD-JWT disclosures is non-trivial. Use existing `sdjwt.service.ts` parsing pattern from web-wallet.
3. **jose bundle size:** Adding `jose` to web-wallet increases bundle. Mitigate with tree-shaking (only import needed functions).
