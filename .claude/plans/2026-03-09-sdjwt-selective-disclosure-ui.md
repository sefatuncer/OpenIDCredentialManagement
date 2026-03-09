# Plan: SD-JWT Selective Disclosure UI Entegrasyonu

**Tarih:** 2026-03-09
**Öncelik:** P1 (In Progress listesinde)
**Tahmini Kapsam:** Web Wallet + Backend API client

---

## Problem

Backend'de SD-JWT implementasyonu tamamlanmış (sdjwt.service.ts), ancak:
- Web Wallet'ta selective disclosure gösterimi yok
- Disclosed vs Hidden claims ayrımı yapılmıyor
- Presentation oluşturma UI'ı yok

## Hedef

Web Wallet'ta credential'ları SD-JWT formatında gösterme ve seçici açıklama yapabilme.

---

## Uygulama Planı

### Adım 1: SD-JWT API Service (web-wallet)
**Dosya:** `web-wallet/src/services/sdjwt.service.ts`

```typescript
// API client for SD-JWT operations
- parseSDJWT(token: string) → ParsedSDJWT
- createPresentation(token: string, disclosedClaims: string[]) → Presentation
- verifyPresentation(presentation: string) → VerificationResult
```

### Adım 2: SD-JWT Types
**Dosya:** `web-wallet/src/types/sdjwt.types.ts`

```typescript
interface SDJWTCredential {
  jwt: string
  disclosures: Disclosure[]
  keyBindingJwt?: string
}

interface Disclosure {
  salt: string
  claimName: string
  claimValue: any
  encoded: string
}

interface ParsedSDJWT {
  payload: SDJWTPayload
  disclosures: Disclosure[]
  disclosedClaims: Record<string, any>
  hiddenDigests: string[]
}
```

### Adım 3: SD-JWT Credential Display Component
**Dosya:** `web-wallet/src/components/SDJWTCredentialCard.tsx`

- Disclosed claims → yeşil badge ile göster
- Hidden claims (sadece digest) → kilitli ikon ile göster
- Claim toggle: disclosure seçimi için checkbox

### Adım 4: Presentation Creation Modal
**Dosya:** `web-wallet/src/components/CreatePresentationModal.tsx`

- Credential seçimi
- Disclosure claim checkboxları
- Audience (verifier) input
- Nonce input (veya auto-generate)
- "Create Presentation" butonu

### Adım 5: Credentials.tsx Güncelleme
**Dosya:** `web-wallet/src/pages/Credentials.tsx`

- SD-JWT credential detection
- SDJWTCredentialCard component kullanımı
- Presentation creation trigger

---

## Dosya Listesi

| Dosya | İşlem | Açıklama |
|-------|-------|----------|
| `web-wallet/src/services/sdjwt.service.ts` | CREATE | SD-JWT API client |
| `web-wallet/src/types/sdjwt.types.ts` | CREATE | Type definitions |
| `web-wallet/src/components/SDJWTCredentialCard.tsx` | CREATE | Credential display |
| `web-wallet/src/components/CreatePresentationModal.tsx` | CREATE | Presentation UI |
| `web-wallet/src/pages/Credentials.tsx` | EDIT | SD-JWT integration |

---

## Kabul Kriterleri

1. ✅ SD-JWT credential'lar farklı görünümle ayırt edilebilir
2. ✅ Disclosed claims yeşil, hidden claims gri/kilitli gösterilir
3. ✅ Kullanıcı presentation için hangi claim'leri açıklayacağını seçebilir
4. ✅ Presentation oluşturulduğunda kopyalanabilir output verilir
5. ✅ TypeScript hatasız derlenir

---

## Riskler ve Azaltma

| Risk | Azaltma |
|------|---------|
| Backend API uyumsuzluğu | Mevcut sdjwt.routes.ts endpoints kullanılacak |
| Crypto işlemleri browser'da | jose kütüphanesi browser-compatible |
| Key binding private key | Web Wallet'ın agent key'i kullanılacak |

---

## Out of Scope

- Issuer form SD-JWT konfigürasyonu (ayrı cycle)
- OpenID4VP tam entegrasyonu (ayrı cycle)
- Verifier dashboard güncellemesi (ayrı cycle)
