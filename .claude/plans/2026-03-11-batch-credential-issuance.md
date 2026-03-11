---
title: "Batch Credential Issuance — Service Wire-up + Issuer Endpoint + Frontend UI"
date: 2026-03-11
module: all
related_todos: [001]
---

## Goal

`batchIssuanceService` (parallel processing, retry, job tracking) zaten var ama hiçbir endpoint'e bağlı değil. Servisi wire-up edip, async job-based `/issuer/credentials/batch` endpoint'i oluşturup, frontend'de CSV/JSON import + progress tracking UI ekleyeceğiz.

## Research Findings

### Mevcut Altyapı
- **`batchIssuanceService`** (`batchIssuance.service.ts`): Complete — parallel processing (10 concurrent), retry (3 attempts), chunking (50/batch), job tracking. `jobs` Map in-memory (todo 002 Fase 2'de migrate edilecek).
- **`issueBatchCredentials()`** (`openid4vci.service.ts:1012`): OID4VCI spec endpoint, serial loop, `batchIssuanceService` KULLANMIYOR. Buna dokunmuyoruz.
- **Interface mismatch:** `BatchCredentialRequest` (subjectDid, credentialType, claims) ≠ `CredentialRequest`. Bridge gerekli.
- **Issuer agent:** `issueAgentIdentityCredential` vb. offer oluşturuyor. Batch için doğrudan JWT-VC veren lightweight `issueCredentialDirect()` gerekli.
- **Feature flag:** `module.batch-issuance` — default enabled.
- **Frontend:** Batch sayfası yok. `IssueCredential.tsx` tek credential. `CredentialForm.tsx` form component.

### Tasarım Kararları
1. **Async job pattern:** Batch 100 credential → background job. Client jobId alır, polling ile status izler.
2. **`batchIssuanceService` kullan** (mevcut parallel + retry altyapısı) — serial loop yazma.
3. **`issueCredentialDirect()`** — offer flow bypass, doğrudan JWT-VC oluştur + issuedStorage'a kaydet.
4. **Tek credential type per batch** — mixed type overkill.

## Implementation Steps

### Step 1: `issueCredentialDirect()` fonksiyonu → `issuer.agent.ts`

Offer oluşturmadan doğrudan JWT-VC veren lightweight fonksiyon:

```typescript
export async function issueCredentialDirect(
  holderDid: string,
  credentialType: string,
  claims: Record<string, unknown>,
  options: { format?: 'jwt_vc_json' | 'vc+sd-jwt' } = {}
): Promise<{ credentialId: string; credential: string }>
```

- `createJwtVc()` kullanır (mevcut `base.agent.ts` utility)
- `issuedStorage`'a kaydeder
- `batchIssuanceService.setIssuer()` callback'i olarak çağrılır

### Step 2: Service wire-up — boot'ta issuer bağla → `issuer.agent.ts`

`initializeIssuerAgent()` sonunda:
```typescript
batchIssuanceService.setIssuer(async (req) => {
  return issueCredentialDirect(req.subjectDid, req.credentialType, req.claims)
})
```

### Step 3: Zod validation schema → `validation.schemas.ts`

```typescript
export const batchIssuanceSchema = z.object({
  credentialType: z.enum(['AIAgentIdentityCredential', 'DelegationCredential', 'CapabilityCredential']),
  format: z.enum(['jwt_vc_json', 'vc+sd-jwt']).optional().default('jwt_vc_json'),
  recipients: z.array(z.object({
    holderDid: z.string().regex(/^did:(key|web|peer):[a-zA-Z0-9._%-]+$/),
    claims: z.record(z.unknown()),
  })).min(1).max(100),
})
```

### Step 4: Batch endpoints → `issuer.routes.ts`

3 yeni endpoint:

| Method | Path | Açıklama |
|--------|------|----------|
| POST | `/credentials/batch` | Batch job oluştur → jobId döndür |
| GET | `/credentials/batch/:jobId` | Job status (polling) |
| GET | `/credentials/batch/:jobId/results` | Job sonuçları |

POST handler:
1. recipients → `BatchCredentialRequest[]` dönüştür (id=index, subjectDid=holderDid, credentialType, claims)
2. `batchIssuanceService.createBatchJob(requests)` → jobId
3. Return `{ jobId, totalRequests }`

GET status handler:
1. `batchIssuanceService.getJobStatus(jobId)` → job veya 404

GET results handler:
1. `batchIssuanceService.getJobResults(jobId)` → results array

### Step 5: Frontend API fonksiyonları → `api.ts`

```typescript
issuerApi.issueBatch(data) → POST /issuer/credentials/batch
issuerApi.getBatchStatus(jobId) → GET /issuer/credentials/batch/{jobId}
issuerApi.getBatchResults(jobId) → GET /issuer/credentials/batch/{jobId}/results
```

### Step 6: Batch Issue page → `BatchIssue.tsx` (yeni)

3-step wizard:
1. **Input:** Credential type dropdown + format + recipients (JSON textarea veya CSV upload)
2. **Progress:** jobId ile polling (2sn interval), progress bar
3. **Results:** Success/fail counts + detail table (credential tipi, holderDid, status, error)

CSV parse: basit `split('\n')` + `split(',')` — Papa Parse gibi library eklemeye gerek yok.
JSON parse: `JSON.parse()` ile textarea'dan parse.

### Step 7: Route + Dashboard link

- `App.tsx`: `/issuer/issue-batch` route ekle
- `IssuerDashboard.tsx`: "Batch Issue" kartı/linki ekle

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `backend/src/agents/issuer.agent.ts` | Modify | `issueCredentialDirect()` + boot'ta `batchIssuanceService.setIssuer()` |
| `backend/src/api/schemas/validation.schemas.ts` | Modify | `batchIssuanceSchema` ekle |
| `backend/src/api/routes/issuer.routes.ts` | Modify | 3 yeni batch endpoint (POST, GET status, GET results) |
| `frontend-issuer-verifier/src/services/api.ts` | Modify | 3 batch API fonksiyonu |
| `frontend-issuer-verifier/src/pages/BatchIssue.tsx` | Create | Batch issue wizard page |
| `frontend-issuer-verifier/src/App.tsx` | Modify | `/issuer/issue-batch` route |
| `frontend-issuer-verifier/src/pages/IssuerDashboard.tsx` | Modify | Batch issue link |

## API Contract

### `POST /api/v1/issuer/credentials/batch`

**Request:**
```json
{
  "credentialType": "AIAgentIdentityCredential",
  "format": "jwt_vc_json",
  "recipients": [
    { "holderDid": "did:key:z6Mk...", "claims": { "agent_name": "Agent-1", "agent_type": "autonomous" } },
    { "holderDid": "did:key:z6Mk...", "claims": { "agent_name": "Agent-2", "agent_type": "assistant" } }
  ]
}
```

**Response (202 Accepted):**
```json
{ "jobId": "batch-1710000000000-abc123", "totalRequests": 2 }
```

### `GET /api/v1/issuer/credentials/batch/:jobId`

**Response:**
```json
{
  "jobId": "batch-...",
  "status": "processing",
  "totalRequests": 2,
  "processedCount": 1,
  "successCount": 1,
  "failureCount": 0
}
```

### `GET /api/v1/issuer/credentials/batch/:jobId/results`

**Response:**
```json
{
  "results": [
    { "id": "0", "success": true, "credentialId": "cred-...", "credential": "eyJ..." },
    { "id": "1", "success": false, "error": "Invalid DID" }
  ]
}
```

## Validation

```bash
# TypeScript compile
cd backend && npx tsc --noEmit
cd frontend-issuer-verifier && npx tsc --noEmit

# API test — batch submit
curl -X POST http://localhost:3000/api/v1/issuer/credentials/batch \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"credentialType":"AIAgentIdentityCredential","recipients":[{"holderDid":"did:key:z6MkTest","claims":{"agent_name":"Test"}}]}'
# → 202 { "jobId": "batch-...", "totalRequests": 1 }

# Job status polling
curl http://localhost:3000/api/v1/issuer/credentials/batch/{jobId}
# → { "status": "completed", "successCount": 1, ... }
```

## Risks

| Risk | Olasılık | Etki | Mitigasyon |
|------|----------|------|------------|
| `batchIssuanceService.setIssuer()` callback exception | Düşük | Job fails | `issueWithRetry()` zaten 3 retry yapıyor |
| Job status polling overhead | Düşük | Extra DB/memory reads | In-memory Map, read ucuz |
| 100 credential parallel signing yavaş | Orta | ~10sn (10 concurrent) | Kabul edilebilir, progress UI gösterir |
| CSV parsing edge case (quotes, newlines) | Orta | Bad parse | JSON alternatif sunulur, frontend preview ile kontrol |
