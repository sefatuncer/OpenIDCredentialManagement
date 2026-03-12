---
id: "007"
title: "Client-Side VP Flow (Wallet-Only Credentials)"
status: done
priority: medium
category: feature
wp: WP2
created: 2026-03-11
completed: 2026-03-12
depends_on: ["006"]
---

## Açıklama

Wallet'ın kendi local credential'larını kullanarak client-side VP flow yapabilmesi. Şu an VP flow tamamen backend-driven.

## Gereksinimler

- [x] Wallet local credential'lardan presentation definition'a matching
- [x] Client-side VP token oluşturma (jose ile JWT signing)
- [x] Direct_post endpoint'ine client-side submission
- [x] SD-JWT credential'lar için selective disclosure seçimi
- [x] Credential selection UI (birden fazla matching credential varsa)

## Teknik Notlar

- Wallet'ta private key gerekli (VP token signing için)
- `jose` library wallet'a eklenmeli
- Backend `direct_post` endpoint'i zaten dış wallet'lardan submission kabul ediyor

## Kabul Kriterleri

- [x] Wallet local credential ile VP flow tamamlanıyor
- [x] SD-JWT selective disclosure çalışıyor
- [x] Backend ve client-side VP flow'lar birlikte çalışıyor

## Implementation

- `web-wallet/src/services/wallet-key.service.ts` — Ed25519 keygen, DID:key derivation, JWT signing
- `web-wallet/src/services/vp.service.ts` — VP token creation, credential matching, direct_post submission
- `web-wallet/src/services/sdjwt-presentation.service.ts` — SD-JWT disclosure selection for presentation
- `web-wallet/src/pages/PresentCredential.tsx` — Client-side VP flow UI (mode toggle, credential selection, disclosure picker)
- `web-wallet/src/api.ts` — `getHolderCredentialsRaw()` with jwt/combined fields
- `web-wallet/src/utils/uuid.ts` — Browser-native UUID generation
- `backend/src/agents/holder.agent.ts` — `jwt` field added to `getStoredCredentials()` response
