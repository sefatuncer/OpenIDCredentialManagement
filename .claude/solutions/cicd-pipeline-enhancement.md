---
title: "CI/CD Pipeline Enhancement"
date: 2026-03-13
module: infrastructure
related_todos: [017]
---

## Problem
Existing CI/CD covered basic build/test/Docker but lacked security testing integration, dependency auditing, and staging/production deployment automation.

## Solution

### CI Enhancements (ci.yml)
1. **Security test job** — Separate `security-tests` job runs 3-round penetration test suite (102 tests) in parallel with main backend CI
2. **npm audit** — `--audit-level=high` with `continue-on-error: true` (reports but doesn't block on moderate)
3. **Lint enforcement** — Removed `|| true` from backend lint step
4. **TypeScript check** — Added explicit `tsc --noEmit` to frontend and wallet jobs
5. **Job-level env vars** — Security test job uses job-level `env:` block instead of duplicating per-step

### CD: Staging (deploy-staging.yml)
- **Trigger:** `workflow_run` after CI completes on main branch
- **Pattern:** Kustomize overlay (development) + `kustomize edit set image` with commit SHA
- **Gate:** `if: workflow_run.conclusion == 'success'` — only deploys if CI passes
- **Secret-guarded:** `kubectl apply` step only runs if `KUBE_CONFIG_STAGING` secret exists
- **SHA source:** Uses `github.event.workflow_run.head_sha` (not `github.sha` which is the workflow_run event SHA)

### CD: Production (deploy-production.yml)
- **Trigger:** Manual `workflow_dispatch` with image tag input
- **Double gate:** (1) Confirmation input must equal "deploy-production", (2) GitHub environment protection rules on `production` environment
- **Kustomize overlay:** Production overlay with higher replicas, resource limits, TLS

## Key Decisions
- Security tests as separate job (not step) for CI dashboard visibility and independent failure tracking
- `continue-on-error: true` on npm audit — blocks are too aggressive for transitive dependency vulns
- Manifest artifacts uploaded even without cluster access — useful for review/audit
- `workflow_run` trigger for staging instead of direct push trigger — ensures CI must pass first

## Pattern: workflow_run SHA Reference
When using `workflow_run` trigger, always use `github.event.workflow_run.head_sha` for the triggering commit's SHA. `github.sha` in a `workflow_run` context refers to the default branch head at event dispatch time, which may differ.
