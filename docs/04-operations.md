# Operations Runbook

Everything needed to keep the deployed instance alive, recover it, or move it
to another host — written so it can be followed without any prior context.

**No secret belongs in this file.** Passwords and connection strings live only
in the host's environment settings and in the local `.env`, which is git-ignored.

---

## 1. What is deployed where

| Piece | Where |
|---|---|
| Application (API + built interface, single origin) | Render web service, Frankfurt |
| Database | Render PostgreSQL 17 |
| Source of truth for the service definition | [`render.yaml`](../render.yaml) |
| Deploy trigger | every push to `main` |

The service runs with `SERVE_FRONTEND=true`, so one process answers both the API
and the interface. There is no separate frontend host and no CORS configuration
to keep in sync.

`RUN_MIGRATIONS_ON_BOOT=true` and `SEED_ON_BOOT=true` are what make a
shell-less platform workable: on start-up the process applies any pending
migration and runs the **idempotent** base seed (currencies, chart of accounts,
permissions, admin user). Running it twice changes nothing.

---

## 2. The free database expires — this is the one dated task

A Render free PostgreSQL instance is deleted **30 days after it is created**,
and the current one expires **2026-10-26**. Nothing warns the application; it
simply stops being able to connect.

Moving to a database with no expiry date is a single environment change:

1. Create a free project at [neon.com](https://neon.com) (or any Postgres host)
   and copy its connection string.
2. Export the current data, while the old database still exists:
   ```bash
   pg_dump "<old connection string>" -Fc -f backup.dump
   ```
3. Restore into the new one:
   ```bash
   pg_restore -d "<new connection string>" --no-owner backup.dump
   ```
4. In the Render dashboard → the web service → **Environment**, set
   `DATABASE_URL` to the new connection string and save. Render redeploys.

The application accepts `DATABASE_URL` as a full alternative to the individual
`DB_*` settings, so no code changes and no rebuild are involved. If the dump is
skipped, step 4 alone still produces a working system — boot migrations plus the
base seed build an empty but valid set of books, and the demo data can be
regenerated with §4.

> Verify the host offers TLS and that the connection string carries
> `?sslmode=require`; the application does not weaken certificate checking.

---

## 3. Accounts

| Account | Purpose |
|---|---|
| `admin` | full access — password is in the local `.env` and the Render environment only |
| `demo` | read-only walkthrough account, safe to share publicly |

The `demo` role holds 16 read permissions (including cash-box reconciliation) and
no write permission at all, so every attempt to create, edit or post returns
`403` from the server regardless of what the interface offers. That is what makes
its password publishable.

To rotate the admin password: sign in as `admin` → Users → change password.
Doing so bumps the user's `tokenVersion`, which invalidates every issued token
immediately rather than at expiry.

---

## 4. Rebuilding the demo dataset

```bash
cd backend
npm run seed:demo                     # against the local database
DEMO_API=https://<host>/api/v1 npm run seed:demo   # against a deployment
```

The script drives the **public API**, not the tables, so everything it creates is
backed by genuine journal entries and passes the reconciliation and
trial-balance screens. `SKIP_BACKDATE=true` skips spreading the history over past
dates, which is much faster when the only goal is having data on screen.

It creates two cash boxes, four correspondent offices, twelve customers,
twenty-six transfers, fifteen exchange deals and nine vouchers.

---

## 5. Symptoms and causes

| Symptom | Cause and what to do |
|---|---|
| First load takes 40–60 seconds | Free hosting suspends an idle service after 15 minutes. Expected. Open the link once yourself before sending it to anyone. |
| "Too many attempts" on the sign-in screen | The login limiter charges **failed** attempts only, 20 per address per 15 minutes. A correct sign-in costs nothing. Wait 15 minutes; it clears itself. |
| Everything returns a database error at once | Most likely the expiry in §2. Check the database still exists in the dashboard before looking anywhere else. |
| Deploy fails with `TS2688` / `TS5102` | The build ran without devDependencies, so the platform's own global TypeScript compiled the project instead of the pinned one. `NPM_CONFIG_PRODUCTION=false` and `npm ci --include=dev` are what prevent it — both are in `render.yaml`. |
| Deploy fails on an unexpected Node version | [`.node-version`](../.node-version) pins 22.11.0. Without it the platform picks its newest release, which may be ahead of the toolchain. |
| A cash box balance looks wrong | Open the reconciliation screen: it compares the stored balance against the sum of the ledger. Because the posting engine is the only writer of balances, a non-zero difference means data was changed outside the application, not a calculation error. |

---

## 6. Confirming the books are sound

Both suites are safe to re-run at any time and are idempotent:

```bash
cd backend
npm run verify              # both suites: 41 financial-rule + 9 race-condition checks
npm run verify:financial    # the 41 financial-rule checks on their own
npm run verify:concurrency  # the 9 race-condition checks on their own
```

They read the admin credentials from `.env`, so they keep working after a
password change, and `DEMO_API` points them at a deployment instead of
localhost. The concurrency suite deliberately fires simultaneous conflicting
requests — run it against a deployment only when nobody is using it.
