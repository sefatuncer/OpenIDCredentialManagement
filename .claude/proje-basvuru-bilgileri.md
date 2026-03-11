# Teknik İş Kapsamı Referansı

## 1. Proje Hedefi

AI ajanları için W3C DID/VC ve OpenID4VC standartlarına dayalı güvenli kimlik doğrulama ve yetki devri (delegation) sistemi geliştirmek. Sistem; credential issuance (OpenID4VCI), credential presentation (OpenID4VP), gerçek zamanlı revocation ve Hyperledger Fabric üzerinde immutable audit trail sağlayacak. Hedef: 10.000+ eşzamanlı ajan senaryosunda p99 <3sn.

## 2. Mimari Katmanlar

| Katman | Sorumluluk | Teknoloji |
|--------|-----------|-----------|
| **DID** | Merkezsiz tanımlayıcı yönetimi | did:key (dev), did:web (prod), did:peer (A2A) |
| **Credential** | SD-JWT VC credential lifecycle | Jose (PRIMARY) + Credo-TS (OPTIONAL) |
| **Protokol** | Credential alışverişi ve ajan iletişimi | OpenID4VCI 1.0, OpenID4VP 1.0, DIDComm v1 |
| **Güvenlik** | Yetkilendirme, revocation, audit | OPA/Cerbos, StatusList2021 + webhook, DID-based attribution |
| **Blockchain** | İmmutable anchor (sadece hash) | Hyperledger Fabric (2 org, 4 peer, Raft) |

## 3. Teknoloji Kararları

- **Jose PRIMARY + Credo OPTIONAL:** Native modül bağımlılığı olmadan çalışabilirlik. Credo runtime'da Askar varlığına göre aktive olur. Bkz: `.claude/solutions/jose-primary-credo-optional.md`
- **Credo-TS v0.6.x:** OID4VCI + OID4VP + DIDComm desteği tek framework'te. OWF bünyesinde, Apache 2.0.
- **Hyperledger Fabric:** Veritabanı olarak değil, revocation ve delegation chain hash'lerinin immutable anchor'ı olarak. Minimal on-chain veri.
- **SD-JWT VC:** eIDAS 2.0 / EUDI ARF uyumlu credential formatı. Selective disclosure desteği.

## 4. Credential Tipleri ve Şemaları

| Tip | Amaç | Önemli Alanlar |
|-----|------|----------------|
| **Agent Identity** | AI ajanının DID-tabanlı kimliği | did, publicKey, agentType, capabilities |
| **Delegation** | Yetki devri (scope-limited) | delegator, delegatee, scope, constraints, maxAmount, allowedServices, ttl |
| **Capability** | Yetenek belgesi | holder, capability, constraints |

Tüm credential'lar SD-JWT VC formatında, selective disclosure ile. Revocation: StatusList2021 + webhook hybrid.

## 5. İş Paketleri — Teknik Aktiviteler

### WP1: Analiz ve Mimari Tasarım (Ay 1-3)
- Credo PoC: OpenID4VC entegrasyon testi, DIDComm performans değerlendirmesi, React Native uyumluluk
- HLF mimari tasarımı: 2 org, 4 peer, RevocationAnchor + DelegationChain chaincode spesifikasyonu
- Performans baseline tanımları, test altyapısı kurulumu
- **Çıktı:** Mimari doküman, PoC implementasyonu, baseline performans değerleri

### WP2: Temel Geliştirme (Ay 4-6)
- Agent, Delegation, Capability credential şema implementasyonu
- Credo framework entegrasyonu (DIDComm + OID4VC hibrit)
- Temel credential issuance/verification işlemleri
- **Çıktı:** Alfa prototip, credential şemaları, Credo entegrasyon modülü

### WP3: İleri Geliştirme + Blockchain (Ay 7-12)
- OpenID4VCI/VP protokol implementasyonu (AI ajan iş yükü optimizasyonu)
- OAuth 2.0 bridge adapter (VC ↔ OAuth token dönüşümü)
- RevocationAnchor ve DelegationChain chaincode geliştirme
- Credo-HLF adapter modülü
- Optimizasyon, stabilizasyon, beta prototip
- **Çıktı:** Beta prototip, HLF chaincode'lar, OAuth bridge

### WP4: Test Altyapısı (Ay 4-12, WP2/WP3 ile paralel)
- Kubernetes test altyapısı
- Performans test framework'ü (k6, Locust, Prometheus, Grafana)
- CI/CD pipeline (GitHub Actions + ArgoCD)
- Performans testi sürümleri: v0.1 (Ay 6), v0.2 (Ay 9), v1.0 (Ay 12)
- **Çıktı:** Test framework'ü, CI/CD pipeline, performans raporları

### WP5: Deneysel Değerlendirme + Güvenlik (Ay 13-16)
- Sistematik performans testleri (tüm hipotezler)
- HLF TPS testleri, on-chain vs off-chain latency karşılaştırması
- STRIDE threat modeling, OWASP Agentic AI Top 10 uyum kontrolü
- Penetration test (3 tur: Alfa/Beta/Final)
- **Çıktı:** Performans sonuçları, güvenlik denetim raporu

### WP6: Finalizasyon (Ay 17-18)
- SDK ve API dokümantasyonu
- Akademik yayın (2+ peer-reviewed)
- Demo uygulamalar
- **Çıktı:** Agent Identity SDK, API docs, yayınlar

## 6. Kilometre Taşları ve Kabul Kriterleri

| MS | Ay | Hedef | Kabul Kriterleri |
|----|-----|-------|-----------------|
| MS1 | 3 | Mimari + baseline | Credo PoC çalışıyor, performans baseline tanımlı, HLF mimari dokümanı hazır |
| MS2 | 6 | Alfa prototip | Credential issuance/verification çalışıyor, perf test v0.1 tamamlanmış (TRL 3→4) |
| MS3 | 12 | Beta prototip | OpenID4VC tam entegrasyon, HLF chaincode'lar çalışıyor, perf test v1.0 (TRL 4→5) |
| MS4 | 16 | Deneysel sonuçlar | p95 <1sn (tek ajan), p99 <3sn (10K ajan), güvenlik raporu tamamlanmış (TRL 5→6) |
| MS5 | 18 | Nihai çıktılar | SDK, dokümantasyon, akademik yayınlar teslim edilmiş |

## 7. Performans Hedefleri

| Metrik | Minimum Kabul | Hedef | Ölçüm |
|--------|---------------|-------|-------|
| p95 latency (tek ajan) | <2sn | <1sn | k6/Locust |
| p99 latency (10K eşzamanlı) | <5sn | <3sn | Yatay ölçekleme testi |
| SD disclosure overhead | <%20 | <%15 | Karşılaştırmalı test |
| Revocation propagation | <2dk | <1dk | StatusList + webhook |
| Kritik güvenlik açığı | 0 | 0 | Penetration test |
| OWASP Agentic Top 10 kapsamı | %90 | %100 | Checklist |
| Tenant izolasyon sızıntısı | 0 | 0 | Fuzzing + izolasyon testi |

## 8. Çözülecek Teknik Problemler

1. **DIDComm + OpenID4VC Hibrit Entegrasyon:** DIDComm (A2A) ve OpenID4VC (web servisleri) aynı sistemde sorunsuz çalışmalı. Protokol geçişleri ve message routing tasarlanacak.

2. **Gerçek Zamanlı Revocation:** StatusList2021 polling-based. <1dk propagation için webhook push notification hibrit yaklaşımı gerekli.

3. **Multi-tenant Credential İzolasyonu:** SaaS senaryolarında kiracılar arası kriptografik izolasyon. Penetration test ile doğrulama.

4. **OAuth 2.0 Bridge:** Mevcut OAuth/OIDC sistemlerle entegrasyon için VC ↔ OAuth token dönüşüm bridge adapter'ı.

## 9. Ar-Ge Belirsizlikleri

1. **Optimal TTL Aralığı:** Delegation credential'lar için kısa TTL (revocation yükü ↓, renewal yükü ↑) vs uzun TTL (güvenlik penceresi riski ↑) trade-off'u. Parametrik analiz gerekli.

2. **10K+ Ajan Ölçekleme Davranışı:** Performans düşüşü linear mı, logaritmik mi, exponential mi? Darboğaz noktaları hangi bileşenlerde? Yatay ölçekleme deneyleriyle belirlenecek.

3. **Cloud HSM Latency Overhead:** Cloud HSM operasyonlarının credential işlemlerine eklediği gecikme. Farklı cloud provider'lar arası karşılaştırma.

4. **HLF Anchor Performansı:** Minimal anchor yaklaşımının gerçek TPS'i ve on-chain vs off-chain latency farkı.

## 10. Mevcut Durum — Tamamlanan ve Bekleyen İşler

### Tamamlanan (Kodda Mevcut)
- [x] Backend API (Express + TypeScript)
- [x] OpenID4VCI implementation (Draft 13+ uyumlu)
- [x] OpenID4VP implementation (Draft 13+ uyumlu, backend-driven flow)
- [x] DID management (did:key, did:web, did:peer)
- [x] SD-JWT service + selective disclosure UI
- [x] Revocation service (StatusList2021)
- [x] Trust registry + audit logging
- [x] Credo-TS entegrasyonu (v0.6.3, Jose PRIMARY/Credo OPTIONAL)
- [x] Web Wallet (React + Vite) — QR scanner, credential presentation
- [x] Issuer/Verifier Dashboard (React + Vite)
- [x] PostgreSQL persistence (kısmen — 17 migration, kritik servisler tamam)
- [x] Docker Compose dev ortamı (4 servis)
- [x] Nonce management, rate limiting, EdDSA signing

### Tamamlanan Todo'lar

| Todo | Açıklama | WP | Tarih |
|------|----------|----|-------|
| 006 | OpenID4VP wallet integration (QR scan, backend-driven VP) | WP2 | 2026-03-11 |
| 008 | VP flow unification (thin wrapper pattern) | WP3 | 2026-03-11 |

### Bekleyen Todo'lar → WP Eşleşmesi

#### WP1: Hızlı Analiz ve Mimari Tasarım (Ay 1-3)
| Todo | Açıklama | Öncelik | Bağımlılık |
|------|----------|---------|------------|
| 025 | Cloud HSM performans karakterizasyonu (ön değerlendirme) | Medium | — |

#### WP2: Temel Geliştirme — Alfa Prototip (Ay 4-6)
| Todo | Açıklama | Öncelik | Bağımlılık |
|------|----------|---------|------------|
| 001 | Batch credential issuance (backend + frontend) | High | — |
| 002 | PostgreSQL — kalan Map-based servisler (issuer.agent) | High | — |
| 009 | SD-JWT VC format migration (jwt_vc_json → vc+sd-jwt) | High | — |
| 010 | Credential schema registry (dinamik credential tipleri) | Medium | — |
| 005 | Issuer SD-JWT credential form (dynamic schema, QR offer) | Medium | 009, 010 |
| 007 | Client-side VP flow (wallet-only credential presentation) | Medium | 006 |
| 023 | React Native mobil wallet (iOS/Android, insan + AI ajan sahibi) | High | — |

#### WP3: İleri Geliştirme + Blockchain — Beta Prototip (Ay 7-12)
| Todo | Açıklama | Öncelik | Bağımlılık |
|------|----------|---------|------------|
| 011 | Hyperledger Fabric entegrasyonu (RevocationAnchor + DelegationChain) | High | 002 |
| 012 | OAuth 2.0 bridge adapter (VC ↔ OAuth token exchange) | Medium | 009 |
| 013 | DIDComm v1/v2 entegrasyonu (A2A messaging + v2 değerlendirme) | Medium | — |
| 014 | Multi-tenant credential izolasyonu (@credo-ts/tenants + K8s) | Medium | 002 |
| 015 | Gerçek zamanlı revocation (webhook push notification) | Medium | — |
| 024 | OPA/Cerbos fine-grained authorization (policy engine) | Medium | — |

#### WP4: Test Altyapısı (Ay 4-6, 9-12 — WP2/WP3 ile Paralel)
| Todo | Açıklama | Öncelik | Bağımlılık |
|------|----------|---------|------------|
| 003 | Docker/Kubernetes deployment (multi-stage builds, K8s, HPA) | Medium | 002 |
| 004 | Production setup (HTTPS, secret management, Redis) | Medium | 002, 003 |
| 016 | Performans test framework'ü (k6/Locust/Prometheus/Grafana) | Medium | 003 |
| 017 | CI/CD pipeline (GitHub Actions + ArgoCD) | Medium | 003 |

#### WP5: Deneysel Değerlendirme + Güvenlik (Ay 13-16)
| Todo | Açıklama | Öncelik | Bağımlılık |
|------|----------|---------|------------|
| 018 | 10K+ eşzamanlı ajan ölçekleme testleri | High | 016, 003 |
| 019 | Penetration test + güvenlik denetimi (STRIDE, OWASP Agentic AI Top 10) | High | 014 |
| 025 | Cloud HSM performans karakterizasyonu (kapsamlı analiz) | Medium | — |

#### WP6: Finalizasyon (Ay 17-18)
| Todo | Açıklama | Öncelik | Bağımlılık |
|------|----------|---------|------------|
| 020 | Agent Identity SDK paketleme (tam yaşam döngüsü, npm + REST API) | Medium | 012, 013, 015 |
| 021 | API dokümantasyonu + referans mimari raporu (OpenAPI, TypeDoc, CC BY 4.0) | Medium | — |
| 026 | Demo uygulamalar (ödeme ajanı, kurumsal asistan, çok kiracılı SaaS) | Medium | 012, 014 |
| 027 | Akademik yayınlar (2+ hakemli, arXiv ön baskı + ana makale) | Medium | 018 |
| 028 | Patent başvuruları (2 ulusal + PCT hazırlık) | Low | — |
