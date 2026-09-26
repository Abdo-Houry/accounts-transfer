# API Endpoints

Base URL: `/api/v1`. All responses are wrapped:

```jsonc
// success
{ "success": true, "message": "…localised…", "data": { }, "meta": { "page": 1, "limit": 25, "total": 130, "totalPages": 6 } }
// failure
{ "success": false, "code": "INSUFFICIENT_FUNDS", "message": "…localised…", "details": [ { "path": "amount", "message": "…" } ] }
```

Language is chosen from `?lang=` → `Accept-Language` → the user's stored
language → `ar`.

## Auth — `/auth`

| Method | Path | Permission | Notes |
|---|---|---|---|
| POST | `/auth/login` | public | body `{ username, password }` → access token + refresh cookie |
| POST | `/auth/refresh` | public (cookie) | rotates the refresh token |
| POST | `/auth/logout` | authenticated | revokes the current refresh token |
| POST | `/auth/logout-all` | authenticated | bumps `token_version` |
| GET | `/auth/me` | authenticated | user + role + permission codes |
| PATCH | `/auth/me` | authenticated | full name, phone, language |
| POST | `/auth/change-password` | authenticated | revokes all sessions |

## Users — `/users`

| Method | Path | Permission |
|---|---|---|
| GET | `/users` | `user.read` |
| GET | `/users/:id` | `user.read` |
| POST | `/users` | `user.create` |
| PATCH | `/users/:id` | `user.update` |
| PATCH | `/users/:id/status` | `user.update` |
| POST | `/users/:id/reset-password` | `user.update` |
| DELETE | `/users/:id` | `user.delete` (soft: status=suspended) |

## Roles & permissions — `/roles`, `/permissions`

| Method | Path | Permission |
|---|---|---|
| GET | `/permissions` | `role.read` |
| GET | `/roles` | `role.read` |
| POST | `/roles` | `role.create` |
| PATCH | `/roles/:id` | `role.update` |
| PUT | `/roles/:id/permissions` | `role.update` |
| DELETE | `/roles/:id` | `role.delete` (blocked for system roles) |

## Currencies & rates — `/currencies`, `/exchange-rates`

| Method | Path | Permission |
|---|---|---|
| GET | `/currencies` | `currency.read` |
| POST | `/currencies` | `currency.create` |
| PATCH | `/currencies/:id` | `currency.update` |
| GET | `/exchange-rates/current` | `currency.read` — board of active buy/sell |
| GET | `/exchange-rates/history` | `currency.read` — `?currencyId&from&to` |
| POST | `/exchange-rates` | `rate.update` — supersedes the active row |
| POST | `/exchange-rates/bulk` | `rate.update` — update the whole board at once |

## Cash boxes — `/cash-boxes`

| Method | Path | Permission |
|---|---|---|
| GET | `/cash-boxes` | `cashbox.read` |
| GET | `/cash-boxes/:id` | `cashbox.read` |
| GET | `/cash-boxes/:id/balances` | `cashbox.read` |
| GET | `/cash-boxes/:id/statement` | `cashbox.read` — ledger movement, filters + pagination |
| GET | `/cash-boxes/:id/reconciliation` | `cashbox.reconcile` — cached balance vs ledger sum |
| POST | `/cash-boxes` | `cashbox.create` |
| PATCH | `/cash-boxes/:id` | `cashbox.update` |
| POST | `/cash-boxes/:id/opening-balance` | `cashbox.opening` |
| POST | `/cash-boxes/transfer` | `cashbox.transfer` — box → box, same currency |
| POST | `/cash-boxes/:id/close` | `cashbox.close` — refuses if any balance ≠ 0 |

## Customers — `/customers`

| Method | Path | Permission |
|---|---|---|
| GET | `/customers` | `customer.read` — `?q&status&page&limit` |
| GET | `/customers/:id` | `customer.read` |
| GET | `/customers/:id/statement` | `customer.read` — transfers + exchanges + vouchers + ledger |
| POST | `/customers` | `customer.create` |
| PATCH | `/customers/:id` | `customer.update` |
| PATCH | `/customers/:id/status` | `customer.update` |

## Transfers — `/transfers`

| Method | Path | Permission | Financial effect |
|---|---|---|---|
| GET | `/transfers` | `transfer.read` | — |
| GET | `/transfers/:id` | `transfer.read` | — |
| GET | `/transfers/lookup` | `transfer.receive` | `?transferNo` / `?phone` / `?beneficiaryName` — payout search |
| POST | `/transfers/quote` | `transfer.create` | dry-run: commission, rate, payout, required balance. No writes. |
| POST | `/transfers` | `transfer.create` | §6.1 / §6.2 — collects cash, creates payable |
| POST | `/transfers/:id/send` | `transfer.send` | status only |
| POST | `/transfers/:id/receive` | `transfer.receive` | §6.4 — pays the beneficiary |
| POST | `/transfers/:id/cancel` | `transfer.cancel` | §6.5 — reversing entries |
| PATCH | `/transfers/:id` | `transfer.update` | only PENDING, non-financial fields only |
| GET | `/transfers/:id/history` | `transfer.read` | status history |
| GET | `/transfers/:id/receipt` | `transfer.read` | printable payload + QR data URL |

## Currency exchange — `/exchanges`

| Method | Path | Permission | Financial effect |
|---|---|---|---|
| GET | `/exchanges` | `exchange.read` | — |
| GET | `/exchanges/:id` | `exchange.read` | — |
| POST | `/exchanges/quote` | `exchange.create` | dry-run pricing, no writes |
| POST | `/exchanges` | `exchange.create` | §6.6 (BUY) / §6.7 (SELL) |
| POST | `/exchanges/:id/reverse` | `exchange.reverse` | full reversing transaction |

## Vouchers — `/vouchers`

| Method | Path | Permission |
|---|---|---|
| GET | `/vouchers` | `voucher.read` — `?type&from&to&cashBoxId&customerId` |
| GET | `/vouchers/:id` | `voucher.read` |
| POST | `/vouchers/receipt` | `voucher.receipt` — §6.8 |
| POST | `/vouchers/payment` | `voucher.payment` — §6.9 |
| POST | `/vouchers/:id/void` | `voucher.void` — reversing transaction |

## Commission rules — `/commission-rules`

| Method | Path | Permission |
|---|---|---|
| GET | `/commission-rules` | `commission.read` |
| POST | `/commission-rules` | `commission.manage` |
| PATCH | `/commission-rules/:id` | `commission.manage` |
| DELETE | `/commission-rules/:id` | `commission.manage` |

## Ledger — `/ledger`

| Method | Path | Permission |
|---|---|---|
| GET | `/ledger/transactions` | `ledger.read` — journal headers with filters |
| GET | `/ledger/transactions/:id` | `ledger.read` — header + all entries |
| GET | `/ledger/entries` | `ledger.read` — flat entry search |
| GET | `/ledger/accounts` | `ledger.read` — chart of accounts |
| GET | `/ledger/trial-balance` | `report.financial` — per currency, `?asOf` |
| POST | `/ledger/adjustment` | `ledger.adjust` — manual balanced journal (admin) |

## Dashboard & reports

| Method | Path | Permission |
|---|---|---|
| GET | `/dashboard/summary` | `dashboard.view` — `?period=today\|week\|month\|custom&from&to` |
| GET | `/dashboard/recent-activity` | `dashboard.view` |
| GET | `/reports/transfers` | `report.operational` |
| GET | `/reports/exchanges` | `report.operational` |
| GET | `/reports/commissions` | `report.financial` |
| GET | `/reports/cash-boxes` | `report.financial` |
| GET | `/reports/profit-loss` | `report.financial` |
| GET | `/reports/customers` | `report.operational` |
| GET | `/reports/employees` | `report.operational` |

## Audit — `/audit-logs`

| Method | Path | Permission |
|---|---|---|
| GET | `/audit-logs` | `audit.read` — `?userId&action&entityType&entityId&result&from&to` |
| GET | `/audit-logs/:id` | `audit.read` |

## Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 422 | zod failure, `details[]` carries field paths |
| `UNAUTHENTICATED` | 401 | missing/expired access token |
| `INVALID_CREDENTIALS` | 401 | login failure |
| `FORBIDDEN` | 403 | authenticated but lacks the permission |
| `NOT_FOUND` | 404 | |
| `CONFLICT` | 409 | duplicate code / number |
| `INSUFFICIENT_FUNDS` | 409 | box balance would go negative |
| `INVALID_STATUS_TRANSITION` | 409 | e.g. RECEIVED → CANCELLED |
| `TRANSFER_ALREADY_RECEIVED` | 409 | double payout attempt |
| `RATE_NOT_AVAILABLE` | 409 | no active exchange rate for the currency |
| `UNBALANCED_TRANSACTION` | 500 | ledger invariant violated — bug guard, rolls back |
| `INTERNAL_ERROR` | 500 | |
