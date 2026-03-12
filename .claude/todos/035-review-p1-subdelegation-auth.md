---
id: 035
title: "Sub-delegation endpoint uses unauthenticated X-Delegator-Did header"
priority: critical
status: done
module: backend
created: 2026-03-12
source: review-029
---

## Problem
POST /delegations/:id/sub-delegate trusts `X-Delegator-Did` header for caller identity. Any client can spoof this and sub-delegate on behalf of any DID. Service-layer check only validates DID matches parent delegatee — not that caller controls that DID.

## Fix
Use authenticated identity (JWT sub claim or API key → DID mapping) instead of raw header. At minimum, require the delegation route to go through auth middleware that maps authenticated user to their DID.
