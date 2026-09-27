<div align="center">

# Remittance, Currency Exchange & Accounting System

A production-grade, multi-currency back office for a money-transfer bureau —
built as a real double-entry accounting system, not a CRUD application.

<br>

![Node](https://img.shields.io/badge/Node.js-22_LTS-339933?style=flat-square&logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![TypeORM](https://img.shields.io/badge/TypeORM-0.3-FE0803?style=flat-square)
![Tailwind](https://img.shields.io/badge/Tailwind-v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)

**[▶ Live demo](https://remittance-office.onrender.com)** · `demo` / `Demo-View-2026!`

<sub>Read-only account, entirely fictional data. Free hosting sleeps when idle —
the first load may take up to a minute.</sub>

</div>

---

## Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Features](#features)
- [The accounting core](#the-accounting-core)
- [Security model](#security-model)
- [Internationalisation](#internationalisation)
- [Verification](#verification)
- [Running locally](#running-locally)
- [Deployment](#deployment)
- [Documentation](#documentation)

---

## Overview

A complete back office for a money-transfer bureau: sending and paying out
remittances, currency exchange, multi-currency cash boxes, customer and
correspondent accounts, receipt and payment vouchers, and a full general ledger
with financial and operational reporting.

**What makes it different:** this was not built as a set of data-entry screens.
Every financial operation posts a **balanced double-entry journal entry**,
balances are **derived from the ledger** rather than written by hand, and posted
entries are **never edited or deleted** — corrections are made with a reversing
entry.

The interface is available in **Arabic, English and Turkish**, with full RTL
support.

---

## Architecture

The system is split into two independent applications with separate dependency
trees and build pipelines. They communicate **exclusively** over a documented
HTTP API and share no code or state.

```
accounts-transfer/
│
├── backend/                     REST API — independent application
│   ├── src/
│   │   ├── config/              environment, data source, chart of accounts, permissions
│   │   ├── entities/            database schema (TypeORM)
│   │   ├── services/            ★ all business logic — none of it lives in controllers
│   │   ├── controllers/         thin: parse request → call service → return response
│   │   ├── routes/              paths and the permission each one requires
│   │   ├── middleware/          auth, authorisation, validation, centralised errors
│   │   ├── validations/         Zod schema per input
│   │   ├── models/              data contracts between layers
│   │   ├── utils/               exact decimal arithmetic, i18n messages, numbering
│   │   └── database/            migrations and base seed
│   └── scripts/                 verification suites and demo data
│
├── frontend/                    Single-page application — independent
│   └── src/
│       ├── api/                 HTTP client + one module per API domain
│       ├── app/                 entry point, providers, design system
│       ├── components/          ui / common / layout
│       ├── context/             auth, language, theme
│       ├── features/            hooks and queries per feature
│       ├── pages/               application screens
│       ├── routes/              routing and permission guards
│       ├── i18n/                three message catalogues
│       ├── lib/                 formatting, permissions, helpers
│       └── types/               types mirroring the API contracts
│
└── docs/                        architecture, database schema, API reference
```

### Why the separation matters

| Concern | `backend/` | `frontend/` |
|---|---|---|
| Responsibility | business logic, journal entries, authorisation | presentation and interaction |
| Source of truth | ✅ the only authority | ❌ decides nothing |
| Input validation | ✅ mandatory on every request | UX assistance only |
| Permissions | ✅ checked on every request | hides what the user cannot use |
| Financial calculation | ✅ computed and re-computed here | renders what the server returns |
| Build output | `tsc` → `dist/` | `vite build` → `dist/` |

> **Hiding a button is not a security control.** Every operation is
> re-authorised on the server, and a hand-crafted request is rejected with `403`
> regardless of what the interface displayed.

---

## Tech stack

<table>
<tr><th align="left">Backend</th><th align="left">Frontend</th></tr>
<tr valign="top"><td>

- **Node.js** + **TypeScript** (`strict`)
- **Express** — HTTP layer
- **TypeORM** — ORM and migrations
- **PostgreSQL** — database
- **Zod** — input validation
- **JWT** + **bcrypt** — authentication
- **Helmet** / **CORS** / **compression**

</td><td>

- **React 18** + **TypeScript**
- **Vite** — build tooling
- **Tailwind CSS v4** — design system
- **TanStack Query** — server state
- **React Hook Form** + **Zod**
- **Radix UI** — accessible primitives
- **React Router** — routing

</td></tr>
</table>

---

## Features

<details open>
<summary><b>Remittances</b></summary>

- Send and pay out, with an enforced lifecycle: `Pending → Sent → Received`, or `Cancelled`
- **Illegal transitions are impossible** — a cancelled transfer cannot be paid, and a paid transfer cannot be paid twice
- Full status history: who changed what, when, and why
- Payout desk search by transfer number, phone, or beneficiary name
- Commission charged to sender or beneficiary; optional currency conversion at a cross rate
- Printable receipt with a QR code
- Transfers can be routed through a correspondent office instead of paid from a cash box

</details>

<details>
<summary><b>Currency exchange and rates</b></summary>

- Buying and selling against a published buy/sell board
- Cross rates computed automatically between any two currencies via the base currency
- **Full rate history** — a rate is never overwritten; it is closed and a new one opened, so any past deal can be re-priced at the rate that was live when it was booked
- Deals can be reversed with a complete reversing entry

</details>

<details>
<summary><b>Cash boxes and correspondents</b></summary>

- Independent balance per currency within each cash box
- Box-to-box transfers, opening balances, statements, closing
- **Reconciliation screen** — compares the recorded balance against the sum of the ledger and shows any difference
- Running current accounts with partner offices abroad, each with its own statement

</details>

<details>
<summary><b>Customers, vouchers and commissions</b></summary>

- Customer profile with a statement combining remittances, exchange deals and vouchers
- Net position per currency, taken directly from the ledger
- Receipt and payment vouchers, voidable by reversing entry
- Configurable commission rules: fixed, percentage or tiered, with floors and caps

</details>

<details>
<summary><b>Accounting and reporting</b></summary>

- Complete double-entry ledger and chart of accounts
- **Trial balance**, balanced per currency
- Reports: remittances, exchange, commissions, cash boxes, profit & loss, customers, staff
- Live dashboard with period filtering (day / week / month / custom range)

</details>

<details>
<summary><b>Administration and audit</b></summary>

- Fine-grained, fully editable roles and permissions
- Audit trail for every action touching money or authorisation: user, action, before/after payload, timestamp, IP address

</details>

---

## The accounting core

Three invariants are enforced **structurally** — not by convention or discipline:

| # | Invariant | How it is guaranteed |
|:--:|---|---|
| **I1** | Every entry balances **within each currency** | The posting engine refuses an unbalanced entry and rolls back the whole operation |
| **I2** | A cash box balance always equals the sum of the ledger | The engine is the **only writer** of balances and derives each delta from the very lines it is inserting, under a row-level lock |
| **I3** | Posted entries are **never edited or deleted** | No update or delete path exists in the code; corrections are made with a reversing entry |

Because every money path goes through the same engine, a service that forgets to
check a balance still **cannot** overdraw a cash box, and a service that builds a
lopsided entry **cannot** post it.

**Multi-currency** is handled through an FX position (clearing) account, so each
currency's book balances on its own without inventing a fictitious base-currency
amount.

**Numeric precision:** amounts travel as decimal strings and are manipulated as
scaled `BigInt` values — **no floating-point number ever touches a balance.**

---

## Security model

- **Access token (JWT)**, short-lived, carrying the minimum: subject, role and a
  version counter — no name, no phone, no permission list
- **Refresh token**: an opaque random value in an `httpOnly` cookie, stored only
  as a keyed hash and **rotated on every use**, so replaying one fails and
  reveals the theft
- **Permissions are read from the database on every request**, so suspending a
  user or changing a role takes effect on their next request rather than at
  token expiry
- Passwords hashed with **bcrypt**; login attempts are rate-limited by failure
  (a correct sign-in costs nothing, so shared office addresses are not locked
  out), and an unknown username is compared against a dummy hash so response
  time does not reveal which accounts exist

---

## Internationalisation

Arabic · English · Türkçe, with full RTL support.

**System messages are translated on the server.** Services raise a message key
with parameters, and the response layer renders it in the caller's language.
That is what turns an HTTP status into something an operator can act on:

> Insufficient balance to complete the operation. The available balance in cash
> box "Main" for USD is 500, while the required amount is 1,000 USD.

---

## Verification

The system was run against a live PostgreSQL instance and exercised end to end.

### Financial operations — 41/41 ✅

- Overdrafts refused, quoting the exact available and required amounts
- Payout before dispatch refused; double payout refused; cancelling a paid transfer refused
- Cross-currency transfers priced through the base currency; commission correctly retained after payout
- Cancellation returns exactly what was collected
- **Cash boxes reconcile against the ledger with zero difference**
- **Trial balance balanced in every currency**

### Concurrency — 9/9 ✅

| Test | Result |
|---|---|
| 6 simultaneous payout requests for one transfer | Exactly **one** succeeded; the box was debited once |
| 10 simultaneous $200 withdrawals from a $1,000 box | Exactly **five** succeeded; the balance landed on **zero** and never went negative |
| Books after the races | Balanced in every currency |

Both suites are part of the repository and are safe to re-run:

```bash
npm run verify
```

---

## Running locally

**Requirements:** Node.js 20+ · PostgreSQL 14+

<table>
<tr><th align="left">Backend</th><th align="left">Frontend</th></tr>
<tr valign="top"><td>

```bash
cd backend
npm install
cp .env.example .env
npm run migration:run
npm run seed
npm run dev
```

`http://localhost:4000`

</td><td>

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

`http://localhost:5173`

</td></tr>
</table>

To populate a realistic dataset for a walkthrough:

```bash
npm run seed:demo
```

Demo data is created through the public API rather than by inserting rows, so
the seeded history is backed by genuine journal entries and passes the
reconciliation and trial-balance screens.

---

## Deployment

Setting `SERVE_FRONTEND=true` makes the API serve the built interface from its
own port: a single origin, no CORS and no development proxy.

```bash
cd frontend && npm run build
cd ../backend && npm run build && npm start
```

[`render.yaml`](render.yaml) describes the whole service, so a hosted
environment can be recreated from the repository. `DATABASE_URL` is accepted as
an alternative to the individual `DB_*` settings, and migrations and the
idempotent base seed can run on boot — which is what allows deployment to a
platform that offers no shell access.

---

## Documentation

| Document | Contents |
|---|---|
| [`docs/01-architecture.md`](docs/01-architecture.md) | Layers, invariants, chart of accounts, and the exact journal entry for every operation |
| [`docs/02-database-schema.md`](docs/02-database-schema.md) | Every table, column, index and relationship |
| [`docs/03-api-endpoints.md`](docs/03-api-endpoints.md) | Every endpoint with its required permission, plus the error-code table |
