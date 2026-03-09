---
title: "SD-JWT Selective Disclosure UI Pattern"
tags: [sdjwt, selective-disclosure, ui, react, wallet, presentation]
category: architecture
difficulty: medium
date: 2026-03-09
---

## Problem

SD-JWT (Selective Disclosure JWT) credentials backend'de implementeydi ancak:
- Web Wallet'ta disclosed vs hidden claims görsel ayrımı yoktu
- Kullanıcılar hangi claim'leri açıklayacaklarını seçemiyordu
- Presentation oluşturma UI'ı yoktu

## Approach

### 1. Client-Side SD-JWT Parsing

Browser'da çalışan pure JavaScript parser ile SD-JWT'yi parse etme:

```typescript
// sdjwt.service.ts
export function parseSDJWT(combined: string): ParsedSDJWT | null {
  const parts = combined.split('~')
  const jwt = parts[0]
  const payload = decodeJWTPayload(jwt)

  const disclosures: Disclosure[] = []
  for (let i = 1; i < parts.length; i++) {
    const disclosure = parseDisclosure(parts[i])
    if (disclosure) disclosures.push(disclosure)
  }

  return { jwt, payload, disclosures, ... }
}
```

### 2. Visual Differentiation

- **Disclosed claims:** Yeşil badge + checkmark icon
- **Hidden claims:** Gri badge + lock icon
- **SD-JWT Badge:** Credential card'da "SD-JWT" etiketi

### 3. Presentation Creation Flow

1. Kullanıcı "Create Presentation" butonuna tıklar
2. Modal açılır - tüm selectable claims checkbox olarak gösterilir
3. Kullanıcı açıklamak istediği claim'leri seçer
4. (Opsiyonel) Key binding için audience/nonce girer
5. API'ye istek gider, presentation oluşturulur
6. Kullanıcı presentation'ı kopyalar

### 4. Component Structure

```
Credentials.tsx
├── SDJWTCredentialCard (SD-JWT için)
│   └── Disclosure badges
├── SDJWTCredentialDetail (Modal)
│   └── Disclosed/hidden claims gösterimi
└── CreatePresentationModal
    ├── Claim selection checkboxes
    ├── Key binding options
    └── Output display
```

## Key Details

### Files Created
- `web-wallet/src/types/sdjwt.types.ts` - Type definitions
- `web-wallet/src/services/sdjwt.service.ts` - SD-JWT parsing & API client
- `web-wallet/src/components/SDJWTCredentialCard.tsx` - Card component
- `web-wallet/src/components/CreatePresentationModal.tsx` - Presentation modal

### SD-JWT Detection

```typescript
export function isSDJWT(credentialString: string): boolean {
  if (!credentialString.includes('~')) {
    const payload = decodeJWTPayload(credentialString)
    return payload?._sd !== undefined || payload?._sd_alg !== undefined
  }
  return true
}
```

### Nonce Generation

```typescript
export function generateNonce(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('')
}
```

## Lessons Learned

1. **Client-side parsing yeterli:** Basit gösterim için backend API gerekmiyor, client-side base64 decode yeterli
2. **Type guards önemli:** `'isSDJWT' in credential` pattern'i farklı credential tiplerini ayırt etmek için etkili
3. **API for crypto:** Digest verification gibi crypto işlemleri için backend API kullan, client'ta sadece display

## Prevention

- Yeni credential tipi eklerken önce type guard pattern'i uygula
- Modal'lar için z-index hiyerarşisi kur (detail: 1000, presentation: 1001)
- Disclosure parsing'de her zaman try/catch kullan - malformed data olabilir
