# OpenID Credential Management System

## Proje Bilgisi
- **Repo:** https://github.com/sefatuncer/OpenIDCredentialManagement
- **Tür:** Monorepo - SSI (Self-Sovereign Identity) sistemi
- **Standartlar:** OpenID4VCI, OpenID4VP, DID, JWT, SD-JWT

## Klasör Yapısı

```
├── backend/                    # Node.js + Express API
│   ├── src/
│   │   ├── api/               # REST endpoints, middleware
│   │   ├── services/          # Business logic
│   │   ├── database/          # PostgreSQL, migrations
│   │   ├── agents/            # Issuer, Verifier, Holder agents
│   │   └── simulation/        # Test simulation engine
│   ├── k8s/                   # Kubernetes configs
│   └── docker/                # Docker, Prometheus, Grafana
│
├── frontend-issuer-verifier/   # React + Vite - Admin Dashboard
│   └── src/
│       ├── pages/             # Login, IssuerDashboard, VerifierDashboard
│       ├── components/        # UI components
│       └── services/          # API calls, auth, storage
│
├── web-wallet/                 # React + Vite - Holder Wallet
│   └── src/
│       ├── pages/             # Credentials, Delegations, Trust
│       ├── services/          # agent.service.ts, api.service.ts
│       └── types/             # TypeScript types
│
└── postman/                    # API test collection
```

## Temel Özellikler

### Backend (Port 3000)
- Credential issuance (OpenID4VCI)
- Credential verification (OpenID4VP)
- Trust registry
- Revocation lists
- Agent delegation system
- Audit logging

### Frontend Issuer/Verifier
- Issuer: Credential oluşturma, revocation
- Verifier: Verification request, trust management

### Web Wallet
- Agent identity yönetimi
- Credential saklama
- Delegation (yetki devri)
- Trust relationships

## Güvenlik Notları (Production-Ready)
- Hardcoded secret YOK - tüm secret'lar env variable
- Demo mode KALDIRILDI
- CORS whitelist zorunlu
- sessionStorage kullanılıyor (localStorage değil)
- Client credentials bcrypt ile hash'leniyor
- JWT_SECRET, API_KEY, WEB_WALLET_SECRET zorunlu

## Çalıştırma
```bash
# Backend
cd backend && npm run dev

# Frontend
cd frontend-issuer-verifier && npm run dev

# Wallet
cd web-wallet && npm run dev
```

## Git
- Branch: main
- .env dosyaları gitignore'da
- docs/ ve *.md (README hariç) gitignore'da
