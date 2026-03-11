---
id: "018"
title: "10K+ Eşzamanlı Ajan Ölçekleme Testleri"
status: pending
priority: high
category: testing
wp: WP5
created: 2026-03-11
depends_on: ["016", "003"]
---

## Açıklama

10.000+ eşzamanlı ajan senaryosunda sistematik performans testleri. Darboğaz analizi ve yatay ölçekleme doğrulaması.

## Gereksinimler

- [ ] 10K eşzamanlı ajan simülasyonu (k6/Locust)
- [ ] Yatay ölçekleme testi (1 → 2 → 4 → 8 pod)
- [ ] Darboğaz analizi (CPU, memory, DB connections, network)
- [ ] Performans düşüş grafiği (linear/logarithmic/exponential)
- [ ] HLF anchor performans testi (on-chain vs off-chain latency)
- [ ] SD-JWT disclosure overhead ölçümü

## Performans Hedefleri

| Metrik | Min Kabul | Hedef |
|--------|-----------|-------|
| p95 latency (tek ajan) | <2sn | <1sn |
| p99 latency (10K eşzamanlı) | <5sn | <3sn |
| SD disclosure overhead | <%20 | <%15 |
| Revocation propagation | <2dk | <1dk |

## Kabul Kriterleri

- [ ] p99 <3sn (10K eşzamanlı ajan)
- [ ] Performans düşüş karakteristiği belirlenmiş
- [ ] Darboğaz noktaları raporlanmış
- [ ] Yatay ölçekleme ile lineer throughput artışı gösterilmiş
