---
id: "008"
title: "VP Flow Birleştirme (verifier.agent vs openid4vp.service)"
status: pending
priority: low
category: architecture
created: 2026-03-11
---

## Açıklama

Projede iki ayrı VP flow implementasyonu var:

1. **`verifier.agent.ts`** → `/api/v1/verifier/verify/*` routes
   - URI: `openid4vp://?client_id=...&request_uri=...` (request_uri fetch pattern)
   - Frontend verifier ve holder agent bunu kullanıyor
   - `redirect_uri` kullanıyor (response_uri değil)

2. **`openid4vp.service.ts`** → `/api/v1/openid4vp/*` routes
   - URI: `openid4vp://?response_type=vp_token&...&presentation_definition=...` (inline params)
   - Draft 20+ uyumlu (`response_uri`, `client_id_scheme`)
   - Hiçbir frontend/wallet tarafından aktif kullanılmıyor

## Sorun

- İki farklı URI format, iki farklı session storage, iki farklı verification logic
- `verifier.agent.ts` eski spec (`redirect_uri`), `openid4vp.service.ts` yeni spec (`response_uri`)
- Maintenance burden: aynı feature'ı iki yerde update etmek gerekiyor

## Önerilen Çözüm

- `verifier.agent.ts` route'larını `openid4vp.service.ts`'e yönlendirmek (proxy/redirect)
- Veya `verifier.agent.ts`'i `openid4vp.service.ts`'in wrapper'ı haline getirmek
- Frontend ve wallet'ı yeni path'e migrate etmek

## Kabul Kriterleri

- [ ] Tek bir VP flow implementasyonu
- [ ] Frontend verifier ve wallet yeni path'i kullanıyor
- [ ] Eski route'lar deprecated/redirect
