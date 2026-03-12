---
id: 034
title: "Add credential_id column to delegations table"
priority: critical
status: done
module: backend
created: 2026-03-12
source: review-029
---

## Problem
`delegation.service.ts` writes `UPDATE delegations SET credential_id = $2 WHERE id = $1` but the delegations table (migration v14) has no `credential_id` column. Runtime PostgreSQL error on every createDelegation/createSubDelegation when VC issuer is wired.

## Fix
Add new migration:
```sql
ALTER TABLE delegations ADD COLUMN credential_id VARCHAR(255);
```
