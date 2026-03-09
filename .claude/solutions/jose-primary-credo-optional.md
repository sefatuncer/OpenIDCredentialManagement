---
title: "Jose PRIMARY, Credo Opsiyonel SSI Mimarisi"
tags: [ssi, jose, credo-ts, architecture, fallback, did, jwt, openid4vci, openid4vp]
category: architecture
difficulty: medium
date: 2026-03-09
---

## Problem

SSI (Self-Sovereign Identity) sisteminde iki farklı kriptografi kütüphanesi kullanılıyor:
- **Jose**: Pure JavaScript, native modül gerektirmez
- **Credo-TS**: Hyperledger Aries tabanlı, @credo-ts/askar native modülü gerektirir

Askar modülü Windows'ta Visual Studio Build Tools gerektiriyor ve kurulumu karmaşık. Bu durum:
- Development ortamında sorunlara yol açıyor
- CI/CD pipeline'larını zorlaştırıyor
- Yeni geliştiricilerin projeye başlamasını engelliyor

## Approach

**Jose'yi PRIMARY, Credo'yu OPTIONAL** olarak konumlandırdık:

1. **Base Agent (Jose)**: Ana SSI implementasyonu
   - `base.agent.ts` - DID:key oluşturma, JWT-VC signing/verification
   - Native modül gerektirmez, her yerde çalışır
   - OpenID4VCI ve OpenID4VP destekli

2. **Credo Agent (Opsiyonel)**: Gelişmiş özellikler için
   - `credo.agent.ts` - Hyperledger Aries protokolleri
   - Sadece askar modülü kuruluysa aktif
   - Otomatik fallback mekanizması

3. **Credo Service**: Akıllı mod seçimi
   ```typescript
   const askarAvailable = await checkAskarAvailability()
   if (!askarAvailable) {
     logger.info('Using Jose-based SSI implementation (primary mode)')
     return false // Jose kullan
   }
   ```

## Key Details

### Dosya Yapısı
- `backend/src/agents/base.agent.ts` - Jose tabanlı PRIMARY implementation
- `backend/src/agents/credo.agent.ts` - Credo tabanlı OPTIONAL implementation
- `backend/src/services/credo.service.ts` - Singleton pattern ile mode yönetimi

### Mode Algılama
```typescript
export async function checkAskarAvailability(): Promise<boolean> {
  try {
    await import('@credo-ts/askar')
    return true
  } catch {
    return false
  }
}
```

### Fallback Chain
1. `credo.service.ts` → `checkAskarAvailability()` çağırır
2. Askar varsa → Credo agent başlatılır
3. Askar yoksa → Jose mode aktif (bu normal durum)
4. Servisler (`openid4vci.service.ts`, `openid4vp.service.ts`) → `isUsingCredo()` kontrol eder

## Lessons Learned

1. **Native modüller opsiyonel olmalı**: Kritik yol native modüle bağımlı olmamalı
2. **Graceful degradation**: Gelişmiş özellikler olmadan da temel işlevsellik sağlanmalı
3. **Health check**: Her iki modun durumu izlenebilir olmalı
4. **Log clarity**: Hangi modda çalışıldığı açıkça loglanmalı

## Prevention

- Yeni SSI özelliği eklerken önce Jose'da implement et
- Credo-only özellikler için kullanılabilirlik kontrolü zorunlu
- `scripts/setup-credo.ps1` ile kolay Credo kurulumu sağla
- Health endpoint'te aktif modu göster (`mode: 'jose' | 'credo'`)
