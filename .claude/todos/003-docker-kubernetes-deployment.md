---
id: "003"
title: "Docker/Kubernetes Deployment"
status: pending
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
- [ ] Backend Dockerfile optimizasyonu (multi-stage build)
- [ ] Web-wallet Dockerfile (nginx static serve)
- [ ] Frontend-issuer-verifier Dockerfile
- [ ] docker-compose.prod.yml (production)

### Kubernetes
- [ ] Namespace yapılandırması
- [ ] Backend Deployment + Service
- [ ] Frontend Deployments + Services
- [ ] PostgreSQL StatefulSet
- [ ] ConfigMaps ve Secrets
- [ ] Ingress yapılandırması (TLS termination)
- [ ] HorizontalPodAutoscaler (HPA)
- [ ] Health/Readiness probes

### Monitoring
- [ ] Prometheus metrics endpoint
- [ ] Grafana dashboards
- [ ] Alert rules

## Kabul Kriterleri

- [ ] `docker-compose up` ile tüm servisler ayağa kalkıyor (prod config)
- [ ] K8s cluster'a deploy edilebilir
- [ ] Zero-downtime deployment mümkün
- [ ] HPA ile otomatik ölçekleme çalışıyor
