---
title: "OpenID4VP Wallet Integration"
date: 2026-03-11
module: web-wallet
related_todos: [006]
---

## Goal

Web Wallet'a OpenID4VP credential presentation flow'u eklemek: QR scan → confirm → VP submission → sonuç gösterimi.

## Research Findings

### Backend (Hazır ✓)
- `POST /api/v1/holder/credentials/present` → `presentCredential(verificationRequestUri)`:
  - URI'den `request_uri` parametresini çıkarıp fetch eder
  - Presentation definition'a göre matching credential bulur (backend in-memory storage)
  - VP token oluştur + direct_post ile submit eder
- `POST /api/v1/verifier/verify/*` → verification request oluşturur, `requestUri` döner
- QR data formatı: `openid4vp://?client_id=did:key:z...&request_uri=http://localhost:3000/api/v1/verifier/request/{sessionId}`

### İki VP Flow Var — Hangisi?

| | `verifier.agent.ts` (Route: `/api/v1/verifier/*`) | `openid4vp.service.ts` (Route: `/api/v1/openid4vp/*`) |
|---|---|---|
| URI format | `openid4vp://?client_id=...&request_uri=...` (request_uri ile fetch) | `openid4vp://?response_type=vp_token&...&presentation_definition=...` (inline params) |
| Holder parse | `holder.agent.ts` → `url.searchParams.get('request_uri')` → fetch | N/A (farklı parse gerekir) |
| Frontend | `VerifyRequest.tsx` bunu kullanıyor ✓ | Kullanılmıyor |

**Karar:** `verifier.agent.ts` path'ini kullanıyoruz — frontend verifier bunu kullanıyor ve holder agent bunu parse edebiliyor.

### Frontend Verifier (Hazır ✓)
- `VerifyRequest.tsx` — QR code oluşturuyor (`requestUri` → QR)
- `VerifyResults.tsx` — session durumu ve verification result gösteriyor
- Backend response: `{ success, requestUri, verificationSessionId }` — `qrData` field'ı yok, frontend `requestUri`'yi QR data olarak kullanıyor

### Web Wallet (Eksik)
- `html5-qrcode` package.json'da var ama **`npm install` yapılmamış** (node_modules'da yok)
- QR scanner component/page yok
- `api.ts`'de `presentCredential` fonksiyonu yok
- Mevcut `/verify` route → `VerifyCredential.tsx` (JWT paste & verify, VP flow değil)

### Bilinen Sınırlılık: Credential Storage

Backend `holder.agent.ts` kendi in-memory `storedCredentials` Map'ini kullanıyor. Wallet'ın local encrypted storage'ındaki credential'lar burada **yok**. Credential matching sadece backend holder agent'ın bildiği credential'lar üzerinden çalışıyor.

Bu şu an kabul edilebilir çünkü credential issuance de backend üzerinden (`receiveCredentialOffer`) yapılıyor ve credential'lar backend'e kaydediliyor. Wallet-only credential'lar için ileride client-side VP flow gerekecek (ayrı todo).

## Implementation Steps

### Adım 0: Dependency kurulumu

```bash
cd web-wallet && npm install
```
`html5-qrcode@2.3.8` package.json'da var ama node_modules'da yok. Docker build'de sorun olmaz ama local dev için `npm install` gerekli.

### Adım 1: QR Scanner Component → `web-wallet/src/components/QRScanner.tsx`

`html5-qrcode` kütüphanesi ile QR code scanner component.

**Props:**
```typescript
interface QRScannerProps {
  onScan: (data: string) => void
  onError?: (error: string) => void
}
```

**Davranış:**
- `Html5QrcodeScanner` instance oluşturur
- QR tarandığında `onScan` callback'e raw string gönderilir
- Cleanup: component unmount'ta scanner durur
- Camera erişimi reddedilirse error callback

**Teknik notlar:**
- `html5-qrcode` doğrudan DOM manipülasyonu yapıyor — React ref ile container div gerekli
- `useEffect` cleanup'ta `scanner.clear()` çağrılmalı
- `fps: 10`, `qrbox: 250` gibi config parametreleri

### Adım 2: VP API fonksiyonları → `web-wallet/src/api.ts`

Mevcut `api.ts`'e VP ile ilgili fonksiyonlar ekle:

```typescript
// Credential'ı present et (backend holder agent üzerinden)
export async function presentCredential(verificationRequestUri: string): Promise<{
  success: boolean
  presentationSubmitted: boolean
}> {
  const response = await authFetch(`${API_BASE}/holder/credentials/present`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ verificationRequestUri }),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error_description || 'Presentation failed')
  }
  return response.json()
}
```

**Not:** `getVerificationSession` gerekmez — wallet tarafında session polling yapılmıyor. Backend `presentCredential` senkron olarak sonuç dönüyor.

### Adım 3: PresentCredential Page → `web-wallet/src/pages/PresentCredential.tsx`

Yeni sayfa — VP flow'un ana UI'ı.

**States:**
1. `idle` — QR scanner + manual paste alanı gösterilir
2. `confirm` — URI okundu, kullanıcı onay bekliyor
3. `submitting` — Backend'e gönderiliyor (loading)
4. `success` — Presentation başarılı
5. `error` — Hata oluştu (credential bulunamadı, bağlantı hatası, vb.)

**UI bileşenleri:**
- QR Scanner (Adım 1'deki component)
- Manuel URI paste textarea
- URI preview (onay ekranında)
- "Present Credentials" butonu
- Sonuç gösterimi (success/error mesajı)
- "Scan Again" / "Try Another" butonu

**URI doğrulama:**
- `openid4vp://` prefix kontrolü
- `client_id` ve `request_uri` parametrelerinin varlığı kontrolü
- Geçersiz URI'de kullanıcıya hata mesajı

**Stil:** Mevcut sayfaların CSS pattern'ini takip et (`.card`, `.form-group`, `.btn`, `.alert`, `.grid` class'ları).

### Adım 4: Route ve Navigation → `web-wallet/src/App.tsx`

- Yeni import: `PresentCredential`
- Yeni route: `<Route path="/present" element={<PresentCredential />} />`
- Nav'a link: `<NavLink to="/present">Present</NavLink>` — "Verify" linkinden sonra

### Adım 5: TypeScript compile doğrula

```bash
cd web-wallet && npx tsc --noEmit
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `web-wallet/src/components/QRScanner.tsx` | Create | html5-qrcode ile QR scanner component |
| `web-wallet/src/api.ts` | Modify | `presentCredential()` fonksiyonu ekle |
| `web-wallet/src/pages/PresentCredential.tsx` | Create | VP flow UI: scan → confirm → submit → result |
| `web-wallet/src/App.tsx` | Modify | Route + nav link ekle |

## Validation

```bash
# 1. Dependency install
cd web-wallet && npm install

# 2. TypeScript compile
npx tsc --noEmit

# 3. Dev server
npm run dev

# 4. Manuel test — temel flow:
#    a. Web Wallet'ta /present sayfasına git
#    b. Manuel olarak bir openid4vp:// URI yapıştır
#    c. "Present Credentials" butonuna bas
#    d. Backend'de credential yoksa → "No matching credentials" mesajı
#    e. Backend'de credential varsa → "Presentation submitted" mesajı

# 5. End-to-end test (Docker):
#    a. docker compose up -d
#    b. Web Wallet'ta /issue üzerinden credential al
#    c. Frontend Verifier'da (5174) VerifyRequest'te QR oluştur
#    d. Web Wallet'ta /present'te QR tara
#    e. "Present Credentials" → success
#    f. Verifier Results'ta "verified: true" görmeli
```

## Risks

| Risk | Etki | Mitigation |
|------|------|------------|
| Camera permission denied | QR scanner çalışmaz | Manuel URI paste desteği (her zaman mevcut) |
| HTTPS gerekli (getUserMedia) | Camera localhost dışında çalışmaz | Dev'de localhost yeterli, prod'da HTTPS zorunlu |
| Backend holder agent'ta credential yok | `presentationSubmitted: false` | UI'da açık "No matching credentials" mesajı |
| html5-qrcode DOM manipülasyonu | React lifecycle çakışması | useEffect cleanup + ref ile container yönetimi |
| İki VP flow karışıklığı | Yanlış URI format parse edilemez | URI validation: `openid4vp://` + `request_uri` param kontrolü |
| Wallet-only credential'lar present edilemez | Backend holder agent bilmiyor | Bilinen sınırlılık, ayrı todo (007) |
