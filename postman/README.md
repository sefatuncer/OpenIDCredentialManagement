# AI Agent Identity System - Postman Collection

Bu klasör, AI Agent Identity System'i test etmek için kapsamlı bir Postman collection'ı içerir.

## Dosyalar

| Dosya | Açıklama |
|-------|----------|
| `AI-Agent-Identity-System.postman_collection.json` | Ana test collection'ı |
| `AI-Agent-Identity-System.postman_environment.json` | Environment değişkenleri |

## Kurulum

### 1. Postman'e Import Et

1. Postman'i aç
2. **Import** butonuna tıkla
3. Her iki JSON dosyasını seç ve import et
4. Environment'ı "AI Agent Identity - Local" olarak seç

### 2. Sistemi Başlat

```bash
cd docker
docker compose up -d
```

### 3. Testleri Çalıştır

Collection'ı sırayla çalıştır (Collection Runner ile):

1. **Run Collection** butonuna tıkla
2. Tüm testleri seç
3. **Run** butonuna bas

## Test Akışı

Collection aşağıdaki sırayla test eder:

```
1. Health & Setup ✅
   └── Health Check
   └── Issuer Metadata
   └── OAuth Metadata

2. Authentication ✅
   └── Get Auth Token ➜ auth_token kaydedilir
   └── Introspect Token

3. Issuer Operations ✅
   └── Get Issuer DID ➜ issuer_did kaydedilir
   └── Create Credential Offer ➜ pre_auth_code kaydedilir
   └── List Offers
   └── Get Offer by ID

4. Holder Operations ✅
   └── Exchange Pre-Auth Code ➜ vci_access_token kaydedilir
   └── Claim Credential ➜ credential_jwt kaydedilir

5. Verifier Operations ✅
   └── Get Presentation Definitions
   └── Create Authorization Request ➜ session_id, state, nonce kaydedilir
   └── Submit VP (Direct Post) ➜ VP token otomatik oluşturulur
   └── Get Session Status
   └── Get Verification Result ➜ verified: true beklenir

6. Trust Registry ✅
   └── List Entities
   └── Add Entity
   └── Check Trust Status (⚠️ endpoint yok)

7. Revocation ✅
   └── Revoke Credential
   └── Check Status
   └── Get Status List

8. Audit Logs ✅
   └── Get All Logs
   └── Get Filtered Logs

9. Backup & Restore ✅
   └── Create Backup
   └── List Backups

10. SD-JWT ✅
    └── Issue SD-JWT
    └── Verify SD-JWT

11. Metrics ✅
    └── Get Prometheus Metrics
```

## Environment Değişkenleri

| Değişken | Açıklama | Otomatik Set |
|----------|----------|--------------|
| `base_url` | API base URL | Hayır (default: http://localhost:3000) |
| `auth_token` | JWT auth token | ✅ 2.1 Get Auth Token |
| `issuer_did` | Issuer DID | ✅ 3.1 Get Issuer DID |
| `pre_auth_code` | Pre-authorized code | ✅ 3.2 Create Credential Offer |
| `offer_id` | Credential offer ID | ✅ 3.2 Create Credential Offer |
| `vci_access_token` | VCI access token | ✅ 4.1 Exchange Pre-Auth Code |
| `c_nonce` | Credential nonce | ✅ 4.1 Exchange Pre-Auth Code |
| `credential_jwt` | Issued credential | ✅ 4.2 Claim Credential |
| `session_id` | Verification session ID | ✅ 5.3 Create Auth Request |
| `vp_state` | VP state | ✅ 5.3 Create Auth Request |
| `vp_nonce` | VP nonce | ✅ 5.3 Create Auth Request |
| `client_id` | Verifier client ID | ✅ 5.3 Create Auth Request |
| `vp_token` | VP token | ✅ 5.4 Submit VP (pre-request script) |

## E2E Flow Testi

Tam credential issuance ve verification flow'u test etmek için:

1. **1.1 Health Check** - Sistem sağlığını kontrol et
2. **2.1 Get Auth Token** - JWT token al
3. **3.2 Create Credential Offer** - Credential offer oluştur
4. **4.1 Exchange Pre-Auth Code** - Token exchange yap
5. **4.2 Claim Credential** - Credential al
6. **5.3 Create Authorization Request** - Verification başlat
7. **5.4 Submit VP** - Credential'ı sun
8. **5.6 Get Verification Result** - `verified: true` olmalı

## Beklenen Sonuçlar

### Başarılı E2E Flow (Test Edildi: 2026-02-05)

```
✅ 1.1 Health Check: status = "healthy"
✅ 2.1 Get Auth Token: access_token alındı
✅ 3.1 Get Issuer DID: did:key:z6Mk... alındı
✅ 3.2 Create Credential Offer: offerId alındı
✅ 4.1 Exchange Pre-Auth Code: access_token alındı
✅ 4.2 Claim Credential: credential alındı (JWT-VC format)
✅ 5.3 Create Auth Request: sessionId, nonce, state alındı
✅ 5.4 Submit VP: status = "received"
✅ 5.5 Get Session Status: status = "verified"
✅ 5.6 Get Verification Result: verified = true
✅ 8.1 Get Audit Logs: logs array alındı
✅ 11.1 Get Metrics: Prometheus format
```

### Tüm Endpoint'ler Çalışıyor (2026-02-05 Güncellemesi)

```
✅ 6.3 Check Entity Trust Status: /api/v1/trust/check/:did - Eklendi
✅ 7.1 Get Status List: /api/v1/revocation/status-list - Eklendi
✅ 9.x Backup endpoints: /api/v1/backup/create ve /api/v1/backup/list - Eklendi
✅ 10.x SD-JWT endpoints: /api/v1/sdjwt/issue - Eklendi
```

> **Not:** Değişikliklerin aktif olması için Docker container'ları yeniden build edilmelidir:
> ```bash
> cd docker
> docker compose down
> docker compose build --no-cache
> docker compose up -d
> ```

## Sorun Giderme

### Token Expired
- **2.1 Get Auth Token** isteğini tekrar çalıştır

### Pre-Auth Code Invalid
- **3.2 Create Credential Offer** isteğini tekrar çalıştır

### Session Not Found
- **5.3 Create Authorization Request** isteğini tekrar çalıştır

### Verification Failed
- VP token'ın doğru nonce içerdiğinden emin ol
- Credential'ın expire olmadığından emin ol

## Notlar

- Collection sıralı çalıştırılmalıdır (önceki adımlar sonraki adımlar için gerekli değişkenleri set eder)
- Pre-request script'ler VP token oluşturma gibi karmaşık işlemleri otomatik yapar
- Test script'leri response'ları doğrular ve değişkenleri kaydeder
