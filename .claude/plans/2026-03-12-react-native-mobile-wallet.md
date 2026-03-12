---
title: "React Native Mobile Wallet (Holder)"
date: 2026-03-12
module: mobile-wallet (new) + backend (minor)
related_todos: [023, 007, 013]
---

## Goal

Cross-platform (iOS/Android) React Native mobil cüzdan uygulaması oluşturmak. Mevcut web-wallet'ın tüm holder fonksiyonlarını (credential saklama, SD-JWT disclosure, VP flow, delegation yönetimi) native mobil deneyime taşımak. Biometrik kimlik doğrulama, QR tarama, push notification ve güvenli anahtar saklama (Keychain/Keystore) ile zenginleştirmek.

## Research Findings

### Mevcut Web Wallet Yapısı
- **10 sayfa**, **7 component**, **6 service**, **2 type dosyası**
- Tüm servisler pure JS/TS — `jose` kütüphanesi ile kriptografi, `html5-qrcode` ile QR tarama
- Storage: AES-GCM-256 encrypted sessionStorage
- Auth: Client credentials → Bearer token
- VP flow: Dual mode (client-side + backend-driven)
- WebSocket: Real-time event stream (simulation, notifications)

### Kod Yeniden Kullanılabilirlik Matrisi

| Modül | Yeniden Kullanım | Değişiklik |
|-------|-----------------|------------|
| `wallet-key.service.ts` | %90 | sessionStorage → Keychain/Keystore |
| `vp.service.ts` | %100 | Pure JS — değişiklik yok |
| `sdjwt*.service.ts` | %100 | Pure JS — değişiklik yok |
| `api.service.ts` | %95 | Env var + storage adapter farkı |
| `agent.service.ts` | %95 | HTTP client aynı pattern |
| QR scanning | %0 | html5-qrcode → expo-camera |
| UI components | %0 | React DOM → React Native |
| Types | %100 | Aynen kopyalanır |

### Teknoloji Kararları

| Karar | Seçim | Gerekçe |
|-------|-------|---------|
| Framework | **Expo (managed workflow)** | Hızlı başlangıç, EAS Build, OTA updates, native module desteği |
| Navigation | **@react-navigation/native** (stack + bottom-tab) | React Native standart, deep link desteği built-in |
| Secure Storage | **expo-secure-store** (Keychain/Keystore) | Biometrik gate, hardware-backed encryption |
| QR Scanner | **expo-camera** + **expo-barcode-scanner** | Expo managed uyumlu, permissions handled |
| Biometrics | **expo-local-authentication** | FaceID/TouchID/Fingerprint |
| Push Notifications | **expo-notifications** + backend FCM/APNs | Revocation alerts |
| Crypto | **jose** (mevcut) | Pure JS, RN uyumlu, mevcut kodla uyumlu |
| HTTP | **fetch** (built-in) | Mevcut api.service.ts pattern korunur |
| State Management | **React hooks** (mevcut pattern) | Basit, web wallet ile tutarlı |
| Styling | **StyleSheet** (React Native built-in) | Hafif, ek bağımlılık yok |

### Credo-TS React Native Entegrasyonu
- `@credo-ts/react-native` paketi mevcut (v0.6.x)
- **Karar:** İlk fazda Credo OPSIYONEL — mevcut jose-based flow ile başla, Credo entegrasyonu DIDComm (todo 013) ile birlikte gelir
- Credo native binding'leri (Askar) iOS/Android'de ek konfigürasyon gerektirir

## Implementation Steps

### Faz 1: Proje Kurulumu ve Altyapı (Steps 1-5)

**Step 1** — Expo projesi oluştur ve temel bağımlılıkları ekle → `mobile-wallet/`
```bash
npx create-expo-app mobile-wallet --template blank-typescript
cd mobile-wallet
npx expo install @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs
npx expo install react-native-screens react-native-safe-area-context
npx expo install expo-secure-store expo-local-authentication expo-camera expo-barcode-scanner
npx expo install expo-notifications expo-linking
npm install jose
```

**Step 2** — Shared types ve services'i kopyala (pure JS, değişiklik yok) → `mobile-wallet/src/`
```
mobile-wallet/src/
├── types/
│   ├── agent.types.ts          ← web-wallet/src/types/agent.types.ts (copy)
│   └── sdjwt.types.ts          ← web-wallet/src/types/sdjwt.types.ts (copy)
├── services/
│   ├── vp.service.ts           ← web-wallet/src/services/vp.service.ts (copy)
│   ├── sdjwt.service.ts        ← web-wallet/src/services/sdjwt.service.ts (copy)
│   └── sdjwt-presentation.service.ts ← (copy)
```

**Step 3** — Platform-adapted services oluştur → `mobile-wallet/src/services/`
- `api.service.ts` — fetch-based HTTP client, token'ı expo-secure-store'da sakla
- `secure-storage.service.ts` — expo-secure-store wrapper (Keychain/Keystore), biometric gate
- `wallet-key.service.ts` — Ed25519 key gen (jose), private key → expo-secure-store (biometric-protected)
- `agent.service.ts` — Backend API calls (web-wallet'tan adapt)
- `notification.service.ts` — expo-notifications + push token registration

**Step 4** — Navigation yapısı kur → `mobile-wallet/src/navigation/`
- `AppNavigator.tsx` — Bottom tab + stack navigator
- Deep link config: `openid4vp://`, `openid-credential-offer://` schemes

**Step 5** — App config ve environment → `mobile-wallet/`
- `app.json` — Expo config (scheme, permissions, splash, icon)
- `.env` — API_URL, WS_URL
- `app.config.ts` — Dynamic config (env vars)

### Faz 2: Core Screens (Steps 6-11)

**Step 6** — Home/Dashboard screen → `mobile-wallet/src/screens/HomeScreen.tsx`
- Agent identity summary card
- Credential count + recent activity
- Quick actions (scan QR, view credentials)

**Step 7** — Credentials screen → `mobile-wallet/src/screens/CredentialsScreen.tsx`
- FlatList ile credential listesi
- Type-based card routing (AgentIdentity, Delegation, Capability, SD-JWT)
- Pull-to-refresh
- Encrypted storage (expo-secure-store)

**Step 8** — Credential detail cards → `mobile-wallet/src/components/`
- `AgentIdentityCard.tsx` — AI agent identity credential
- `DelegationCard.tsx` — Delegation grant card
- `CapabilityCard.tsx` — Capability credential card
- `SDJWTCredentialCard.tsx` — SD-JWT with disclosure toggle
- `CredentialDetailModal.tsx` — Full detail bottom sheet

**Step 9** — QR Scanner screen → `mobile-wallet/src/screens/ScanScreen.tsx`
- expo-camera ile QR tarama
- `openid4vp://` URI parse → VP flow başlat
- `openid-credential-offer://` URI parse → credential accept flow
- Manual URI paste option

**Step 10** — VP Presentation flow → `mobile-wallet/src/screens/PresentCredentialScreen.tsx`
- Scanned/deep-linked URI → fetch presentation definition
- Credential matching (mevcut `vp.service.ts`)
- SD-JWT disclosure selection (claim toggle list)
- VP token signing (client-side, jose)
- direct_post submission
- Success/failure result screen

**Step 11** — Delegation management → `mobile-wallet/src/screens/DelegationsScreen.tsx`
- Tab layout: Received / Given delegations
- Create delegation form
- Revoke delegation action
- Delegation chain visualization (simplified tree view)

### Faz 3: Güvenlik ve Native Features (Steps 12-15)

**Step 12** — Biometric authentication → `mobile-wallet/src/services/auth.service.ts`
- App açılışta biometric gate (expo-local-authentication)
- Kritik işlemlerde re-auth (delegation approval, key export)
- Fallback: PIN/password

**Step 13** — Push notifications (revocation alerts) → `mobile-wallet/src/services/notification.service.ts`
- Expo push token → backend'e kayıt (`POST /api/v1/holder/push-token`)
- Backend: credential.revoked event → push notification gönder
- Notification handler: deep link to credential detail

**Step 14** — Backend push notification endpoint → `backend/src/api/routes/holder.routes.ts`
- `POST /api/v1/holder/push-token` — push token registration
- `push-notification.service.ts` — Expo push API integration (HTTP, no native SDK)
- EventBus listener: `credential.revoked` → send push to registered tokens

**Step 15** — Deep linking + URI scheme handling → `mobile-wallet/src/navigation/linking.ts`
- `openid4vp://` → ScanScreen → auto-parse → PresentCredentialScreen
- `openid-credential-offer://` → credential accept flow
- Universal links config (iOS: apple-app-site-association, Android: assetlinks.json)

### Faz 4: Agent Management ve Polish (Steps 16-19)

**Step 16** — Agent registration/dashboard → `mobile-wallet/src/screens/AgentScreen.tsx`
- Agent identity registration form
- Wallet DID display + copy
- Agent stats (credentials, delegations, trust)
- Activity log (recent operations)

**Step 17** — Trust management → `mobile-wallet/src/screens/TrustScreen.tsx`
- Trusted agents list
- Trust establishment form
- Trust level indicators (color-coded badges)
- Verify agent action

**Step 18** — Settings screen → `mobile-wallet/src/screens/SettingsScreen.tsx`
- Backend URL config
- Biometric toggle
- Push notification preferences
- Clear wallet data (with confirmation)
- App version info

**Step 19** — WebSocket real-time events → `mobile-wallet/src/hooks/useWebSocket.ts`
- WebSocket connection (built-in RN WebSocket)
- Auto-reconnect pattern (mevcut web-wallet pattern, useRef)
- Event-driven UI updates (credential status changes)
- Background/foreground lifecycle handling

## Files to Create/Modify

### New Files (mobile-wallet/)

| File | Description |
|------|-------------|
| `mobile-wallet/package.json` | Expo project config |
| `mobile-wallet/app.json` | Expo app config (scheme, permissions) |
| `mobile-wallet/app.config.ts` | Dynamic config (env vars) |
| `mobile-wallet/tsconfig.json` | TypeScript config |
| `mobile-wallet/.env` | API_URL, WS_URL |
| `mobile-wallet/App.tsx` | Entry point |
| `mobile-wallet/src/navigation/AppNavigator.tsx` | Bottom tab + stack navigation |
| `mobile-wallet/src/navigation/linking.ts` | Deep link configuration |
| `mobile-wallet/src/screens/HomeScreen.tsx` | Dashboard/landing |
| `mobile-wallet/src/screens/CredentialsScreen.tsx` | Credential list + encrypted storage |
| `mobile-wallet/src/screens/ScanScreen.tsx` | QR code scanner |
| `mobile-wallet/src/screens/PresentCredentialScreen.tsx` | VP flow |
| `mobile-wallet/src/screens/DelegationsScreen.tsx` | Delegation management |
| `mobile-wallet/src/screens/AgentScreen.tsx` | Agent identity/registration |
| `mobile-wallet/src/screens/TrustScreen.tsx` | Trust management |
| `mobile-wallet/src/screens/SettingsScreen.tsx` | App settings |
| `mobile-wallet/src/components/AgentIdentityCard.tsx` | Agent ID credential card |
| `mobile-wallet/src/components/DelegationCard.tsx` | Delegation card |
| `mobile-wallet/src/components/CapabilityCard.tsx` | Capability card |
| `mobile-wallet/src/components/SDJWTCredentialCard.tsx` | SD-JWT card with disclosures |
| `mobile-wallet/src/components/CredentialDetailModal.tsx` | Detail bottom sheet |
| `mobile-wallet/src/components/BiometricGate.tsx` | Biometric auth wrapper |
| `mobile-wallet/src/services/api.service.ts` | HTTP client (adapted) |
| `mobile-wallet/src/services/secure-storage.service.ts` | Keychain/Keystore wrapper |
| `mobile-wallet/src/services/wallet-key.service.ts` | Ed25519 key management (adapted) |
| `mobile-wallet/src/services/agent.service.ts` | Agent API calls (adapted) |
| `mobile-wallet/src/services/auth.service.ts` | Biometric + PIN auth |
| `mobile-wallet/src/services/notification.service.ts` | Push notification handling |
| `mobile-wallet/src/services/vp.service.ts` | VP flow (copy from web-wallet) |
| `mobile-wallet/src/services/sdjwt.service.ts` | SD-JWT parsing (copy) |
| `mobile-wallet/src/services/sdjwt-presentation.service.ts` | SD-JWT filtering (copy) |
| `mobile-wallet/src/types/agent.types.ts` | Agent types (copy) |
| `mobile-wallet/src/types/sdjwt.types.ts` | SD-JWT types (copy) |
| `mobile-wallet/src/hooks/useWebSocket.ts` | WebSocket connection hook |
| `mobile-wallet/src/hooks/useBiometric.ts` | Biometric auth hook |
| `mobile-wallet/src/theme/index.ts` | Color palette, typography, spacing |

### Modified Files (backend/)

| File | Action | Description |
|------|--------|-------------|
| `backend/src/api/routes/holder.routes.ts` | Modify | Push token registration endpoint |
| `backend/src/services/push-notification.service.ts` | Create | Expo push API integration |
| `backend/src/index.ts` | Modify | Push notification service init + EventBus listener |
| `docker-compose.dev.yml` | Modify | mobile-wallet not in compose (native app, runs on device/emulator) — sadece docs güncelle |

## Project Structure

```
mobile-wallet/
├── App.tsx                              # Entry point
├── app.json                             # Expo config
├── app.config.ts                        # Dynamic config
├── package.json
├── tsconfig.json
├── .env
├── assets/                              # App icon, splash screen
│   ├── icon.png
│   ├── splash.png
│   └── adaptive-icon.png
├── src/
│   ├── navigation/
│   │   ├── AppNavigator.tsx             # Bottom tabs + stacks
│   │   └── linking.ts                   # Deep link config
│   ├── screens/
│   │   ├── HomeScreen.tsx               # Dashboard
│   │   ├── CredentialsScreen.tsx        # Credential list
│   │   ├── ScanScreen.tsx               # QR scanner
│   │   ├── PresentCredentialScreen.tsx  # VP flow
│   │   ├── DelegationsScreen.tsx        # Delegations
│   │   ├── AgentScreen.tsx              # Agent identity
│   │   ├── TrustScreen.tsx              # Trust management
│   │   └── SettingsScreen.tsx           # Settings
│   ├── components/
│   │   ├── AgentIdentityCard.tsx
│   │   ├── DelegationCard.tsx
│   │   ├── CapabilityCard.tsx
│   │   ├── SDJWTCredentialCard.tsx
│   │   ├── CredentialDetailModal.tsx
│   │   └── BiometricGate.tsx
│   ├── services/
│   │   ├── api.service.ts               # HTTP client
│   │   ├── secure-storage.service.ts    # Keychain/Keystore
│   │   ├── wallet-key.service.ts        # Ed25519 key management
│   │   ├── agent.service.ts             # Agent API calls
│   │   ├── auth.service.ts              # Biometric + PIN
│   │   ├── notification.service.ts      # Push notifications
│   │   ├── vp.service.ts               # VP flow (from web-wallet)
│   │   ├── sdjwt.service.ts            # SD-JWT parsing (from web-wallet)
│   │   └── sdjwt-presentation.service.ts
│   ├── hooks/
│   │   ├── useWebSocket.ts
│   │   └── useBiometric.ts
│   ├── types/
│   │   ├── agent.types.ts              # From web-wallet
│   │   └── sdjwt.types.ts             # From web-wallet
│   └── theme/
│       └── index.ts                     # Colors, typography, spacing
```

## Navigation Map

```
Bottom Tabs:
├── Home (HomeScreen)
│   └── Stack: AgentScreen (push)
├── Credentials (CredentialsScreen)
│   └── Stack: CredentialDetailModal (push), PresentCredentialScreen (push)
├── Scan (ScanScreen) — center tab, prominent icon
│   └── Stack: PresentCredentialScreen (push)
├── Delegations (DelegationsScreen)
└── Settings (SettingsScreen)
    └── Stack: TrustScreen (push)
```

## Validation

### Faz 1 Doğrulama
```bash
cd mobile-wallet
npx expo start                          # Metro bundler başlar
# iOS simulator veya Android emulator'de açılır
# Navigation tab'lar arası geçiş çalışır
```

### Faz 2 Doğrulama
1. **Credentials:** Backend'den credential listesi yüklenir, FlatList'te gösterilir
2. **QR Scan:** Kamera açılır, `openid4vp://` QR taranır, VP flow başlar
3. **VP Flow:** Credential matching → disclosure selection → VP signing → direct_post → success
4. **Delegations:** List/create/revoke çalışır

### Faz 3 Doğrulama
1. **Biometric:** App açılışta FaceID/TouchID prompt gelir
2. **Secure Storage:** Private key expo-secure-store'da saklanır (Keychain/Keystore)
3. **Push:** `credential.revoked` event → push notification gelir
4. **Deep Link:** `openid4vp://...` linke tıklayınca app açılır ve VP flow başlar

### Faz 4 Doğrulama
1. **Agent:** Registration formu çalışır, wallet DID gösterilir
2. **Trust:** Trust establishment + verification çalışır
3. **WebSocket:** Real-time credential status güncellemeleri gelir
4. **Settings:** Backend URL değiştirilir, biometric toggle çalışır

## Risks

| Risk | Olasılık | Etki | Azaltma |
|------|----------|------|---------|
| **jose WebCrypto polyfill RN'de çalışmaz** | Orta | Yüksek | `react-native-quick-crypto` polyfill veya `expo-crypto` ile SubtleCrypto bridge |
| **Expo managed workflow native module kısıtlaması** | Düşük | Orta | EAS Build (development build) ile native module desteği; gerekirse bare workflow'a geçiş |
| **Credo-TS RN native binding (Askar) kurulum zorluğu** | Yüksek | Orta | İlk fazda Credo OPSIYONEL — jose-only flow ile başla, Credo DIDComm (todo 013) ile gelir |
| **Deep link iOS Universal Links sertifika gereksinimi** | Orta | Düşük | Dev'de custom scheme (`openid4vp://`) yeterli, Universal Links production'da eklenecek |
| **Push notification backend Expo push API bağımlılığı** | Düşük | Düşük | Expo push API ücretsiz ve güvenilir; alternatif: doğrudan FCM/APNs |
| **base58btc encoding RN'de** | Düşük | Düşük | `bs58` npm paketi pure JS, RN'de çalışır |

## Tahmini Kapsam

- **Faz 1:** Proje kurulumu + shared code + navigation (~35 dosya)
- **Faz 2:** Core screens + components (~15 dosya, ~3000 LOC)
- **Faz 3:** Security + native features (~8 dosya, ~1500 LOC)
- **Faz 4:** Agent management + polish (~8 dosya, ~2000 LOC)
- **Backend:** Push notification endpoint (~3 dosya, ~200 LOC)
- **Toplam:** ~70 dosya, ~7000 LOC (services'in %60'ı web-wallet'tan reuse)
