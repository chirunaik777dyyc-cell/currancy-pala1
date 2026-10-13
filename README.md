# Pala Currency (PA)

A responsive full-stack demo wallet for **Pala**, using **PA** as its display symbol and **PAL** as its internal currency code. It includes account registration/login, a wallet balance, peer-to-peer demo transfers, transaction history, profile settings, PostgreSQL persistence, and a Render Blueprint.

> **Important:** This repository is a software prototype. Pala credits are fictional demo units with no cash value. It is not a blockchain, bank, regulated currency, payment service, or a way to issue redeemable money. New accounts receive 1,000 demo PA credits for testing.

## Included features

- Responsive desktop and mobile web interface
- Registration and sign-in with bcrypt password hashing
- Signed JWT sessions
- PostgreSQL-backed users, wallets, and transaction ledger
- Atomic database transactions for transfers
- Server-side amount validation and insufficient-balance checks
- Search and filter transaction history
- Send credits by username or email, with optional note
- Profile username updates
- Balance privacy toggle and copy-username action
- API health endpoint and basic rate limiting
- Render Blueprint (`render.yaml`) to provision the web service and PostgreSQL database

## Requirements

- Node.js 20 or newer
- PostgreSQL 14 or newer
- npm

## Run locally

1. Install Node.js and PostgreSQL.
2. Create a PostgreSQL database named `pala`.
3. Copy `.env.example` to `.env`.
4. Update `DATABASE_URL` with your local PostgreSQL username/password and database.
5. Set `JWT_SECRET` to a random secret at least 32 characters long.
6. Install dependencies and run:

```bash
npm install
npm run build
npm start
```

Open `http://localhost:10000`.

For frontend-only hot reload while developing, run the API in one terminal with `npm run dev`, then run `npm run dev:client` in another terminal. For split-port development, configure a Vite `/api` proxy to `http://localhost:10000` in `vite.config.js`, or use the production-style single-server flow above.

## Deploy with GitHub + Render

1. Create a new GitHub repository and upload/push all files in this folder.
2. In Render, choose **New → Blueprint** and connect that repository.
3. Render reads `render.yaml`, creates the Node web service and PostgreSQL database, and generates `JWT_SECRET`.
4. Wait for the first deploy to finish. Open the Render service URL.
5. Confirm `https://YOUR-SERVICE.onrender.com/api/health` returns `{"ok":true,...}`.

The free Render plan may sleep during inactivity and may have database limits. Do not use free-tier infrastructure for real financial or production-critical workloads. Check Render's current plan and persistence terms before deployment.

## API overview

All JSON responses are served from `/api`.

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/auth/register` | Create account and 1,000 demo credits |
| `POST` | `/api/auth/login` | Sign in |
| `GET` | `/api/me` | Current profile and wallet |
| `GET` | `/api/transactions?limit=50` | Transaction history |
| `POST` | `/api/transfers` | Send demo credits |
| `PATCH` | `/api/profile` | Update username |

Authenticated routes require `Authorization: Bearer YOUR_TOKEN`.

Example transfer body:

```json
{
  "recipient": "other_username",
  "amount": "12.50",
  "note": "Demo transfer"
}
```

## Before any real-world use

This code is a starting project, not a security audit or a guarantee of zero bugs/latency. Before any public or real-money use, get an independent security review; add email verification, password reset, account recovery, stronger session/device controls, monitoring, automated tests, database backups, privacy/terms pages, abuse controls, and an operational incident plan. Real-money, redeemable, exchangeable, or blockchain functionality requires a separate architecture and qualified legal/financial advice. Never store real funds or sensitive financial data in this prototype.

## Troubleshooting

- **`DATABASE_URL is required`:** set it in `.env` locally or configure it in Render.
- **Database connection errors:** verify the database is running and the connection string/password is correct.
- **`JWT_SECRET must be set`:** configure a random secret of 32+ characters in your environment.
- **Render deploy succeeds but page fails:** inspect Render logs, then check `/api/health`.
- **First page is slow on free Render:** the instance may be waking from sleep; this is platform behavior, not necessarily a frontend issue.
