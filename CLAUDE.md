# SEANPHONE — Internal Cloud Phone Dashboard (continue-here doc)

> **You are continuing work on SEANPHONE**, a private, self-hosted web dashboard
> for a small office (~10 workers + 1 admin). Workers get assigned US phone
> numbers and send/receive **SMS** through them from a web inbox. Usage is
> tracked against an internal **credit** balance (no real money). It's an
> internal alternative to apps like WePhone.
>
> Read this whole file first. Then run `git log --oneline -15` and summarize the
> current state before changing anything.

---

## TL;DR to get running (fresh machine)

```bash
git clone https://github.com/allkindofstuff000/SEANPHONE.git
cd SEANPHONE
npm install
```

You need a **PostgreSQL** database. Two options:

- **Easiest (recommended on a new machine):** a free hosted Postgres from
  [Neon](https://neon.tech) or Supabase. Copy its connection string.
- **Local:** any local Postgres.

> The *original* dev machine (Windows) runs a **portable Postgres** at
> `C:\Users\ALGO\pgportable` on **port 5433**, auto-started by
> `scripts/ensure-db.mjs`. **That install is NOT in the repo** — a different
> machine must supply its own database. On a non-Windows / different machine,
> `npm run dev`'s `predev` hook just prints a warning and continues, so point
> `DATABASE_URL` at a running Postgres yourself (Neon is simplest — always on).

Then:

```bash
# Windows PowerShell:  Copy-Item server/.env.example server/.env
cp server/.env.example server/.env
#   edit server/.env — set DATABASE_URL, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm run db:migrate    # create tables
npm run db:seed       # create the first admin from ADMIN_EMAIL/ADMIN_PASSWORD
npm run dev           # web http://localhost:5173  ·  api http://localhost:4000
```

Log in with the ADMIN_EMAIL / ADMIN_PASSWORD you set. **No Twilio account is
needed** — the app defaults to a built-in **mock** SMS provider (see below).

---

## Tech stack

- **Frontend:** React (Vite) + TypeScript + **Tailwind CSS v4** + **@tanstack/react-query**
- **Backend:** Node.js + Express + TypeScript
- **DB:** PostgreSQL via **Prisma ORM**
- **Auth:** email + password, **bcryptjs**, **JWT in an httpOnly cookie**, roles `admin` / `worker`
- **CPaaS:** Twilio, isolated behind one `providerService` (with a mock impl)
- **Monorepo:** npm **workspaces** (`server/`, `web/`), no pnpm

## Repo layout

```
.
├─ package.json            # root scripts (dev, build, db:*), workspaces
├─ scripts/                # ensure-db.mjs / stop-db.mjs (local portable Postgres helpers)
├─ server/                 # Express + TS API
│  ├─ prisma/
│  │  ├─ schema.prisma     # data model (5 tables)
│  │  ├─ seed.ts           # seeds the first admin from .env
│  │  └─ migrations/       # committed — run with prisma migrate
│  └─ src/
│     ├─ index.ts          # express bootstrap + route mounting
│     ├─ env.ts            # zod-validated env (fails fast)
│     ├─ prisma.ts         # single PrismaClient
│     ├─ middleware/       # auth (JWT→req.user), requireRole, error handler + asyncHandler
│     ├─ lib/              # jwt, password (bcryptjs), publicUser, phone (E.164 normalize)
│     ├─ routes/           # auth, users, numbers, messages, conversations, webhooks, dev
│     └─ services/
│        ├─ providerService.ts   # THE CPaaS seam (selects twilio | mock)
│        ├─ provider/{types,mock,twilioProvider}.ts
│        ├─ creditService.ts     # THE only place credit balances change (atomic + ledger)
│        └─ messageService.ts    # sendOutbound / handleInbound / threading
└─ web/                    # React (Vite) + TS
   └─ src/
      ├─ main.tsx          # QueryClient + BrowserRouter + AuthProvider + ToastProvider
      ├─ App.tsx           # routes
      ├─ index.css         # Tailwind v4 @theme tokens (the "refined" theme)
      ├─ api/{client.ts, queries.ts}   # fetch wrapper + react-query hooks & query keys
      ├─ auth/{AuthContext.tsx, ProtectedRoute.tsx}
      ├─ components/{AppLayout.tsx, Toast.tsx, icons.tsx}
      ├─ lib/format.ts     # phone/time/handle formatting
      └─ pages/{DashboardPage, InboxPage, LoginPage, admin/{AdminUsersPage, AdminNumbersPage}}
```

## Two architectural seams (do not bypass these)

1. **`server/src/services/providerService.ts`** — the *only* module that talks to
   a CPaaS. It exports a `provider` chosen at startup:
   - `TwilioProvider` when `PROVIDER=twilio` (or Twilio creds are present),
   - `MockProvider` otherwise (simulates search/buy/send/receive; **default**).
   Swapping to Telnyx = add one file implementing `PhoneProvider` and edit `build()`.
   Never import the Twilio SDK anywhere else.
2. **`server/src/services/creditService.ts`** — the *only* place a credit balance
   changes, and it **always writes a `LedgerEntry` in the same transaction**.
   Debits use a conditional decrement so a worker can't oversell. Use
   `adjustCredits(...)` / `setBalance(...)`; never write `user.creditBalance` directly.

## Data model (`server/prisma/schema.prisma`)

- **User** — id, email, passwordHash, role(admin|worker), isActive, creditBalance, timestamps
- **PhoneNumber** — id, e164Number, twilioSid, status(active|released), assignedUserId?, timestamps
- **Conversation** — id, workerNumberId, contactNumber, lastMessageAt, **lastReadAt?** (unread tracking); unique(workerNumberId, contactNumber)
- **Message** — id, conversationId, direction(inbound|outbound), body, fromNumber, toNumber, twilioSid?, status, createdAt
- **LedgerEntry** — id, userId, amount(signed), reason, relatedMessageId?, balanceAfter, createdAt

Derived at read time (not stored): a number's `operationalStatus` (active if
assigned, idle if unassigned, released), `messagesToday`, `lastActivityAt`; a
conversation's `unread` (last message inbound & newer than `lastReadAt`) and
`assignedWorker`.

## API (all under `/api`, cookie-authed, except the webhook)

```
POST /api/auth/login | logout        GET /api/auth/me
GET  /api/users                      POST /api/users                 (admin)
PATCH /api/users/:id                 (admin: isActive, password, role)
POST /api/users/:id/credits/adjust | /credits/set   GET /api/users/:id/ledger  (admin)
GET  /api/numbers                    (admin: all; worker: own — enriched)
GET  /api/numbers/available          POST /api/numbers               (admin: search / buy)
POST /api/numbers/:id/assign | /release                              (admin)
POST /api/messages                   (send outbound; must own the from-number)
GET  /api/conversations              GET /api/conversations/:id
PATCH /api/conversations/:id/read
POST /api/dev/simulate-inbound       (DEV ONLY — fake an inbound SMS; 403 in production)
POST /webhooks/twilio/sms            (inbound; Twilio signature validated; NOT under /api)
GET  /api/health
```

## Environment variables (`server/.env`; template in `server/.env.example`)

- `DATABASE_URL` (required), `JWT_SECRET` (required, ≥16 chars)
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` (used by `npm run db:seed`)
- `PORT` (4000), `CORS_ORIGIN` (http://localhost:5173), `SMS_COST_CREDITS` (1)
- Real SMS: `PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
  `PUBLIC_BASE_URL` (public https base for inbound webhooks, e.g. an ngrok URL)
- **Secrets are gitignored** (`server/.env`). Never commit real values.

## Scripts (root `package.json`)

```
npm run dev         # predev auto-starts local portable PG (if present), then api + web
npm run db:start    # start local portable Postgres (Windows dev machine only)
npm run db:stop     # stop it
npm run db:migrate  # prisma migrate dev
npm run db:seed     # prisma db seed  (admin from .env)
npm run db:studio   # Prisma Studio (DB browser)
npm run build       # tsc (server) + tsc --noEmit && vite build (web)
```

Per-workspace typecheck (use these to verify changes):

```
npx tsc --noEmit -p server/tsconfig.json
npx tsc --noEmit -p web/tsconfig.json
```

## UI theme ("seanphone-refinement")

Copied from the client's Replit mockups. Tokens live in `web/src/index.css`
(Tailwind v4 `@theme`): bg `#101716`, cards `#171f1e`, border `#2b3935`, text
`#edf2ee`, muted `#93a49e`, mint primary `#9ee9c3` on dark-green text `#133126`;
fonts **Manrope** (UI) + **DM Mono** (numbers/times); rounded 10px cards / 7px
controls. Use semantic classes (`bg-card`, `text-primary`, `border-border`, etc.)
and `font-mono` for numbers so re-theming stays centralized.

- **Dashboard** (`/`): active-numbers grid + conversation stream, live UTC+6 clock.
- **Messages** (`/inbox`): eyebrow + heading + subtitle, search + "Unread only",
  Recent-conversations list, a SELECTED THREAD summary panel, and a focused
  thread view (`/inbox?conversation=<id>&focus=1`) with composer + "Simulate reply".
- Dashboard OPEN INBOX → `/inbox?number=<id>` (list filtered); INSPECT → focused thread.

## What's built (done ✅)

Auth + roles + protected routes · admin user management (create/disable/reset-pw/roles)
· credits + atomic ledger · numbers (search/buy/assign/release) · outbound SMS with
credit reserve/refund · inbound webhook + threading + dedupe · read/unread + mark-read
· dashboard + refined Messages UI · React Query polling + invalidation · mock provider
so it all works end-to-end without Twilio.

## What's next (roadmap / TODO)

**Make it real:** wire real Twilio (creds + `PUBLIC_BASE_URL` tunnel); a Twilio
**status-callback** webhook to update `queued→sent→delivered/failed`; **STOP/HELP/START**
opt-out compliance; 10DLC/A2P registration; **deployment** (host + managed Postgres +
backups + HTTPS) and remove demo seed data.
**Security:** login rate-limit + lockout, self-service password reset, CSRF review
(cookie is `sameSite=lax`), token refresh UX.
**Product:** contacts/names (we only store numbers), backend search + pagination,
real-time (SSE/WebSocket) instead of polling, unread badges/notifications, MMS,
message templates, scheduled messages, CSV export, a proper Team page.
**Quality:** replace/remove cosmetic header metrics; add automated tests + CI.
**Big future phases (from original brief):** WebRTC voice calling; AI support bot
(LLM over the conversation threads — the data model is built to plug into); real payments.

## Known gotchas

- **The local portable Postgres is machine-specific and NOT in the repo** — a new
  machine must provide its own DB (`DATABASE_URL`). `scripts/ensure-db.mjs` hardcodes
  the Windows dev path with env overrides (`PG_PORTABLE_ROOT`, `PG_PORTABLE_DATA`,
  `PGPORT_LOCAL`); if not found it no-ops. Prefer hosted Neon on other machines.
- **Windows `prisma generate` EPERM:** if a Node/dev process is holding the query
  engine DLL, `prisma generate` fails to rename it. Stop `npm run dev` (and stray
  `node` processes) first, then re-run migrate/generate.
- **Mock vs Twilio:** default is mock. Real inbound needs `PUBLIC_BASE_URL` (a public
  tunnel) or Twilio can't reach the webhook.
- **`npm audit`** flags an esbuild dev-server-only advisory via Vite 5 — does not
  affect production builds; left as-is to avoid a breaking Vite major bump.
- **No deploy/VPS yet** (unlike other projects) — deployment is a TODO above.

See `README.md` for a shorter user-facing setup, and this file for the full picture.
