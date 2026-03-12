---
title: "Real-time Revocation Webhooks — EventBus→WebSocket→Webhook Pipeline"
date: 2026-03-12
module: all
related_todos: [015]
---

## Goal

Gerçek zamanlı revocation bildirim sistemi: (1) mevcut kopuk servisleri (WebSocket, ExpirationNotifier) bağla, (2) EventBus→WebSocket bridge kur, (3) HTTP webhook subscription CRUD + delivery ekle, (4) frontend webhook yönetim UI'ı ekle.

## Research Findings

### Mevcut Altyapı (Bağlanmamış)
- `websocket.service.ts` (149L) — `/ws` endpoint, `broadcast()`, `emitCredentialRevoked()` hazır. **AMA** `wsService.initialize(server)` hiçbir yerde çağrılmıyor.
- `expirationNotifier.service.ts` (291L) — `start()`, `onExpiring()`, `trackCredential()` hazır. **AMA** `expirationNotifier.start()` hiçbir yerde çağrılmıyor.
- `event-bus.ts` (421L) — `credential.revoked`, `credential.unrevoked` event'leri revocation.service.ts'den emit ediliyor. **AMA** hiçbir subscriber bağlı değil.
- `revocation.service.ts` (556L) — `revokeCredential()` → `eventBus.emit('credential.revoked', ...)` zaten çalışıyor.
- `revocation.routes.ts` (580L) — 9 endpoint mevcut, webhook endpoint yok.

### Eksik Olan
1. WebSocket initialization (1 satır, `index.ts`)
2. ExpirationNotifier start (1 satır, `index.ts`)
3. EventBus → WebSocket bridge (event listener'lar)
4. HTTP webhook subscription CRUD servisi (yeni)
5. Webhook delivery engine (retry + dead letter)
6. Webhook management API route'ları (yeni)
7. Frontend webhook yönetim sayfası (yeni)

### Kullanılacak Mevcut Pattern'ler
- `createStorageAdapter<T>('webhooks')` — PostgreSQL persistence (map-to-storage-adapter pattern)
- `asyncHandler()` — route handler sarmalama (CLAUDE.md güvenlik notu)
- `strictRateLimiter` — mutation endpoint'lerde rate limit
- Zod validation — `validation.schemas.ts`'ye ekleme
- EventBus subscription — `eventBus.on('credential.revoked', handler)`

## Implementation Steps

### Phase 1: Mevcut Servisleri Bağla (Wire-up)

#### Step 1 — WebSocket + ExpirationNotifier initialization → `backend/src/index.ts`
- `server` oluşturulduktan sonra `wsService.initialize(server)` çağır
- `initializeCore` sonrası `expirationNotifier.start()` çağır
- Shutdown'da `wsService.close()` + `expirationNotifier.stop()` ekle
- Import'ları ekle: `wsService`, `expirationNotifier`

#### Step 2 — EventBus → WebSocket bridge → `backend/src/index.ts`
- `eventBus.on('credential.revoked', ...)` → `wsService.emitCredentialRevoked()`
- `eventBus.on('credential.issued', ...)` → `wsService.emitCredentialIssued()`
- `eventBus.on('credential.unrevoked', ...)` → `wsService.broadcast()`
- Server start sonrası, shutdown öncesi wire-up

### Phase 2: Webhook Service (Backend)

#### Step 3 — Webhook Service → `backend/src/services/webhook.service.ts` (YENİ)

**Data Model:**
```typescript
interface WebhookSubscription {
  id: string              // wh_<uuid>
  url: string             // https://example.com/webhook
  secret: string          // HMAC-SHA256 signing secret
  events: string[]        // ['credential.revoked', 'credential.issued', ...]
  active: boolean
  createdAt: string
  updatedAt: string
  metadata?: {
    name?: string         // İnsan-okunur isim
    description?: string
    createdBy?: string    // Actor DID
  }
}

interface WebhookDelivery {
  id: string              // del_<uuid>
  webhookId: string
  event: string
  payload: object
  status: 'pending' | 'success' | 'failed'
  attempts: number
  lastAttemptAt?: string
  nextRetryAt?: string
  responseStatus?: number
  responseBody?: string
  createdAt: string
}
```

**Functions:**
- `createSubscription(url, events, secret?, metadata?)` → WebhookSubscription
- `updateSubscription(id, updates)` → WebhookSubscription
- `deleteSubscription(id)` → boolean
- `listSubscriptions()` → WebhookSubscription[]
- `getSubscription(id)` → WebhookSubscription | null
- `testSubscription(id)` → { success, responseStatus, latencyMs }

**Delivery Engine:**
- `deliverEvent(event, payload)` — find matching subscriptions → POST to each
- HMAC-SHA256 signature in `X-Webhook-Signature` header
- Payload: `{ event, data, timestamp, deliveryId }`
- Retry: 3 attempts, exponential backoff (1s, 10s, 60s)
- Timeout: 10s per request
- Failed after 3 attempts → log to delivery history, mark `failed`

**Storage:**
- `webhooks` collection → `createStorageAdapter<WebhookSubscription>('webhooks')`
- `webhook_deliveries` collection → `createStorageAdapter<WebhookDelivery>('webhook_deliveries')`

#### Step 4 — EventBus → Webhook bridge → `backend/src/index.ts`
- `eventBus.on('credential.revoked', (e) => webhookService.deliverEvent('credential.revoked', e.data))`
- `eventBus.on('credential.issued', (e) => webhookService.deliverEvent('credential.issued', e.data))`
- `eventBus.on('credential.unrevoked', (e) => webhookService.deliverEvent('credential.unrevoked', e.data))`
- Tüm credential.* event'leri webhook'lara da iletilir

### Phase 3: Webhook API Routes

#### Step 5 — Zod Validation → `backend/src/api/schemas/validation.schemas.ts`
```typescript
export const webhookCreateSchema = z.object({
  url: z.string().url('Valid HTTPS URL required'),
  events: z.array(z.string()).min(1, 'At least one event required'),
  name: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
})

export const webhookUpdateSchema = webhookCreateSchema.partial()
```

#### Step 6 — Webhook Routes → `backend/src/api/routes/webhook.routes.ts` (YENİ)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/webhooks` | GET | Yes | List all subscriptions |
| `/webhooks/:id` | GET | Yes | Get subscription detail + recent deliveries |
| `/webhooks` | POST | Yes | Create subscription (returns secret) |
| `/webhooks/:id` | PUT | Yes | Update subscription |
| `/webhooks/:id` | DELETE | Yes | Delete subscription |
| `/webhooks/:id/test` | POST | Yes | Send test event |
| `/webhooks/:id/deliveries` | GET | Yes | Delivery history (last 50) |

- All mutation endpoints: `strictRateLimiter`
- All endpoints: `authMiddleware`
- `asyncHandler()` wrapper on all handlers

#### Step 7 — Mount Routes → `backend/src/api/server.ts`
- Import `webhookRoutes`
- Mount at `/api/v1/webhooks`

### Phase 4: Frontend Webhook Management

#### Step 8 — API Functions → `frontend-issuer-verifier/src/services/api.ts`
```typescript
export const webhookApi = {
  list: () => api.get('/webhooks'),
  get: (id: string) => api.get(`/webhooks/${id}`),
  create: (data) => api.post('/webhooks', data),
  update: (id, data) => api.put(`/webhooks/${id}`, data),
  delete: (id) => api.delete(`/webhooks/${id}`),
  test: (id) => api.post(`/webhooks/${id}/test`),
  deliveries: (id) => api.get(`/webhooks/${id}/deliveries`),
}
```

#### Step 9 — Webhook Management Page → `frontend-issuer-verifier/src/pages/WebhookManagement.tsx` (YENİ)
- **Subscription List:** Tablo — name, URL, events, active status, actions
- **Create Modal:** URL, events (checkbox multi-select), name, description
- **Detail View:** Subscription info + delivery history (status, attempts, response)
- **Test Button:** Test event gönder, sonucu göster
- **Event Types:** `credential.revoked`, `credential.issued`, `credential.unrevoked`, `verification.completed`

#### Step 10 — Register Route + Nav → `frontend-issuer-verifier/src/App.tsx` + `IssuerDashboard.tsx`
- Route: `/issuer/webhooks` → `WebhookManagement`
- IssuerDashboard'a "Webhooks" kart ekle

### Phase 5: WebSocket Frontend Integration

#### Step 11 — WebSocket hook → `frontend-issuer-verifier/src/hooks/useWebSocket.ts` (YENİ)
```typescript
export function useWebSocket(onMessage: (msg: WSMessage) => void) {
  // Connect to ws://backend/ws
  // Auto-reconnect with exponential backoff
  // Return { connected, send, close }
}
```

#### Step 12 — Real-time toast notifications → `frontend-issuer-verifier/src/components/NotificationToast.tsx` (YENİ)
- WebSocket'ten gelen `credential:revoked`, `credential:issued` event'leri için toast
- 5 saniye auto-dismiss
- IssuerDashboard layout'una mount et

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `backend/src/index.ts` | Modify | WebSocket init, ExpirationNotifier start, EventBus→WS+Webhook bridge |
| `backend/src/services/webhook.service.ts` | **Create** | Webhook CRUD + HMAC delivery engine + retry logic |
| `backend/src/api/routes/webhook.routes.ts` | **Create** | 7 CRUD + test + deliveries endpoints |
| `backend/src/api/schemas/validation.schemas.ts` | Modify | webhookCreateSchema, webhookUpdateSchema |
| `backend/src/api/server.ts` | Modify | Mount `/api/v1/webhooks` routes |
| `frontend-issuer-verifier/src/services/api.ts` | Modify | webhookApi functions |
| `frontend-issuer-verifier/src/pages/WebhookManagement.tsx` | **Create** | Webhook subscription CRUD + delivery log UI |
| `frontend-issuer-verifier/src/hooks/useWebSocket.ts` | **Create** | WebSocket client hook with auto-reconnect |
| `frontend-issuer-verifier/src/components/NotificationToast.tsx` | **Create** | Real-time toast notifications |
| `frontend-issuer-verifier/src/App.tsx` | Modify | Add `/issuer/webhooks` route |
| `frontend-issuer-verifier/src/pages/IssuerDashboard.tsx` | Modify | Add Webhooks nav card |

## Validation

### Phase 1 (Wire-up)
```bash
cd backend && npx tsc --noEmit
# Start backend → console log: "WebSocket server initialized on /ws"
# wscat -c ws://localhost:3000/ws → should receive welcome message
```

### Phase 2-3 (Webhook Service + Routes)
```bash
cd backend && npx tsc --noEmit

# Create webhook
curl -X POST http://localhost:3000/api/v1/webhooks \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://webhook.site/<id>","events":["credential.revoked"],"name":"Test"}'

# Test webhook
curl -X POST http://localhost:3000/api/v1/webhooks/<id>/test \
  -H "Authorization: Bearer <token>"

# Revoke credential → webhook.site should receive POST
curl -X POST http://localhost:3000/api/v1/revocation/revoke \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"credentialId":"<id>","reason":"test"}'
```

### Phase 4-5 (Frontend)
```bash
cd frontend-issuer-verifier && npx tsc --noEmit
# UI: IssuerDashboard → Webhooks kart → Webhook Management sayfası
# Create subscription → table'da görünmeli
# Test butonu → delivery history'de success/fail
# Revoke credential → toast notification görünmeli
```

## Risks

1. **HMAC secret güvenliği:** Secret'lar DB'de plaintext saklanacak (envelope encryption zaten mevcut ama webhook secret'lar düşük risk — sadece signing için). Envelope encryption uygulamak overengineering olur.
2. **Retry goroutine leak:** setInterval/setTimeout based retry'lar process restart'ta kaybolur. Mitigasyon: delivery records DB'de tutularak restart sonrası kalan retry'lar tekrar schedule edilebilir (v2 iyileştirme).
3. **Webhook URL validation:** SSRF riski — `url` alanında private IP (10.x, 172.16.x, 192.168.x, localhost) engellemeli. Step 3'te `isPrivateUrl()` check ekle.
4. **Delivery volume:** Çok fazla webhook subscription + yüksek event rate → HTTP request flood. Mitigasyon: max 20 subscription limit, per-subscription rate limit (10 req/min).
