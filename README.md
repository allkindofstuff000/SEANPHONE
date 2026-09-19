# Internal Cloud Phone Dashboard

A private, self-hosted web dashboard for an internal office (~10 workers + 1
admin). Workers log in, get assigned US phone numbers, and send/receive SMS
through those numbers from a web inbox. Usage is tracked against an internal
**credit** balance per worker — there is no real payment processing.

> **Status:** Foundation build **complete** (Milestones 1–8). WebRTC voice and
> the AI support bot are intentionally out of scope; clean seams are left for
> both (see _Architecture_).

## Features

- **Auth** — email + password, bcrypt hashes, JWT in an httpOnly cookie, two
  roles (`admin`, `worker`), protected routes.
- **User management (admin)** — create/disable workers, reset passwords, set
  roles.
- **Credits + ledger** — every balance change is written with a matching ledger
  entry in the same transaction; sending is blocked when the balance is too low.
- **Numbers (admin)** — search available US numbers by area code, buy/provision
  them (webhook auto-configured), assign to a worker, release.
- **SMS send/receive** — workers send from their numbers (credits deducted,
  refunded on failure); inbound arrives via a signature-validated webhook and is
  threaded into conversations.
- **Inbox** — conversation list (newest first) + thread view + reply composer.

## Tech stack

- **Frontend:** React (Vite) + TypeScript + Tailwind CSS v4
- **Backend:** Node.js + Express + TypeScript
- **Database:** PostgreSQL via Prisma ORM
- **CPaaS:** Twilio, isolated behind `providerService` (with a mock provider)

## Architecture (the two seams that matter)

- **`server/src/services/providerService.ts`** is the *only* module that talks to
  a CPaaS. It selects an implementation at startup:
  - `TwilioProvider` when Twilio creds are present (or `PROVIDER=twilio`)
  - `MockProvider` otherwise — simulates search/buy/send/receive so the whole app
    runs with no Twilio account and no cost.
  Swapping to Telnyx later means adding one implementation file — nothing else
  changes.
- **`server/src/services/creditService.ts`** is the *only* place a credit balance
  changes, and it always writes a `LedgerEntry` in the same DB transaction, so
  the balance and its audit trail can never diverge.

## Prerequisites

- Node.js 20+ (tested on v24) and npm 10+
- PostgreSQL. On this machine a **portable Postgres 16** is already installed at
  `C:\Users\ALGO\pgportable` (port 5433) and starts automatically with
  `npm run dev`. To use a different database, set `DATABASE_URL` in `server/.env`.

## Setup

```bash
npm install
```

`server/.env` already exists on this machine (pointing at the local Postgres,
with a seeded admin and a generated JWT secret). For a fresh checkout, copy the
template and fill it in:

```bash
Copy-Item server/.env.example server/.env   # PowerShell
npm run db:migrate                          # create tables
npm run db:seed                             # create the first admin from .env
```

## Run

```bash
npm run dev
```

- Web: **http://localhost:5173**   ·   API: **http://localhost:4000**
- `npm run dev` auto-starts the local Postgres, then both apps.

**Seeded admin login:** `freefireu906@gmail.com` / `PhoneDashAdmin2026`
(defined in `server/.env` — change it, then `npm run db:seed` for a new admin, or
reset from the Users page).

## Database management

```bash
npm run db:start     # start the local portable Postgres (port 5433)
npm run db:stop      # stop it
npm run db:migrate   # apply/create migrations
npm run db:studio    # open Prisma Studio (DB browser)
npm run db:seed      # seed the admin from ADMIN_EMAIL / ADMIN_PASSWORD
```

## Going live with Twilio

The app runs on the **mock provider** by default. To use real Twilio:

1. Put `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` in `server/.env`
   (the provider auto-switches; or set `PROVIDER=twilio`).
2. For **inbound** SMS, Twilio needs a public URL. Run a tunnel (e.g.
   `ngrok http 4000`) and set `PUBLIC_BASE_URL` to it. New numbers are
   provisioned with their SMS webhook pointed at
   `<PUBLIC_BASE_URL>/webhooks/twilio/sms`, and the endpoint validates Twilio's
   signature.

> ⚠️ Buying a number and sending SMS spend real money on your Twilio account.

## Dev helper

While on the mock provider, the thread view has a **“Simulate reply”** button
(and `POST /api/dev/simulate-inbound`) to fake an incoming SMS so you can see
receiving/threading without Twilio. This endpoint is disabled when
`NODE_ENV=production`.

## API overview

```
POST   /api/auth/login | logout            GET /api/auth/me
GET    /api/users                          POST /api/users
PATCH  /api/users/:id                       (enable/disable, reset pw, role)
POST   /api/users/:id/credits/adjust|set   GET /api/users/:id/ledger
GET    /api/numbers                         GET /api/numbers/available
POST   /api/numbers                         POST /api/numbers/:id/assign|release
POST   /api/messages                        (send outbound)
GET    /api/conversations                   GET /api/conversations/:id
POST   /webhooks/twilio/sms                 (inbound, signature-validated)
GET    /api/health
```

## Project structure

```
.
├─ server/                     # Express + TypeScript API
│  ├─ prisma/schema.prisma     # User, PhoneNumber, Conversation, Message, LedgerEntry
│  └─ src/
│     ├─ middleware/           # auth (JWT→user), requireRole, error handler
│     ├─ routes/               # auth, users, numbers, messages, conversations, webhooks, dev
│     └─ services/
│        ├─ providerService.ts # CPaaS seam (twilio | mock)
│        ├─ creditService.ts   # balance + ledger (atomic)
│        └─ messageService.ts  # send / inbound / threading
├─ web/                        # React (Vite) + TypeScript
│  └─ src/{auth,api,components,pages}
└─ scripts/                    # local Postgres start/stop helpers
```

## Roadmap

1–8 (auth → inbox) ✅ done. Next (future prompts): WebRTC voice, AI support bot,
10DLC registration (handled manually for now), real payments.

## Notes

- `npm audit` flags an **esbuild dev-server-only** advisory via Vite 5; it does
  not affect production builds. Left as-is to avoid a breaking Vite major bump.
