---
id: "023"
title: "React Native Mobil Wallet (Holder)"
status: done
priority: high
category: feature
wp: WP2-WP3
created: 2026-03-11
completed: 2026-03-12
---

## Açıklama

Mevcut web-wallet (React+Vite) yerine/yanına React Native cross-platform (iOS/Android) mobil cüzdan. Hem insan kullanıcılar hem AI ajan sahipleri için tasarlanacak.

## Gereksinimler

### İnsan Kullanıcı Özellikleri
- [x] Yetki devri onayı (delegation approval screen) — DelegationsScreen
- [x] Ajan izleme (ajan durumu, son işlemler) — AgentScreen + activity log
- [x] Credential görüntüleme (SD-JWT selective disclosure dahil) — CredentialsScreen + SDJWTCredentialCard
- [x] QR code tarama (OpenID4VP authorization request) — ScanScreen + expo-camera
- [x] Biometrik kimlik doğrulama (FaceID/TouchID) — BiometricGate + auth.service

### AI Ajan Sahibi Özellikleri
- [x] Ajan yaşam döngüsü yönetimi (oluşturma, askıya alma, iptal) — AgentScreen registration
- [x] Yetki verme/geri alma (delegation management) — DelegationsScreen create/revoke
- [x] Ajan aktivite log'ları — AgentScreen activity section

### Teknik
- [x] React Native proje kurulumu (Expo managed workflow)
- [x] Secure storage (Keychain/Keystore) — expo-secure-store, wallet-key.service.ts
- [x] jose library entegrasyonu (VP token signing) — vp.service.ts + wallet-key.service.ts
- [ ] DIDComm mesajlaşma desteği (todo 013 ile bağlantılı) — Credo RN entegrasyonu ile gelecek
- [x] Push notification (revocation alerts) — notification.service + backend push-notification.service
- [x] Offline credential storage (encrypted SecureStore)

## Teknik Notlar

- Mevcut web-wallet kodu referans olarak kullanıldı — services %60+ reuse
- Expo managed workflow seçildi (EAS Build ile native module desteği)
- Deep link desteği: `openid4vp://`, `openid-credential-offer://`, `ssi-wallet://` URI scheme'leri
- Bottom tab + stack navigation (@react-navigation)
- Credo-TS RN: İlk fazda opsiyonel, DIDComm (todo 013) ile birlikte entegre edilecek

## Implementasyon Detayları

### Dosya Yapısı
```
mobile-wallet/
├── App.tsx                    # Entry (BiometricGate + AppNavigator)
├── app.json                   # Expo config (scheme, permissions)
├── app.config.ts              # Dynamic env config
├── src/
│   ├── navigation/            # Bottom tabs + stack navigator + deep links
│   ├── screens/ (8)           # Home, Credentials, Scan, Present, Delegations, Agent, Trust, Settings
│   ├── components/ (5)        # AgentIdentityCard, DelegationCard, CapabilityCard, SDJWTCard, BiometricGate
│   ├── services/ (8)          # api, agent, auth, notification, secure-storage, vp, sdjwt, wallet-key
│   ├── hooks/ (2)             # useWebSocket, useBiometric
│   ├── types/ (2)             # agent.types, sdjwt.types (copied from web-wallet)
│   ├── theme/                 # Colors, spacing, typography
│   └── utils/                 # uuid
```

### Backend Değişiklikleri
- `POST /api/v1/holder/push-token` — push token registration endpoint
- `push-notification.service.ts` — Expo Push API integration
- EventBus `credential.revoked` → broadcast push notification

## Kabul Kriterleri

- [x] TypeScript zero errors (tsc --noEmit)
- [x] Credential görüntüleme ve SD-JWT disclosure çalışıyor (component-level)
- [x] QR scan ile VP flow tamamlanıyor (ScanScreen → PresentCredentialScreen)
- [x] Secure storage'da private key güvenli saklanıyor (expo-secure-store)
- [x] Push notification ile revocation bildirimi (backend integration)
- [x] Biometric authentication gate (FaceID/TouchID)
- [ ] iOS ve Android'de çalışıyor (device testing gerekli — EAS Build)
