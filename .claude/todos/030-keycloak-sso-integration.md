---
id: "030"
title: "Keycloak OAuth2/OIDC SSO + VC-Based Machine Authentication"
status: done
priority: medium
category: security
wp: WP2-WP3
created: 2026-03-12
---

## Aciklama

Keycloak entegrasyonu ile OAuth2/OIDC SSO kimlik dogrulama ve VC tabanli makine kimlik dogrulama. Mevcut basit API key + JWT mekanizmasinin yanina kurumsal SSO katmani eklenmesi.

## Gereksinimler

### Keycloak Kurulumu
- [ ] Keycloak Docker Compose servisi eklenmesi (dev ortami)
- [ ] Realm konfigurasyonu — SSI system realm
- [ ] Client registration — backend API, frontend, web wallet
- [ ] Role tanimlari — issuer, verifier, holder, admin

### Backend Entegrasyonu
- [ ] Keycloak OIDC discovery endpoint cozumlemesi
- [ ] JWT token dogrulama middleware — Keycloak issuer desteyi
- [ ] Mevcut API key auth ile birlikte calisma (dual auth)
- [ ] VC-based machine auth — AI ajan credential'i ile kimlik dogrulama
- [ ] Token introspection endpoint entegrasyonu

### Frontend Entegrasyonu
- [ ] Keycloak JS adapter entegrasyonu (issuer/verifier dashboard)
- [ ] SSO login/logout flow
- [ ] Token refresh mekanizmasi
- [ ] Role-based UI rendering (issuer vs verifier vs admin)

### Web Wallet
- [ ] Keycloak login desteyi (opsiyonel — wallet kendi DID-based auth'u da kullanabilir)

## Teknik Notlar

- Keycloak v24+ (Quarkus-based)
- OIDC Discovery: `/.well-known/openid-configuration`
- Backend: `keycloak-connect` veya pure jose JWT dogrulama
- OAuth 2.0 bridge adapter (todo 012) ile entegre calisacak — VC<->OAuth token donusumu
- Mevcut auth middleware genisletilecek, kirici degisiklik yapilmayacak

## Kabul Kriterleri

- [ ] Keycloak uzerinden SSO login/logout calisiyor
- [ ] Backend hem API key hem Keycloak JWT kabul ediyor
- [ ] Role-based erisim kontrolu calisiyor
- [ ] AI ajan VC ile machine auth yapabiliyor
