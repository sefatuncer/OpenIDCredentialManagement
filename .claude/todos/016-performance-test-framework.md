---
id: "016"
title: "Performans Test Framework'ü"
status: pending
priority: medium
category: testing
wp: WP4
created: 2026-03-11
---

## Açıklama

k6/Locust ile performans testi, Prometheus ile metrik toplama, Grafana ile görselleştirme. Performans test sürümleri: v0.1 (Ay 6), v0.2 (Ay 9), v1.0 (Ay 12).

## Gereksinimler

- [ ] k6 veya Locust test senaryoları
  - [ ] Credential issuance flow (offer → token → credential)
  - [ ] Credential verification flow (authorization request → VP submit → verify)
  - [ ] Mixed workload (issuance + verification + revocation)
- [ ] Prometheus metrics endpoint (`/metrics`) — backend
- [ ] Grafana dashboard'lar
  - [ ] Request latency (p50, p95, p99)
  - [ ] Throughput (RPS)
  - [ ] Error rate
  - [ ] Database connection pool
- [ ] Baseline measurement script (otomatik çalıştır, sonuçları kaydet)
- [ ] Docker Compose'a Prometheus + Grafana servisleri

## Teknik Notlar

- k6 önerilen (JavaScript, CI/CD'ye entegre edilebilir)
- Prometheus Node.js client: `prom-client`
- Grafana provisioning: dashboard JSON dosyaları

## Performans Hedefleri (proje referansından)

| Metrik | Min Kabul | Hedef |
|--------|-----------|-------|
| p95 latency (tek ajan) | <2sn | <1sn |
| p99 latency (10K eşzamanlı) | <5sn | <3sn |
| SD disclosure overhead | <%20 | <%15 |

## Kabul Kriterleri

- [ ] k6 test senaryoları tüm ana flow'ları kapsıyor
- [ ] Prometheus metrikleri toplanıyor
- [ ] Grafana dashboard'da görselleştirme çalışıyor
- [ ] Baseline performans değerleri ölçülmüş
