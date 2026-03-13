---
title: "k6 Performance Test Framework"
date: 2026-03-13
module: backend
related_todos: [016]
---

## Problem
Need load testing for credential issuance and verification flows to measure p95/p99 latency and throughput before scaling tests.

## Solution

### k6 Test Structure (`backend/k6/`)
- `config.js` — shared config: base URL, auth headers, thresholds, stage profiles (smoke/load/stress/soak)
- `issuance.js` — full OpenID4VCI flow: DID resolve → offer → token → credential claim
- `verification.js` — OpenID4VP flow: create verification requests (identity/delegation/combined) + session poll
- `mixed-workload.js` — 60% issuance / 30% verification / 10% health+metrics (realistic production mix)
- `baseline.sh` — runs all scenarios with smoke profile, saves JSON results, prints summary table

### Key Patterns
- **Profile selection:** `K6_PROFILE` env var selects smoke/load/stress/soak stages
- **Custom metrics:** Trend (duration), Rate (errors), Counter (operations) per scenario
- **Auth:** API key via `X-API-Key` header (matches backend auth middleware)
- **Pre-auth code extraction:** Handles both draft 11 and 13+ field names for backward compat
- **Best-effort token exchange:** In mixed workload, token/poll failures don't fail the VU iteration

### Performance Thresholds (from project requirements)
| Metric | Min Accept | Target |
|--------|-----------|--------|
| p95 latency (single agent) | <2s | <1s |
| p99 latency (10K concurrent) | <5s | <3s |
| Error rate | <5% | <1% |

### Existing Infrastructure (pre-existing, not created here)
- Prometheus: `/metrics` endpoint with 18+ prom-client metrics
- Grafana: Auto-provisioned dashboard with PromQL queries
- AlertManager: 14 alert rules (latency, error rate, agent health)
- Docker: `docker-compose.monitoring.yml` for Prometheus + Grafana + AlertManager stack
