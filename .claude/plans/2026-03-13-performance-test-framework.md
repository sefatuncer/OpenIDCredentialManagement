---
title: "Performance Test Framework — k6 Load Tests"
date: 2026-03-13
module: backend
related_todos: [016]
---

## Goal
Add k6 load test scenarios for credential issuance, verification, and mixed workloads, plus a baseline measurement script.

## Research Findings
- Prometheus + Grafana + AlertManager already configured in `backend/docker/docker-compose.monitoring.yml`
- `/metrics` endpoint with 18+ custom prom-client metrics already implemented
- Grafana dashboard with PromQL queries already provisioned
- No k6 tests exist yet
- Backend runs on port 3000, PostgreSQL on 5432

## Implementation Steps

1. Create `backend/k6/` directory with test scenarios
2. `issuance.js` — credential issuance flow (auth → create offer → fetch credential)
3. `verification.js` — verification flow (auth → create auth request → submit VP)
4. `mixed-workload.js` — combined issuance + verification + revocation
5. `config.js` — shared configuration (base URL, thresholds, auth helper)
6. `baseline.sh` — script that runs all scenarios and saves results to JSON

## Files to Create
| File | Action | Description |
|------|--------|-------------|
| `backend/k6/config.js` | Create | Shared config, auth helper, thresholds |
| `backend/k6/issuance.js` | Create | Credential issuance load test |
| `backend/k6/verification.js` | Create | Credential verification load test |
| `backend/k6/mixed-workload.js` | Create | Combined workload test |
| `backend/k6/baseline.sh` | Create | Baseline measurement runner |

## Validation
- k6 syntax check: `k6 inspect backend/k6/issuance.js`
- Manual run: `k6 run --vus 1 --duration 10s backend/k6/issuance.js`
