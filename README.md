# نظام إدارة مكتب حوالات وصرافة ومحاسبة

Remittance, currency-exchange and accounting system for a money-transfer office.
Multi-currency, double-entry, fully auditable — Arabic / English / Turkish.

```
.
├── docs/         architecture, database schema and API reference
├── backend/      Node + Express + TypeScript + TypeORM + PostgreSQL
└── frontend/     React + TypeScript + Vite + Tailwind v4
```

---

## ⚠ One setup note before anything else

The project folder is currently `F:\accounts&transfer`. **The `&` breaks `npm run`
on Windows**: `cmd.exe` treats it as a command separator, so npm splits the path
and every script fails with

```
'transfer\backend\node_modules\.bin\' is not recognized as an internal or external command
```

Nothing in the code is affected — only npm's script runner. Rename the folder
once and every `npm run …` below works:

```bash
F: && ren "F:\accounts&transfer" accounts-transfer
```

Until then, call the binaries directly (`./node_modules/.bin/vite`,
`./node_modules/.bin/ts-node …`), which is how this project was built and tested.

---

## 1. What makes this an accounting system, not a CRUD app

Three invariants are enforced structurally, not by convention
(see [docs/01-architecture.md](docs/01-architecture.md)):

| # | Invariant | How it is guaranteed |
|---|-----------|----------------------|
| **I1** | Every journal entry balances **within each currency** | `LedgerService.post()` refuses to write an unbalanced entry and rolls the whole operation back |
| **I2** | A cash box balance always equals `SUM(ledger entries)` for that box + currency | `post()` is the *only* writer of `cash_box_balances`; it derives each delta from the lines it is inserting, under a `FOR UPDATE` row lock, in the caller's transaction |
| **I3** | Ledger entries are append-only | There is no update or delete path. Corrections are made with a reversing entry |

Because every money path goes through the same posting engine, a service that
forgets to check a balance still cannot overdraw a box, and a service that
builds a lopsided entry cannot commit it.

Multi-currency is handled with a **FX position (clearing) account**, so each
currency's book balances on its own instead of inventing a fake base-currency
amount. Money is carried as exact decimal **strings** and manipulated as scaled
`BigInt` (`backend/src/utils/money.ts`) — no float ever touches a balance.

---

## 2. Prerequisites

- Node.js 18+ (built and tested on 24)
- PostgreSQL 14+ (tested on 18), reachable on `localhost:5432`
- pgAdmin (optional, for inspecting the schema)

## 3. Backend

```bash
cd backend
npm install
cp .env.example .env      # then edit the DB credentials and the JWT secrets
```

`.env` is validated at boot — the process refuses to start with a missing or
too-short JWT secret, and refuses to start at all if `DB_SYNCHRONIZE` is on in
production.

Create the database (once), then set up the schema and the seed data:

```bash
createdb -U postgres remittance_office
```

```bash
npm run migration:run
```

```bash
npm run seed
```

The seeder is idempotent — re-running it tops up new permissions and currencies
without duplicating or wiping anything. It creates:

- 43 permissions and the `admin` / `manager` / `employee` roles
- the administrator from `SEED_ADMIN_*` (**change the password immediately**)
- SYP (base), USD, EUR, TRY, GBP with an indicative opening rate board
- the chart of accounts and the `MAIN` cash box with its `1000-MAIN` cash account
- two starting commission rules

Run it:

```bash
npm run dev
```

The API listens on `http://localhost:4000/api/v1`.

## 4. Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Opens on `http://localhost:5173` and proxies `/api` to the backend, so the
browser sees a single origin and the httpOnly refresh cookie works without any
cross-site cookie handling.

Sign in with the seeded administrator (`admin` / the `SEED_ADMIN_PASSWORD`
from the backend `.env`).

---

## 5. Security model

- **Access token** — JWT, 15 minutes, carries only `sub`, `jti`, `role` and a
  `tokenVersion`. No name, no phone, no permission list.
- **Refresh token** — opaque random value in an httpOnly cookie, stored only as
  a keyed hash, and **rotated** on every use so a replayed token is detectable.
- **Permissions are resolved from the database on every request**, so suspending
  a user, changing their role or editing a role's permissions takes effect on
  their very next request rather than at token expiry.
- The frontend hides what an operator cannot use; every endpoint checks the same
  permission again server-side. Hiding a button is never the control.
- Passwords are bcrypt (cost 12). Login is throttled per IP, and an unknown
  username is compared against a dummy hash so the response time does not reveal
  which accounts exist.

## 6. Languages

Arabic, English and Turkish, with RTL for Arabic. **Error and success messages
are localised on the server**: services throw an i18n *key* plus parameters, and
the response layer renders it in the caller's language. That is what turns a
`409` into:

> الرصيد غير كافٍ لإتمام العملية. الرصيد المتاح في صندوق "الصندوق الرئيسي" بعملة USD هو 500، بينما المبلغ المطلوب هو 1,000 USD.

The language travels in an `X-Language` header (browsers forbid a script from
setting `Accept-Language`), falling back to `?lang=`, then `Accept-Language`,
then the user's stored preference.

---

## 7. Verification performed

The system was run against a live PostgreSQL 18 instance and exercised
end-to-end. All checks passed.

**Financial scenario — 40/40**

- opening balances posted through the ledger, second one for the same currency refused
- overdraw refused with the exact available/required figures
- commission rule applied (1 %, clamped) and the cash box rose by precisely the collected amount
- lifecycle enforced: payout before dispatch refused, double payout refused, cancelling a paid transfer refused
- after payout the office retained exactly the commission
- cross-currency transfer priced through the base currency (`10000 / 270 = 37.037037…`)
- cancellation returned exactly what was collected
- exchange buy moved +1,000 USD / −10,000,000 SYP; sell priced at the published sell rate
- receipt and payment vouchers posted; void wrote a reversing entry
- **cash box reconciled exactly against the ledger**
- **trial balance balanced in every currency** (SYP, TRY, USD)
- audit trail captured every money operation
- errors rendered correctly in Arabic and Turkish
- an `employee` was refused a screen outside their role

**Concurrency — 8/8**

- six simultaneous payout requests for one transfer → exactly **one** succeeded, the box was debited once
- ten simultaneous 200 USD withdrawals against a 1,000 USD box → exactly **five** succeeded, balance landed on exactly `0`, never negative
- the raced box still reconciled against the ledger, and the whole book still balanced in every currency

---

## 8. Bugs found and fixed during verification

Worth knowing about, because two of them are traps that survive a type-check:

1. **`z.coerce.boolean()` turns the string `"false"` into `true`.** Every
   environment flag was therefore permanently on — including `DB_SYNCHRONIZE`,
   which would have let TypeORM rewrite a production schema. Replaced with an
   explicit parser in `config/env.ts` and `validations/common.validation.ts`.
2. **Reading back through a different connection inside a transaction.** Several
   write paths reloaded the row they had just written with an `AppDataSource`
   repository, which is a separate connection and cannot see uncommitted rows —
   creating a user returned "user not found". They now reload through the
   caller's manager.
3. **TypeORM `orderBy` needs entity property names, not column names**, when
   paginating over joins; `log.created_at` crashed the audit log endpoint.
4. **A rejected CORS origin threw**, turning a policy decision into a 500. It now
   denies by omitting the headers and lets the browser enforce it.
5. **`Accept-Language` is a forbidden header for fetch/XHR** — the browser
   silently dropped it, so server messages ignored the UI language. Moved to
   `X-Language`.
6. **Tailwind's `rtl:` variant outranks `lg:`** by specificity, which parked the
   sidebar off-screen on desktop in Arabic. The off-screen direction is now
   chosen in JS.

---

## 9. Documentation

| Document | Contents |
|---|---|
| [docs/01-architecture.md](docs/01-architecture.md) | layers, invariants, chart of accounts, the FX position technique, and the exact journal entry for every operation |
| [docs/02-database-schema.md](docs/02-database-schema.md) | every table, column, index and relationship |
| [docs/03-api-endpoints.md](docs/03-api-endpoints.md) | every endpoint with its required permission, plus the error-code table |

## 10. Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | start with reload (backend and frontend) |
| `npm run build` | compile |
| `npm run typecheck` | type-check without emitting |
| `npm run migration:run` / `migration:revert` | apply / roll back the schema |
| `npm run migration:generate -- src/database/migrations/<Name>` | generate a migration from entity changes |
| `npm run seed` | idempotent seed |

`GET /api/v1/cash-boxes/:id/reconciliation` is the health check that matters:
it proves the cached balances still equal the ledger.

---

## 11. Fixes after the first round of use

Three issues reported from real use, all now fixed and verified in the browser:

1. **The cash boxes and transfers pages rendered a blank white screen.**
   `Button` with `asChild` passed *two* children into Radix `Slot` (the loading
   spinner slot plus the actual child), and `Slot` accepts exactly one. It threw
   during render, which unmounted the whole React tree — hence a white page
   rather than a broken button. `asChild` now has its own branch that forwards
   the child untouched.
2. **The customer picker showed nothing until you typed a name.** It only
   queried once two characters had been entered. It now opens showing the most
   recent customers, so a clerk can pick a regular without knowing the spelling,
   and typing narrows the same list (debounced at 300 ms).
3. **A crash on one screen took the entire app down.** Added an `ErrorBoundary`
   around the routed content, keyed on the path: a failing screen now degrades
   to one panel with a retry and a way home, and clears on navigation.

---

## 12. Giving someone a demo

Demo data is created by `backend/scripts/seed-demo.mjs`, which drives the
**public API** rather than inserting rows — so the seeded month of history is
backed by real double-entry journal entries and passes the reconciliation and
trial-balance screens live in front of an audience.

```bash
npm run seed:demo
```

It creates two cash boxes, four correspondent offices, twelve customers, ~26
transfers across every status (some routed through partners), ~15 exchange
deals, vouchers, and staff accounts — then back-dates the history over 30 days
while shifting each journal entry by the same offset, so the dashboard and the
books never disagree.

**Accounts.** Each one gets its own password, printed once at the end. Only
`demo` has a fixed, shareable password: it holds every `*.read` permission and
nothing else, so the link is safe to hand to someone you have not met. A write
attempt from it returns `403` from the server, not a hidden button.

### Single-origin mode

Set `SERVE_FRONTEND=true` and the API serves the built UI from its own port.
One origin, no CORS, no dev proxy — which is what makes both the demo tunnel and
a future one-command deployment simple:

```bash
cd frontend && npm run build
```

```bash
cd backend && npm run dev
```

The whole system is then on `http://localhost:4000`.

### Temporary public link

```bash
npm run demo:tunnel
```

`cloudflared` prints a `https://….trycloudflare.com` URL that stays alive only
while the command and the API are running. The URL changes every restart, so
send it shortly before the call rather than days ahead.

Before exposing anything publicly: set a real `SEED_ADMIN_PASSWORD` in `.env`.
The seeder hashes it as given and does **not** apply the password policy that
the API enforces on `/users`, so a weak value there stays weak.
