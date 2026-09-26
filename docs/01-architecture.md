# Architecture — Remittance, Exchange & Accounting System

## 1. Guiding principle

This is a **financial / accounting system**, not a CRUD application.
Every state change that moves value **must** produce a balanced, immutable
double-entry record. Balances are *derived*, never typed in.

Three non-negotiable invariants:

| # | Invariant | Enforced by |
|---|-----------|-------------|
| I1 | For every `financial_transaction`, and for **every currency** inside it, `SUM(debit) = SUM(credit)` | `LedgerService.post()` + DB trigger-equivalent check |
| I2 | A cash box balance always equals `SUM(ledger entries)` for that box+currency | `CashBoxService` updates inside the same DB tx, `/reconciliation` verifies |
| I3 | Ledger entries are **append-only**. Corrections are made by posting a reversing transaction, never by UPDATE/DELETE | Entity has no update path; `reverse()` is the only correction API |

## 2. Layers

```
HTTP  ──▶ routes/        thin: path + middleware + controller ref
      ──▶ middleware/    auth → rbac → validate(zod) → controller
      ──▶ controllers/   parse req -> call service -> ApiResponse. NO business logic.
      ──▶ services/      ALL business logic. Owns DB transactions.
      ──▶ entities/      TypeORM models = the schema
      ──▶ utils/         Money (BigInt decimal), ApiError, i18n messages, pagination
```

`models/` holds framework-free DTO / domain interfaces (command objects, result
shapes) shared between services and controllers.
`types/` holds ambient + shared application types; `type/` holds Express request
augmentation (`declare global`) so `req.user` is typed.

## 3. Money representation

Floating point is forbidden. Money crosses layers as a **string** and is handled
internally as scaled `BigInt` with **10 decimal places** (`utils/money.ts`).
Postgres column type is `numeric(30,10)`; TypeORM transformers keep it a string
in JS so no precision is lost in the driver.

## 4. Chart of accounts

Balances are computed off `ledger_entries` against an `accounts` tree.

| Code | Name | Type | Normal side | Notes |
|------|------|------|-------------|-------|
| `1000` | Cash on hand | ASSET | DEBIT | parent of one child per cash box |
| `1000-<box>` | Cash — <box> | ASSET | DEBIT | auto-created with each cash box |
| `1100` | Customer receivable | ASSET | DEBIT | customer owes the office |
| `1200` | Transfers receivable | ASSET | DEBIT | incoming transfers not yet settled by partner |
| `2000` | Transfers payable | LIABILITY | CREDIT | collected, beneficiary not yet paid |
| `2100` | Customer payable | LIABILITY | CREDIT | office owes the customer |
| `3000` | Owner equity / opening balance | EQUITY | CREDIT | opening cash box balances |
| `3900` | FX position (currency clearing) | EQUITY | CREDIT | see §5 |
| `4000` | Commission income | REVENUE | CREDIT | |
| `4100` | Other income | REVENUE | CREDIT | receipt vouchers w/o customer |
| `5000` | Operating expense | EXPENSE | DEBIT | payment vouchers w/o customer |
| `5100` | FX loss / gain realised | EXPENSE | DEBIT | periodic close of 3900 |

## 5. Multi-currency: the FX position account

A cross-currency operation cannot balance in a single currency. The system keeps
**one independent book per currency**, joined by the `3900 FX position` account:

Office **buys** 1,000 USD from a customer at 10,000 SYP:

```
USD book:  DR 1000-main  USD 1,000.00        CR 3900 USD 1,000.00
SYP book:  DR 3900       SYP 10,000,000.00   CR 1000-main SYP 10,000,000.00
```

Each currency balances on its own (I1 holds), and `3900` accumulates the net FX
position per currency, whose valuation difference is the office's realised
FX profit/loss. This is the standard multi-currency ledger technique and keeps
the books auditable without fabricating a fake "base currency" amount.

## 6. Operation → ledger map

Let `A` = principal, `C` = commission, `P` = payout amount.

### 6.1 Transfer created (money collected from sender), commission on SENDER
```
DR  1000-<box>            CUR   A + C
CR  2000 transfers payable CUR  A
CR  4000 commission income CUR  C
```
Commission on BENEFICIARY → `DR 1000 A`, `CR 2000 (A - C)`, `CR 4000 C`.

### 6.2 Transfer with currency conversion (pay-in CUR1, payout CUR2, rate R)
```
CUR1: DR 1000-<box> (A + C)   CR 3900 A   CR 4000 C
CUR2: DR 3900 P               CR 2000 P            where P = A * R
```

### 6.3 Transfer status → SENT
No financial impact. Status history + audit log only.

### 6.4 Transfer paid to beneficiary (RECEIVED)
```
DR  2000 transfers payable  CUR  P
CR  1000-<payout box>       CUR  P
```

### 6.5 Transfer CANCELLED (before payout)
Exact reversal of 6.1/6.2 with `reverses_transaction_id` set. Commission is
refunded only when `refundCommission = true`.

### 6.6 Currency exchange — office BUYS `foreign` from customer (rate = buy)
```
FOREIGN: DR 1000-<box> qty          CR 3900 qty
BASE:    DR 3900 qty*rate           CR 1000-<box> qty*rate
```

### 6.7 Currency exchange — office SELLS `foreign` to customer (rate = sell)
```
BASE:    DR 1000-<box> qty*rate     CR 3900 qty*rate
FOREIGN: DR 3900 qty                CR 1000-<box> qty
```

### 6.8 Receipt voucher (money in)
```
DR 1000-<box>  amount
CR 2100 customer payable | 4100 other income   amount
```

### 6.9 Payment voucher (money out)
```
DR 1100 customer receivable | 5000 expense   amount
CR 1000-<box>                                amount
```

### 6.10 Cash box transfer (same currency)
```
DR 1000-<dest>   amount
CR 1000-<source> amount
```

### 6.11 Cash box opening balance
```
DR 1000-<box> amount     CR 3000 equity amount
```

## 7. Concurrency & atomicity

Every value-moving service method runs inside `dataSource.transaction()` at
`READ COMMITTED`, and takes a **pessimistic write lock** on the affected
`cash_box_balances` rows, ordered by `(cashBoxId, currencyId)` to avoid
deadlocks. The sequence is always:

1. validate input (zod, already done in middleware)
2. load + lock balances
3. assert sufficient funds (unless the box `allowsNegative`)
4. insert the domain row (transfer / exchange / voucher)
5. `LedgerService.post()` → financial_transaction + balanced ledger entries
6. apply balance deltas
7. write audit log
8. COMMIT — any throw ⇒ ROLLBACK of all of the above

## 8. Error & response handling

- `ApiError` carries an **i18n message key** + interpolation params, never a raw
  English sentence. The `errorHandler` middleware renders it in the caller's
  language (`Accept-Language` / `?lang=`), so the same backend serves ar/en/tr.
- Success: `{ success: true, message, data, meta? }`
- Failure: `{ success: false, code, message, details? }`

## 9. Authorization

JWT access token (15 min) + rotating refresh token in an httpOnly cookie.
The token carries only `sub`, `jti`, `role`, `tokenVersion` — no PII, no
permission list (permissions are resolved from the DB per request and cached
per-request). Every route declares required permissions server-side; the UI
merely mirrors them.
