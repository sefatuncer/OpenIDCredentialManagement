---
id: "023"
title: "React Native Mobil Wallet (Holder)"
status: pending
priority: high
category: feature
wp: WP2-WP3
created: 2026-03-11
---

## Açıklama

Mevcut web-wallet (React+Vite) yerine/yanına React Native cross-platform (iOS/Android) mobil cüzdan. Hem insan kullanıcılar hem AI ajan sahipleri için tasarlanacak.

## Gereksinimler

### İnsan Kullanıcı Özellikleri
- [ ] Yetki devri onayı (delegation approval screen)
- [ ] Ajan izleme (ajan durumu, son işlemler)
- [ ] Credential görüntüleme (SD-JWT selective disclosure dahil)
- [ ] QR code tarama (OpenID4VP authorization request)
- [ ] Biometrik kimlik doğrulama (FaceID/TouchID)

### AI Ajan Sahibi Özellikleri
- [ ] Ajan yaşam döngüsü yönetimi (oluşturma, askıya alma, iptal)
- [ ] Yetki verme/geri alma (delegation management)
- [ ] Ajan aktivite log'ları

### Teknik
- [ ] React Native proje kurulumu (Expo veya bare workflow)
- [ ] Secure storage (Keychain/Keystore) — private key saklama
- [ ] jose library entegrasyonu (VP token signing)
- [ ] DIDComm mesajlaşma desteği (todo 013 ile bağlantılı)
- [ ] Push notification (revocation alerts)
- [ ] Offline credential storage (encrypted SQLite)

## Teknik Notlar

- Mevcut web-wallet kodu referans olarak kullanılabilir (pages, services, types)
- Credo React Native uyumluluğu WP1'de test edilecek (todo 022)
- `@credo-ts/react-native` paketi mevcut
- Deep link desteği: `openid-credential-offer://` ve `openid4vp://` URI scheme'leri

## Bağımlılıklar

- Todo 007 (Client-side VP flow — mobil wallet'ta da gerekli)
- Todo 013 (DIDComm — ajan iletişimi)

## Kabul Kriterleri

- [ ] iOS ve Android'de çalışıyor
- [ ] Credential görüntüleme ve SD-JWT disclosure çalışıyor
- [ ] QR scan ile VP flow tamamlanıyor
- [ ] Secure storage'da private key güvenli saklanıyor
- [ ] Push notification ile revocation bildirimi geliyor
