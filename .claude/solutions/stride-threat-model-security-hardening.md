# STRIDE Threat Model & Security Hardening Pattern

## Problem

SSI sistemlerinde güvenlik analizi genellikle feature bazlı yapılır (ör. "issuance güvenli mi?", "VP flow güvenli mi?"). Bu yaklaşım cross-cutting threat'leri (rate limiting bypass, pre-auth DoS, header spoofing) kaçırır çünkü bu tehditler birden fazla feature'ı kesen altyapı katmanlarında yaşar.

## Solution: Layer-Based STRIDE Analysis

### 1. Mimari Katman Yapısı (7 Layer)

STRIDE analizini feature bazlı değil, mimari katman bazlı yap:

```
Layer 1: API Gateway (rate limiting, CORS, TLS)
Layer 2: Authentication & Authorization (JWT, API key, PKCE, policy engine)
Layer 3: Credential Issuance (OpenID4VCI, SD-JWT, offer flow)
Layer 4: Credential Verification (OpenID4VP, direct_post, VP validation)
Layer 5: Delegation & Trust (chain attenuation, cascade revoke, trust registry)
Layer 6: Storage & Persistence (PostgreSQL, encryption at rest, key management)
Layer 7: External Integrations (HLF, DIDComm, Keycloak, webhooks, SSRF surface)
```

Her katmanda 6 STRIDE kategorisini değerlendir:
- **S**poofing — identity falsification
- **T**ampering — data modification
- **R**epudiation — action deniability
- **I**nformation Disclosure — data leakage
- **D**enial of Service — availability attack
- **E**levation of Privilege — unauthorized access

### 2. Rate Limiter Key Generator Kuralı

**Anti-pattern (P1 vulnerability):**
```typescript
// YANLIS: Client-supplied header rate limit key'de
const key = req.headers['x-tenant-id'] || req.ip;
// Saldırgan X-Tenant-ID'yi her istekte değiştirerek limiti bypass eder
```

**Correct pattern:**
```typescript
// DOGRU: Yalnızca authenticated/server-generated değerler
const key = req.apiKey || req.ip;
// apiKey middleware tarafından doğrulanmış, IP server tarafından belirleniyor
```

**Kural:** Rate limiter key generator'da kullanılan her değer şu testlerden geçmeli:
1. Server tarafından üretilmiş mi? (IP, session ID) → OK
2. Authentication middleware tarafından doğrulanmış mı? (API key, JWT sub) → OK
3. Client tarafından sağlanmış ve doğrulanmamış mı? (X-Tenant-ID, X-Forwarded-For) → REJECT

### 3. Pre-Auth Endpoint Rate Limiting

Express'te middleware mount sırası önemlidir. Global rate limiter'dan önce mount edilen route'lar korunmaz:

```typescript
// server.ts mount order
app.use('/oid4vp/direct_post', directPostRouter);  // <- global limiter'dan ÖNCE
app.use(globalRateLimiter);                          // <- buradan sonrakiler korunur
app.use('/api/v1', apiRouter);
```

**Çözüm:** Pre-auth endpoint'lere per-route rate limiter ekle:

```typescript
// direct_post.routes.ts
import rateLimit from 'express-rate-limit';

const directPostLimiter = rateLimit({
  windowMs: 60 * 1000,    // 1 dakika
  max: 30,                 // max 30 istek/dakika per IP
  keyGenerator: (req) => req.ip,  // yalnızca IP (authenticated değil)
  standardHeaders: true,
});

router.post('/:sessionId', directPostLimiter, asyncHandler(handleDirectPost));
```

**Pre-auth endpoint'ler listesi (bu projede):**
- `POST /oid4vp/direct_post/:sessionId` — VP response submission
- `GET /oid4vci/.well-known/*` — issuer metadata
- `POST /oid4vci/token` — token exchange
- `GET /oid4vci/credential-offer/:offerId` — offer fetch

### 4. Batch Rate Limiter (Per-Caller)

Batch endpoint'ler (credential issuance, verification) tek istekte N operasyon yapar. Standard rate limiter istek sayısını sınırlar ama operasyon sayısını sınırlamaz:

```typescript
// Per-caller batch rate limiter
const batchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,                          // 100 batch istek/dakika
  keyGenerator: (req) => req.apiKey || req.ip,
  // + request body'deki batch size validation (Zod)
});

// Zod schema'da batch size sınırı
const batchSchema = z.object({
  items: z.array(itemSchema).max(50),  // max 50 item per batch
});
```

### 5. OWASP Agentic AI Top 10 Mapping

SSI agent sistemleri için OWASP Agentic AI Top 10 compliance kontrolü:

| # | Threat | SSI Karşılığı | Kontrol |
|---|--------|---------------|---------|
| 1 | Prompt Injection | N/A (LLM yok) | - |
| 2 | Broken Access Control | Delegation scope bypass | Policy engine + scope attenuation |
| 3 | Broken Authentication | API key/JWT bypass | 3-strategy auth chain |
| 4 | Excessive Agency | Agent over-delegation | Max depth + scope narrowing |
| 5 | Inadequate Sandboxing | Credential scope leak | Tenant isolation |
| 6 | Improper Output Handling | VP response injection | Zod validation + type guards |
| 7 | Insufficient Monitoring | Silent failures | Audit logging + EventBus |
| 8 | Supply Chain Vulnerabilities | Credo/Jose deps | npm audit + lockfile |
| 9 | Insecure Credential Storage | Key material at rest | Envelope encryption |
| 10 | Insufficient Error Handling | Stack trace leak | errorHandler middleware |

### 6. Threat Matrix Template

50 threat'i değerlendirirken bu format kullan:

```
| ID | Layer | STRIDE | Threat | Likelihood | Impact | Risk | Mitigation | Status |
|----|-------|--------|--------|------------|--------|------|------------|--------|
| T01 | L1 | D | Rate limit bypass via header rotation | High | Medium | High | Fix key generator | DONE |
| T02 | L1 | D | Pre-auth DoS on direct_post | High | High | Critical | Per-route limiter | DONE |
```

Risk = Likelihood x Impact (Low/Medium/High/Critical)

## Key Insights

1. **Katman bazlı analiz cross-cutting threat'leri yakalar.** Rate limiting, header spoofing, mount order gibi sorunlar tek bir feature'a ait değil — API Gateway katmanında yaşar ve tüm feature'ları etkiler.

2. **Rate limiter key'ler trust boundary'dir.** Key generator fonksiyonuna giren her değer bir trust kararıdır. Client-supplied ama unvalidated değerler saldırı yüzeyidir.

3. **Express mount order = security boundary.** Middleware sırası güvenlik sınırını belirler. Global rate limiter'dan önce mount edilen her route, rate limiting korumasının dışındadır.

4. **STRIDE + OWASP Agentic AI birlikte kullan.** STRIDE genel tehdit kategorilerini kapsar, OWASP Agentic AI agent-specific (delegation, sandboxing, excessive agency) tehditleri ekler.

## Files

- `backend/src/api/server.ts` — rate limiter mount order, per-route limiters
- `backend/src/api/middleware/` — rate limiter key generators
- `backend/src/api/routes/` — per-route rate limiters on pre-auth endpoints
- `.claude/plans/2026-03-12-stride-threat-modeling.md` — full threat model document
