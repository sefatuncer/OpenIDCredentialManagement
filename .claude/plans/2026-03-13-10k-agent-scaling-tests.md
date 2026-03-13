---
title: "10K+ Agent Scaling Tests"
date: 2026-03-13
module: backend
related_todos: [018]
---

## Goal
Create k6 scaling test scenarios for 10K+ concurrent agents with bottleneck analysis, SD-JWT overhead measurement, and horizontal scaling validation.

## Research Findings
- k6 test framework created in todo 016 (config.js, issuance.js, verification.js, mixed-workload.js)
- Existing k6 stages go up to 100 VUs (stress profile) — need 10K VU profile
- Prometheus metrics already track all key indicators (latency, throughput, errors, DB pools)
- SD-JWT issuance uses `vc+sd-jwt` format via `_sdjwt` config ID convention

## Implementation Steps

1. Create `backend/k6/scaling-10k.js` — progressive ramp-up to 10K VUs with mixed workload
2. Create `backend/k6/sd-jwt-overhead.js` — compare jwt_vc_json vs vc+sd-jwt issuance latency
3. Create `backend/k6/horizontal-scaling.js` — parameterized test for 1→2→4→8 pod throughput measurement
4. Update `backend/k6/config.js` — add scaling stage profiles

## Files to Create/Modify
| File | Action | Description |
|------|--------|-------------|
| `backend/k6/scaling-10k.js` | Create | 10K VU ramp-up test with bottleneck markers |
| `backend/k6/sd-jwt-overhead.js` | Create | JWT vs SD-JWT format comparison |
| `backend/k6/horizontal-scaling.js` | Create | Multi-pod throughput scaling test |
| `backend/k6/config.js` | Modify | Add scaling stage profiles |
