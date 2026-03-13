---
title: "Credo-TS PRIMARY Migration — Jose Fallback Removal"
tags: [credo, askar, migration, jest, vitest, openid4vci, openid4vp, architecture]
category: architecture
difficulty: hard
date: 2026-03-13
---

## Problem
The backend had a dual-engine architecture: Jose PRIMARY + Credo OPTIONAL. Every OpenID4VCI/VP operation had an `isUsingCredo()` branch — doubling code paths (~2000 lines), creating test complexity, and making features diverge between engines.

## Approach
Thin wrapper strategy — Credo becomes the sole crypto/protocol engine while service layer preserves business logic. API contracts remain identical (no frontend changes needed).

### Migration Order
1. **Askar mandatory** — `checkAskarAvailability()` throws instead of returning false, `register-askar.js` exits on failure, Dockerfile verifies native binding
2. **Jest → Vitest** — Credo-TS is ESM-only; Jest's CJS mocking is incompatible. Vitest gives ESM-native `vi.mock()` with async factory support
3. **Service refactor** — Remove `isUsingCredo()` branches from `openid4vci.service.ts`, `openid4vp.service.ts`, `credo.service.ts`, `holder.agent.ts`
4. **Route consolidation** — Well-known endpoints prefer Credo metadata
5. **Client-side exception** — Browser (web-wallet) and React Native (mobile-wallet) keep Jose because Askar requires native bindings

### Key Decisions
- **Thin wrapper, not rewrite**: Service APIs unchanged, internal engine swapped
- **Client-side Jose stays**: Browser can't run Askar C++ bindings, Expo managed workflow can't load native modules without ejection
- **Production enforcement**: `CREDO_WALLET_KEY` required in production, dev fallback key with warning

## Key Details

### Files Changed (51 files, -8607 +4454 lines)
- `backend/src/services/credo.service.ts` — removed `usingCredo` variable and all guards
- `backend/src/agents/holder.agent.ts` — removed ~300 lines Jose fallback (503→207 lines)
- `backend/src/services/openid4vci.service.ts` — removed ~90 lines Jose credential offer creation
- `backend/src/services/openid4vp.service.ts` — removed ~120 lines Jose authorization request
- `backend/src/agents/credo.agent.ts` — `checkAskarAvailability()` throws, `initializeCredoAgent()` never returns null
- `backend/src/index.ts` — removed `isUsingCredo` conditional logging
- 6 Jest mock files deleted, 49 test files migrated Jest→Vitest

### Jest → Vitest Migration Patterns
| Jest | Vitest |
|------|--------|
| `jest.fn()` | `vi.fn()` |
| `jest.spyOn()` | `vi.spyOn()` |
| `jest.mock()` | `vi.mock()` |
| `jest.Mock` | `any` or `vi.Mock` |
| `jest.MockedFunction<T>` | `Mock` |
| `jest.requireMock()` | `vi.mocked(await import(...))` |
| `jest.setTimeout()` | `testTimeout` in vitest.config.ts |
| `require()` in beforeEach | `await import()` (async) |
| `jest.resetModules()` | `vi.resetModules()` |
| `namespace jest` custom matchers | `declare module 'vitest'` |

### Critical Vitest Gotchas
1. **`require()` incompatible** with `vi.resetModules()` — must use `await import()`
2. **`vi.mock()` factory** supports `async` (unlike Jest) — needed for `await vi.importActual()`
3. **`vi.hoisted()`** required when mock variables are referenced inside `vi.mock()` factory
4. **`globals: true`** in vitest.config.ts makes `vi`, `describe`, `it`, `expect` globally available

## Lessons Learned
- Bulk sed for test migration works for 90% of cases; remaining 10% needs manual async/import fixes
- `isUsingCredo()` branching created invisible feature drift — one engine would get new features, the other wouldn't
- Production wallet key enforcement should be added during migration, not after

## Prevention
- Never add dual-engine branching (`if (engine === 'A') {} else {}`) for core protocol operations
- If a native dependency is required, make it mandatory from day one with clear build instructions
- When migrating test frameworks, verify `require()` → `import()` conversion in files using `resetModules()`
