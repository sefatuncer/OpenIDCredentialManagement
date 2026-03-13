---
id: "003"
title: "Docker/Kubernetes Deployment"
status: done
priority: medium
category: infrastructure
wp: WP4
created: 2026-03-09
depends_on: ["002"]
---

## Açıklama

Production-ready container ve orchestration yapılandırması.

## Gereksinimler

### Docker
- [x] Backend Dockerfile optimizasyonu (multi-stage build) — `backend/docker/Dockerfile`
- [x] Web-wallet Dockerfile (nginx static serve) — `web-wallet/Dockerfile`
- [x] Frontend-issuer-verifier Dockerfile — `frontend-issuer-verifier/Dockerfile`
- [x] docker-compose.prod.yml (production) — `docker-compose.prod.yml`

### Kubernetes
- [x] Namespace yapılandırması — `backend/k8s/base/namespace.yaml`
- [x] Backend Deployment + Service — `backend/k8s/base/api-gateway.yaml`
- [x] Frontend Deployments + Services — `backend/k8s/base/issuer-verifier.yaml`, `web-wallet.yaml`
- [x] PostgreSQL StatefulSet — `backend/k8s/base/postgres.yaml`
- [x] ConfigMaps ve Secrets — `backend/k8s/base/configmap.yaml`, `secret.yaml`
- [x] Ingress yapılandırması (TLS termination) — `backend/k8s/base/ingress.yaml`
- [x] HorizontalPodAutoscaler (HPA) — Kustomize overlays (dev: min 1, prod: min 3/max 20)
- [x] Health/Readiness probes — Docker health checks + K8s probes

### Monitoring
- [x] Prometheus metrics endpoint — `backend/src/services/metrics.service.ts` + `/metrics` route
- [x] Grafana dashboards — `backend/docker/grafana/dashboards/ai-agent-monitoring.json`
- [x] Alert rules — `backend/docker/prometheus/alerts.yml` (14 rules)

## Kabul Kriterleri

- [x] `docker-compose up` ile tüm servisler ayağa kalkıyor (prod config)
- [x] K8s cluster'a deploy edilebilir (Kustomize base + overlays)
- [x] Zero-downtime deployment mümkün (rolling update + HPA)
- [x] HPA ile otomatik ölçekleme çalışıyor
