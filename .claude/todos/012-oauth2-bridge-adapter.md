---
id: "012"
title: "OAuth 2.0 Bridge Adapter"
status: pending
priority: medium
category: feature
wp: WP3
created: 2026-03-11
---

## Açıklama

Mevcut OAuth/OIDC sistemlerle entegrasyon için VC ↔ OAuth token dönüşüm bridge adapter'ı. AI ajanlarının mevcut OAuth 2.0 korumalı API'lere erişebilmesi için credential → OAuth token dönüşümü.

## Gereksinimler

- [ ] `oauth-bridge.service.ts` — VC → OAuth token exchange
- [ ] Token exchange endpoint (`POST /oauth/token-exchange`)
- [ ] VC doğrulama → scope mapping → OAuth access token üretimi
- [ ] Reverse flow: OAuth token → VC claim verification
- [ ] Configurable scope mapping (credential type → OAuth scopes)
- [ ] Token introspection endpoint

## Teknik Notlar

- RFC 8693 (Token Exchange) uyumlu
- Credential'daki `capabilities` ve `scope` alanları OAuth scope'larına map'lenir
- Bridge token'lar kısa TTL (5-15dk)
- Rate limiting ayrı olmalı (auth endpoint)

## Kabul Kriterleri

- [ ] VC ile OAuth token alınabiliyor
- [ ] Scope mapping doğru çalışıyor
- [ ] Token introspection çalışıyor
- [ ] Expired/revoked credential ile token alınamıyor
