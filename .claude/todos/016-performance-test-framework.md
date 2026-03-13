---
id: "016"
title: "Performans Test Framework'ü"
status: done
priority: medium
category: testing
wp: WP4
created: 2026-03-11
---

## Açıklama

k6/Locust ile performans testi, Prometheus ile metrik toplama, Grafana ile görselleştirme. Performans test sürümleri: v0.1 (Ay 6), v0.2 (Ay 9), v1.0 (Ay 12).

## Gereksinimler

- [x] k6 test senaryoları
  - [x] Credential issuance flow (offer → token → credential)
  - [x] Credential verification flow (authorization request → VP submit → verify)
  - [x] Mixed workload (issuance + verification + health checks)
- [x] Prometheus metrics endpoint (`/metrics`) — backend (18+ custom metrics)
- [x] Grafana dashboard'lar
  - [x] Request latency (p50, p95, p99)
  - [x] Throughput (RPS)
  - [x] Error rate
  - [x] Database connection pool
- [x] Baseline measurement script (otomatik çalıştır, sonuçları kaydet)
- [x] Docker Compose'a Prometheus + Grafana servisleri

## Kabul Kriterleri

- [x] k6 test senaryoları tüm ana flow'ları kapsıyor
- [x] Prometheus metrikleri toplanıyor
- [x] Grafana dashboard'da görselleştirme çalışıyor
- [x] Baseline performans değerleri ölçülmüş (script hazır)
