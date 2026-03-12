---
title: "React Native Mobile Wallet — Cross-Platform SSI Wallet with Expo"
tags: [react-native, expo, mobile, wallet, biometric, qr-scan, push-notification, secure-storage, openid4vp, sdjwt]
category: architecture
difficulty: hard
date: 2026-03-12
---

## Problem

Web wallet (React+Vite) yalnızca browser'da çalışır. iOS/Android native özellikler (biometrik auth, QR kamera, push notification, Keychain/Keystore) gerektiğinde ayrı bir mobil uygulama lazım. Ancak mevcut wallet service kodunun büyük kısmı platform-agnostic — sıfırdan yazma yerine reuse stratejisi gerekli.

## Approach

**Expo Managed Workflow** seçildi (EAS Build ile native module desteği yeterli, eject gerekmez). Crypto/protocol katmanı `jose` (pure JS) kullandığından RN-compatible.

### Code Reuse Strategy

| Katman | Web Wallet | Mobile Wallet | Reuse % |
|--------|-----------|---------------|---------|
| Types (agent, sdjwt) | TypeScript interfaces | Verbatim copy | 100% |
| VP service | jose + fetch | Verbatim copy | 100% |
| SD-JWT services | base64url decode | Minor import fixes | 95% |
| Wallet key service | sessionStorage | expo-secure-store | 90% |
| API service | fetch + sessionStorage | fetch + expo-secure-store | 85% |
| Agent service | apiService wrapper | Rewritten (shared pattern) | 60% |
| UI components | React + CSS | React Native + StyleSheet | 0% (rewrite) |

**Sonuç:** ~60% overall reuse, ~7000 LOC toplam, ~4200 LOC reused/adapted.

### Platform Adaptation Points

1. **Storage backend:** `sessionStorage` → `expo-secure-store` (Keychain/Keystore)
2. **Env var access:** `import.meta.env` → `Constants.expoConfig?.extra`
3. **URL encoding:** `URLSearchParams` → manual string building (RN compat)
4. **Navigation:** React Router → `@react-navigation` (stack + bottom-tab)
5. **Crypto random:** `crypto.randomUUID()` → `Math.random()` fallback

### Architecture

```
App.tsx (entry)
  └─ BiometricGate (auth gate — blocks until FaceID/TouchID/passcode)
      └─ AppNavigator
          ├─ Bottom Tabs: Home, Credentials, Scan, Delegations, Settings
          └─ Stack Screens: PresentCredential, AgentDetail, TrustManagement
```

## Key Details

### Dosya Yapısı (38 source files)
```
mobile-wallet/
├── App.tsx, app.json, app.config.ts, tsconfig.json, package.json
├── src/
│   ├── services/ (8)     — api, agent, auth, notification, secure-storage, vp, sdjwt, wallet-key
│   ├── screens/ (8)      — Home, Credentials, Scan, Present, Delegations, Agent, Trust, Settings
│   ├── components/ (5)   — AgentIdentityCard, DelegationCard, CapabilityCard, SDJWTCard, BiometricGate
│   ├── hooks/ (2)        — useWebSocket, useBiometric
│   ├── navigation/ (2)   — AppNavigator, linking (deep links)
│   ├── types/ (2)        — agent.types, sdjwt.types
│   ├── theme/ (1)        — colors, spacing, fontSize
│   └── utils/ (1)        — uuid
```

### Backend Değişiklikleri
- `POST /api/v1/holder/push-token` — push token registration
- `push-notification.service.ts` — Expo Push API integration
- EventBus `credential.revoked` → broadcast push notification

### Native Features
| Feature | Library | iOS | Android |
|---------|---------|-----|---------|
| Biometric | expo-local-authentication | FaceID | Fingerprint/Iris |
| QR Scan | expo-camera | Camera | Camera |
| Secure Storage | expo-secure-store | Keychain | Keystore |
| Push | expo-notifications | APNs | FCM |
| Deep Link | expo-linking | URL scheme | Intent filter |

### Deep Link URI Schemes
- `openid4vp://` — VP authorization request
- `openid-credential-offer://` — Credential offer
- `ssi-wallet://` — General wallet deep link

## Lessons Learned

1. **jose pure JS = RN compatible.** Credo-TS native binding'leri RN'de sorunlu, jose ile tüm crypto RN'de çalışır. DIDComm (todo 013) gelene kadar jose yeterli.

2. **expo-secure-store biometric koruması ayarlanabilir.** `WHEN_UNLOCKED_THIS_DEVICE_ONLY` en güvenli seviye — cihaza bağlı, kilit açıkken erişilebilir. Ama BiometricGate app seviyesinde ek bir koruma katmanı.

3. **`Record<string, unknown>` + JSX = type error.** React Native'de `{value && <Text>}` pattern'i `unknown` type'ta çalışmaz — `{value ? <Text>... : null}` ternary kullan.

4. **URLSearchParams RN'de güvenilmez.** VP submission için manual URL encoding (`encodeURIComponent`) daha güvenli.

5. **App state lifecycle WebSocket yönetimi.** Background'a geçince disconnect, foreground'a dönünce reconnect — `AppState.addEventListener` + `useRef` ile stabil callback.

6. **Push notification silent fail.** Backend push endpoint yoksa veya token geçersizse sessiz fail — crash yerine log + ignore. Mobile app başlatılmadan push çalışmaz.

## Prevention

- Yeni mobil service yazarken önce web-wallet'ta karşılığını kontrol et — %60+ reuse mümkün
- Platform-specific adaptasyon noktaları: storage, env vars, URL handling, navigation
- Pure JS crypto (jose) seç, native binding gerektiren kütüphanelerden kaçın (RN compat)
- `Record<string, unknown>` erişimlerinde her zaman ternary veya optional chaining kullan
- Biometric gate'i app root'a koy (wrapper component), her ekranda ayrı kontrol yapma
