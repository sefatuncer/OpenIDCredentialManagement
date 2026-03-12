---
id: "037"
title: "Mobile Wallet P1 Security Fixes"
status: done
completed: 2026-03-12
priority: critical
category: security
wp: WP2
created: 2026-03-12
---

## Açıklama

React Native mobile wallet (todo 023) review'ından çıkan P1 (CRITICAL) güvenlik bulguları.

## Bulgular

### 1. Empty clientSecret default — api.service.ts
- **Dosya:** `mobile-wallet/src/services/api.service.ts`
- **Sorun:** `clientSecret` boş string default ile unauthenticated API erişimi mümkün
- **Çözüm:** Env var yoksa hata fırlat veya build-time validation ekle

### 2. SSRF risk — vp.service.ts fetch(requestUri)
- **Dosya:** `mobile-wallet/src/services/vp.service.ts`
- **Sorun:** `fetchAuthorizationRequest()` kullanıcı tarafından sağlanan URI'yi doğrudan fetch ediyor, private IP kontrolü yok
- **Çözüm:** URL validation + allowlist/denylist (private IP blocking) ekle

### 3. No presentation_definition validation — vp.service.ts
- **Dosya:** `mobile-wallet/src/services/vp.service.ts`
- **Sorun:** `JSON.parse(pdParam)` sonucu Zod validation olmadan kullanılıyor
- **Çözüm:** Presentation definition için Zod schema tanımla ve validate et

## Kabul Kriterleri

- [ ] clientSecret boşken uygulamanın API çağrısı yapmaması
- [ ] fetch URI'lerinde private IP kontrolü
- [ ] Parsed presentation_definition Zod ile validate ediliyor
- [ ] TypeScript zero errors korunuyor
