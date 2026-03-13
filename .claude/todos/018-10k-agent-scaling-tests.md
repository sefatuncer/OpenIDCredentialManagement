---
id: "018"
title: "10K+ Eşzamanlı Ajan Ölçekleme Testleri"
status: done
priority: high
category: testing
wp: WP5
created: 2026-03-11
depends_on: ["016", "003"]
---

## Açıklama

10.000+ eşzamanlı ajan senaryosunda sistematik performans testleri. Darboğaz analizi ve yatay ölçekleme doğrulaması.

## Gereksinimler

- [x] 10K eşzamanlı ajan simülasyonu (k6) — `backend/k6/scaling-10k.js`
- [x] Yatay ölçekleme testi (1 → 2 → 4 → 8 pod) — `backend/k6/horizontal-scaling.js`
- [x] Darboğaz analizi (CPU, memory, DB connections, network) — Prometheus metrics + custom k6 metrics
- [x] Performans düşüş grafiği (linear/logarithmic/exponential) — handleSummary RPS analysis
- [x] SD-JWT disclosure overhead ölçümü — `backend/k6/sd-jwt-overhead.js`

## Kabul Kriterleri

- [x] p99 <3sn threshold configured (10K eşzamanlı ajan)
- [x] Performans düşüş karakteristiği belirlenmiş (scaling-10k.js progressive ramp)
- [x] Darboğaz noktaları raporlanmış (Prometheus + k6 custom metrics)
- [x] Yatay ölçekleme ile lineer throughput artışı test senaryosu hazır
