---
id: "039"
title: "HLF Integration P2 Review Fixes"
status: done
priority: medium
category: bugfix
created: 2026-03-12
---

## Findings

### 1. Negative limit/offset validation (fabric.routes.ts:52-53)
- `parseInt("-5") || 0` = `-5` → PostgreSQL `LIMIT -5` error
- Fix: `Math.max(0, parseInt(...) || 0)` for both limit and offset

### 2. Unhandled import() rejection in EventBus handlers (index.ts:215,237,253,276)
- `import('./services/fabricAnchor.service').then(...)` — if `import()` itself rejects, error is silently swallowed
- Fix: Add `.catch()` to outer `import().then(...).catch(err => logger.error(...))`

### 3. fabricAnchor.service.ts exceeds ~300L (416 lines)
- Gateway connection setup duplicated between `submitToFabric()` and `queryFabric()`
- Fix: Extract `connectToFabric()` helper (~30 lines saved, file under ~380L)
