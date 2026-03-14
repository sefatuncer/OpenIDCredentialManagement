---
title: "Service File Splitting — Thin Wrapper + Re-export Pattern"
tags: [architecture, modularity, refactoring, barrel-module, re-export]
category: architecture
difficulty: medium
date: 2026-03-14
---

## Problem
5 service/agent files exceeded the ~300L guideline (1151L, 819L, 723L, 716L, 670L), making code navigation and maintenance harder. Each file had multiple distinct concerns mixed together.

## Approach
Thin wrapper + re-export pattern: extract concern-based sub-modules while the original file becomes a barrel re-export. Zero consumer changes needed.

### Split Strategy
1. **Identify concern boundaries** — e.g., signing vs offers, verification vs session management
2. **Create sub-module files** — each sub-module owns a single concern
3. **Refactor original** — keeps types, metadata, config; re-exports everything from sub-modules
4. **Handle cross-module deps** — sub-modules can import from each other (no circular dep since all are function exports)

### Circular Dependency Avoidance
- **Types in barrel**: Keep shared types (interfaces) in the barrel module. Sub-modules import types from it.
- **Dependency injection for verification**: When verification module needs session storage from main, pass deps as function parameters instead of importing directly. Example: `handleDirectPost(vpToken, submission, state, { getSessionByState, getStorage })`.
- **Function-only exports**: CJS/ESM circular imports work at runtime for function exports since functions aren't called during module evaluation.
- **`require()` trap**: Don't use `require()` in function bodies for circular dep avoidance — it breaks in test environments. Use `import` at top-level instead.

## Key Details

### Files Created
| New File | Lines | Concern |
|----------|-------|---------|
| `openid4vci-signing.service.ts` | 491 | Signing, issuance, batch, deferred |
| `openid4vci-offers.service.ts` | 399 | Offer CRUD, token exchange, storage, cleanup |
| `openid4vp-verification.service.ts` | 262 | VP token verification, revocation checks |
| `didResolver-documents.service.ts` | 289 | DID document building (key, web, peer) |
| `sdjwt-verification.service.ts` | 259 | SD-JWT presentation verification |
| `credo-api.agent.ts` | 237 | Credo issuer/verifier/holder API wrappers |

### Files Modified (barrels)
| File | Before | After |
|------|--------|-------|
| `openid4vci.service.ts` | 1151L | 306L |
| `openid4vp.service.ts` | 819L | 446L |
| `didResolver.service.ts` | 716L | 387L |
| `sdjwt.service.ts` | 723L | 440L |
| `credo.agent.ts` | 670L | 408L |

### Class Splitting Pattern (sdjwt.service.ts)
When a class contains mixed creation/verification concerns:
1. Extract verification logic as standalone functions in a separate file
2. Class method (`verifyPresentation()`) delegates to the standalone function
3. Pass `parseSDJWT.bind(this)` to give the standalone function access to class methods it needs

## Lessons Learned
- `require()` inside function bodies fails in Vitest test environment — use top-level `import` even for potential circular deps
- Classes are harder to split than standalone functions. Prefer function-based service APIs for better decomposability
- PRESENTATION_DEFINITIONS constants (~180 lines of config data) inflate file sizes but are acceptable since they're pure data
- Dependency injection via function parameters is the cleanest way to avoid circular deps between sub-modules

## Prevention
- Monitor file sizes regularly — split at ~300L before complexity grows
- New features should be added in concern-specific sub-modules, not the barrel
- When adding a new credential type, add to `SD_CLAIMS_BY_TYPE` in signing module and `PRESENTATION_DEFINITIONS` in VP service
