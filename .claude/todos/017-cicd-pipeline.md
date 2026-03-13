---
id: "017"
title: "CI/CD Pipeline"
status: done
priority: medium
category: infrastructure
wp: WP4
created: 2026-03-11
---

## Açıklama

GitHub Actions ile CI/CD pipeline. Automated testing, Docker image build, Kubernetes deployment.

## Gereksinimler

### CI (Continuous Integration)
- [x] GitHub Actions workflow — PR ve push'ta tetiklenir
- [x] TypeScript compile check (`tsc --noEmit`) — backend, web-wallet, frontend
- [x] Unit test çalıştırma (mevcut test suite)
- [x] Lint check (ESLint — varsa)
- [x] Docker image build test
- [x] Security test suite (3-round penetration tests)
- [x] Dependency audit (`npm audit --audit-level=high`)

### CD (Continuous Deployment)
- [x] Docker image build & push (GitHub Container Registry veya Docker Hub)
- [x] Kubernetes deployment automation (Kustomize + kubectl apply)
- [x] Staging environment auto-deploy (main branch push)
- [x] Production manual approval gate (workflow_dispatch + confirmation)

## Kabul Kriterleri

- [x] PR'larda otomatik CI çalışıyor
- [x] main push'ta Docker image build ediliyor
- [x] Staging'e otomatik deploy çalışıyor
