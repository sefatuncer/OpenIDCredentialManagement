---
id: "038"
title: "Mobile Wallet P2 Security & Architecture Fixes"
status: pending
priority: high
category: security
wp: WP2
created: 2026-03-12
---

## Açıklama

React Native mobile wallet (todo 023) review'ından çıkan P2 (IMPORTANT) bulguları.

## Bulgular

### 1. No envelope encryption for private JWK — wallet-key.service.ts
- **Dosya:** `mobile-wallet/src/services/wallet-key.service.ts`
- **Sorun:** Private key JWK expo-secure-store'da plaintext saklanıyor
- **Çözüm:** AES-GCM-256 ile şifrele (web-wallet client-side-vp-flow pattern'i referans)

### 2. Token cached without TTL — api.service.ts
- **Dosya:** `mobile-wallet/src/services/api.service.ts`
- **Sorun:** Auth token'ı TTL olmadan cache'leniyor, sadece 401'de yenileniyor
- **Çözüm:** Token expiry parse et, expire olmadan önce proaktif refresh ekle

### 3. DelegationsScreen exceeds 300L — DelegationsScreen.tsx
- **Dosya:** `mobile-wallet/src/screens/DelegationsScreen.tsx`
- **Sorun:** ~300L guideline'ını aşıyor
- **Çözüm:** Create delegation modal'ı ayrı component'e çıkar

### 4. Credential matching ignores nested paths — vp.service.ts
- **Dosya:** `mobile-wallet/src/services/vp.service.ts`
- **Sorun:** `matchCredentials()` sadece type array'e bakıyor, nested path + filter constraint'leri ignore ediyor
- **Çözüm:** Presentation definition field matching genişlet

### 5. useWebSocket empty deps — useWebSocket.ts
- **Dosya:** `mobile-wallet/src/hooks/useWebSocket.ts`
- **Sorun:** `useCallback` empty deps ile stale closure riski
- **Çözüm:** `useRef` ile handler referansı tut (CLAUDE.md pattern)

### 6. No DID format validation — DelegationsScreen.tsx
- **Dosya:** `mobile-wallet/src/screens/DelegationsScreen.tsx`
- **Sorun:** Delegation create'de delegatee DID formatı validate edilmiyor
- **Çözüm:** `did:` prefix + method check regex ekle

## Kabul Kriterleri

- [ ] Private key encrypted at rest
- [ ] Token TTL tracked and proactive refresh
- [ ] DelegationsScreen < 300 lines
- [ ] Credential matching handles field constraints
- [ ] useWebSocket uses useRef for stable callbacks
- [ ] DID format validation on user inputs
- [ ] TypeScript zero errors korunuyor
