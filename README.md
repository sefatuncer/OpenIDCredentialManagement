# OpenID Credential Management System

Self-Sovereign Identity (SSI) system implementing OpenID4VCI and OpenID4VP standards for AI agent credential management.

## Project Structure

```
├── backend/                 # Node.js API server
├── frontend-issuer-verifier/  # Issuer/Verifier dashboard (React)
├── web-wallet/              # Web wallet application (React)
├── postman/                 # API collection for testing
└── docker-compose.yml       # Docker deployment
```

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Redis (optional)

### Backend

```bash
cd backend
cp .env.example .env
# Edit .env with your configuration
npm install
npm run dev
```

### Frontend (Issuer/Verifier)

```bash
cd frontend-issuer-verifier
npm install
npm run dev
```

### Web Wallet

```bash
cd web-wallet
cp .env.example .env
# Edit .env with your configuration
npm install
npm run dev
```

### Docker

```bash
docker-compose up -d
```

## Configuration

Copy `.env.example` to `.env` in each project and configure:

| Variable | Required | Description |
|----------|----------|-------------|
| JWT_SECRET | Yes | JWT signing secret |
| API_KEY | Yes | Admin API key |
| DB_HOST | Yes | PostgreSQL host |
| DB_PASSWORD | Yes | PostgreSQL password |
| WEB_WALLET_SECRET | Yes | Client secret for web-wallet |

## API Documentation

Swagger UI available at: `http://localhost:3000/api-docs`

## License

MIT
