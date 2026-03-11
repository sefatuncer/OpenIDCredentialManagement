---
id: "011"
title: "Hyperledger Fabric Entegrasyonu"
status: pending
priority: high
category: feature
wp: WP3
created: 2026-03-11
---

## Açıklama

Revocation ve delegation chain hash'lerinin Hyperledger Fabric üzerinde immutable anchor olarak saklanması. HLF veritabanı olarak değil, sadece hash anchor olarak kullanılacak (minimal on-chain veri).

## Gereksinimler

### Altyapı
- [ ] HLF network kurulumu: 2 org, 4 peer, Raft orderer
- [ ] Docker Compose dev ortamı (HLF peers + orderer + CA)
- [ ] Fabric SDK entegrasyonu (`fabric-network` veya `fabric-gateway`)

### Chaincode
- [ ] RevocationAnchor chaincode — revocation event hash'lerini anchor'lar
- [ ] DelegationChain chaincode — delegation zinciri hash'lerini anchor'lar
- [ ] Chaincode unit testleri

### Backend Adapter
- [ ] `hlf.service.ts` — Fabric gateway connection, chaincode invoke
- [ ] `revocation.service.ts` entegrasyonu — revoke event'lerinde HLF'ye hash yazma
- [ ] `delegation` entegrasyonu — delegation oluşturma/iptalinde HLF'ye hash yazma
- [ ] HLF bağlantı yoksa graceful fallback (offline çalışma)

## Teknik Notlar

- On-chain veri: sadece SHA-256 hash + timestamp + event type
- Credential içeriği ASLA on-chain'de saklanmaz
- Fabric Gateway API (v2.5+) kullanılacak
- Connection profile: `connection-org1.json`, `connection-org2.json`

## Kabul Kriterleri

- [ ] Revocation event'leri HLF'de anchor'lanıyor
- [ ] Delegation chain hash'leri HLF'de anchor'lanıyor
- [ ] HLF kapalıyken sistem çalışmaya devam ediyor (graceful degradation)
- [ ] Anchor doğrulama API'si mevcut
