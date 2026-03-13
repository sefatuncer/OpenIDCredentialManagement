---
title: "CI/CD Pipeline Enhancement"
date: 2026-03-13
module: all
related_todos: [017]
---

## Goal
Enhance existing CI/CD workflows with security testing, dependency audit, staging deployment, and production approval gate.

## Research Findings
- **ci.yml** already covers: backend (PostgreSQL, typecheck, lint, test, build), frontend (test, build), wallet (test, build)
- **docker.yml** already covers: 3-image GHCR push with Buildx cache, semver tags
- **K8s configs** exist: Kustomize base + overlays (development, production)
- **Gaps identified:**
  1. Security tests (`tests/security/`) not separated — run inside `npm test` but need Credo ESM mocks
  2. No `npm audit` step (P1 from STRIDE threat matrix)
  3. No staging deployment workflow
  4. No production manual approval gate
  5. Frontend/wallet lint `|| true` — failures silently ignored
  6. No dependency caching optimization for frontends

## Implementation Steps

### Step 1: Enhance ci.yml — security test job + npm audit
- Add `security-tests` job (runs after backend job, uses same PostgreSQL service)
- Add `npm audit --audit-level=high` step to backend job
- Remove `|| true` from lint step (make lint failures break CI)
- Add `tsc` step to frontend and wallet jobs (already in their `build` script but explicit check is clearer)

### Step 2: Add deploy-staging.yml workflow
- Triggers on push to main (after CI passes)
- Uses Kustomize with development overlay
- Deploys to staging namespace via `kubectl apply -k`
- Requires CI workflow to pass first (`workflow_run` trigger)

### Step 3: Add deploy-production.yml workflow
- Manual trigger (`workflow_dispatch`) with environment protection
- Uses Kustomize with production overlay
- Requires approval via GitHub environment protection rules
- Deploys to production namespace

## Files to Create/Modify
| File | Action | Description |
|------|--------|-------------|
| `.github/workflows/ci.yml` | Modify | Add security-tests job, npm audit, fix lint |
| `.github/workflows/deploy-staging.yml` | Create | Staging auto-deploy on main push |
| `.github/workflows/deploy-production.yml` | Create | Production deploy with manual approval |

## Validation
- `yamllint` or manual review of workflow syntax
- GitHub Actions workflow syntax validation
- All jobs reference correct paths and scripts

## Risks
- `npm audit` may fail on known vulnerabilities in transitive deps → use `--audit-level=high` to only fail on high/critical
- K8s deploy requires cluster access secrets → document required secrets in workflow
