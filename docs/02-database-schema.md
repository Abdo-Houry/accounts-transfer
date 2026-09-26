# Database Schema

PostgreSQL 14+. All PKs are `uuid` (`gen_random_uuid()`), all money is
`numeric(30,10)`, all timestamps are `timestamptz`.

## Entity relationship overview

```
roles --< role_permissions >-- permissions
  |
  +--< users --< refresh_tokens
        |
        +--< audit_logs
        +--< financial_transactions (created_by)

currencies --< exchange_rates
     |
     +--< cash_box_balances >-- cash_boxes --< accounts (1:1 cash account)
     +--< ledger_entries

customers --< transfers (sender / beneficiary link)
     +--< currency_exchanges
     +--< vouchers

financial_transactions --< ledger_entries >-- accounts
        ^    ^    ^
        |    |    +-- vouchers.financial_transaction_id
        |    +------- currency_exchanges.financial_transaction_id
        +------------ transfers.(create|payout|cancel)_transaction_id

transfers --< transfer_status_history
commission_rules (configuration; the resolved amount is denormalised onto the operation)
```

## Tables

### `permissions`

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| code | varchar(80) UNIQUE | e.g. `transfer.create` |
| module | varchar(40) | grouping for the UI |
| description | varchar(200) | |

### `roles`

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| name | varchar(50) UNIQUE | `admin` / `manager` / `employee` |
| description | varchar(200) | |
| is_system | boolean | system roles cannot be deleted |

`role_permissions(role_id, permission_id)` — composite PK.

### `users`

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| username | varchar(50) UNIQUE | |
| email | varchar(150) UNIQUE NULL | |
| full_name | varchar(150) | |
| password_hash | varchar(255) | bcrypt cost 12, `select: false` |
| phone | varchar(30) NULL | |
| role_id | uuid FK roles | |
| default_cash_box_id | uuid FK cash_boxes NULL | |
| language | enum(ar,en,tr) | default `ar` |
| status | enum(active,suspended) | |
| token_version | int | bump to revoke every issued JWT |
| last_login_at | timestamptz NULL | |
| created_at / updated_at | timestamptz | |

### `refresh_tokens`

| column | type | notes |
|---|---|---|
| id | uuid PK | also the `jti` |
| user_id | uuid FK users | |
| token_hash | varchar(255) | sha256 of the opaque token |
| expires_at | timestamptz | |
| revoked_at | timestamptz NULL | |
| replaced_by | uuid NULL | rotation chain |
| ip_address / user_agent | varchar | |

### `currencies`

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| code | varchar(3) UNIQUE | ISO-4217: `USD`, `SYP`, `TRY`, `EUR`, `GBP` |
| name_ar / name_en / name_tr | varchar(60) | |
| symbol | varchar(8) | |
| decimal_places | smallint | display rounding (2 for USD, 0 for SYP) |
| is_base | boolean | exactly one row is true — the accounting base |
| is_active | boolean | |

### `exchange_rates` (append-only history)

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| currency_id | uuid FK currencies | |
| buy_rate | numeric(30,10) | office buys 1 unit for this many base units |
| sell_rate | numeric(30,10) | office sells 1 unit for this many base units |
| effective_from | timestamptz | |
| effective_to | timestamptz NULL | set when superseded — rows are never deleted |
| is_active | boolean | exactly one active row per currency |
| previous_rate_id | uuid FK self NULL | |
| created_by | uuid FK users | |
| note | varchar(255) | |

Indexes: `(currency_id, is_active)`, `(currency_id, effective_from DESC)`.

### `cash_boxes`

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| code | varchar(30) UNIQUE | |
| name_ar / name_en / name_tr | varchar(100) | |
| branch | varchar(100) NULL | |
| status | enum(active,closed) | |
| allows_negative | boolean | default false |
| closed_at / closed_by | timestamptz / uuid NULL | |

### `cash_box_balances`

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| cash_box_id | uuid FK cash_boxes | |
| currency_id | uuid FK currencies | |
| balance | numeric(30,10) | derived cache of the ledger, updated inside the tx |
| version | int | optimistic marker; the row is also `FOR UPDATE` locked |

UNIQUE `(cash_box_id, currency_id)`.

### `accounts` — chart of accounts

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| code | varchar(30) UNIQUE | |
| name_ar / name_en / name_tr | varchar(120) | |
| type | enum(ASSET,LIABILITY,EQUITY,REVENUE,EXPENSE) | |
| normal_balance | enum(DEBIT,CREDIT) | |
| parent_id | uuid FK self NULL | |
| cash_box_id | uuid FK cash_boxes NULL UNIQUE | set on `1000-<box>` cash accounts |
| is_system | boolean | seeded accounts cannot be deleted |
| is_active | boolean | |

### `customers`

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| customer_no | varchar(20) UNIQUE | human code `CUS-000123` |
| full_name | varchar(150) | |
| phone | varchar(30) | indexed |
| alt_phone | varchar(30) NULL | |
| national_id | varchar(50) NULL | |
| country / city / address | varchar | |
| notes | text NULL | |
| status | enum(active,blocked) | |
| created_by | uuid FK users | |

### `commission_rules`

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| name | varchar(100) | |
| operation | enum(TRANSFER,EXCHANGE) | |
| currency_id | uuid FK NULL | null = applies to any currency |
| method | enum(FIXED,PERCENT,TIERED) | |
| fixed_amount | numeric(30,10) NULL | |
| percent | numeric(10,6) NULL | `1.5` = 1.5 % |
| min_amount / max_amount | numeric NULL | clamp for PERCENT |
| from_amount / to_amount | numeric NULL | tier bounds for TIERED |
| priority | int | highest matching priority wins |
| is_active | boolean | |

### `transfers`

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| transfer_no | varchar(24) UNIQUE | `TRF-2026-000001`, from a DB sequence |
| direction | enum(OUTGOING,INCOMING) | |
| status | enum(PENDING,SENT,RECEIVED,CANCELLED) | |
| sender_customer_id | uuid FK customers NULL | |
| sender_name / sender_phone | varchar | |
| beneficiary_customer_id | uuid FK customers NULL | |
| beneficiary_name / beneficiary_phone | varchar | |
| beneficiary_country / beneficiary_city | varchar | |
| currency_id | uuid FK currencies | pay-in currency |
| amount | numeric(30,10) | principal |
| commission_amount | numeric(30,10) | |
| commission_currency_id | uuid FK currencies | |
| commission_bearer | enum(SENDER,BENEFICIARY) | |
| payout_currency_id | uuid FK currencies | equals `currency_id` when no conversion |
| exchange_rate | numeric(30,10) | `1` when no conversion |
| payout_amount | numeric(30,10) | what the beneficiary receives |
| total_collected | numeric(30,10) | what the sender handed over |
| payment_method | enum(CASH,BANK,WALLET,ACCOUNT) | |
| cash_box_id | uuid FK cash_boxes | box that took the money in |
| payout_cash_box_id | uuid FK cash_boxes NULL | box that paid out |
| create_transaction_id | uuid FK financial_transactions | |
| payout_transaction_id | uuid FK NULL | |
| cancel_transaction_id | uuid FK NULL | |
| created_by / sent_by / received_by / cancelled_by | uuid FK users | |
| sent_at / received_at / cancelled_at | timestamptz NULL | |
| cancel_reason | varchar(255) NULL | |
| notes | text NULL | |
| created_at / updated_at | timestamptz | |

Indexes: `transfer_no`, `(status, created_at DESC)`, `beneficiary_phone`,
`sender_phone`, `lower(beneficiary_name)`, `cash_box_id`.

### `transfer_status_history`

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| transfer_id | uuid FK transfers | |
| from_status / to_status | enum | `from_status` is null on creation |
| changed_by | uuid FK users | |
| reason | varchar(255) NULL | |
| created_at | timestamptz | |

### `currency_exchanges`

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| exchange_no | varchar(24) UNIQUE | `EXC-2026-000001` |
| type | enum(BUY,SELL) | from the office point of view |
| customer_id | uuid FK customers NULL | |
| customer_name / customer_phone | varchar NULL | walk-in customer |
| from_currency_id | uuid FK | what the office receives |
| from_amount | numeric(30,10) | |
| to_currency_id | uuid FK | what the office pays out |
| to_amount | numeric(30,10) | |
| rate | numeric(30,10) | the applied rate |
| rate_source_id | uuid FK exchange_rates NULL | which published rate was used |
| commission_amount / commission_currency_id | | |
| cash_box_id | uuid FK cash_boxes | |
| financial_transaction_id | uuid FK | |
| created_by | uuid FK users | |
| status | enum(COMPLETED,REVERSED) | |
| reversal_transaction_id | uuid FK NULL | |
| notes | text | |

### `financial_transactions` — the journal header

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| reference_no | varchar(24) UNIQUE | `FTX-2026-000001` |
| type | enum | TRANSFER_CREATE, TRANSFER_PAYOUT, TRANSFER_CANCEL, EXCHANGE, EXCHANGE_REVERSAL, RECEIPT_VOUCHER, PAYMENT_VOUCHER, VOUCHER_VOID, CASHBOX_TRANSFER, OPENING_BALANCE, ADJUSTMENT |
| source_type | varchar(40) | `transfer` / `currency_exchange` / `voucher` / `cash_box` |
| source_id | uuid NULL | polymorphic pointer back to the domain row |
| description | varchar(255) | |
| occurred_at | timestamptz | business date (may differ from `created_at`) |
| reverses_transaction_id | uuid FK self NULL | |
| is_reversed | boolean | default false |
| created_by | uuid FK users | |
| created_at | timestamptz | |

### `ledger_entries` — the journal lines (APPEND ONLY)

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| transaction_id | uuid FK financial_transactions ON DELETE RESTRICT | |
| line_no | smallint | |
| account_id | uuid FK accounts | |
| cash_box_id | uuid FK NULL | denormalised for fast cash-box reports |
| customer_id | uuid FK NULL | |
| currency_id | uuid FK currencies | |
| direction | enum(DEBIT,CREDIT) | |
| amount | numeric(30,10) | CHECK (amount > 0) |
| base_amount | numeric(30,10) | amount converted to base currency at posting time |
| base_rate | numeric(30,10) | rate used for `base_amount` |
| description | varchar(255) | |
| created_at | timestamptz | |

Indexes: `(transaction_id)`, `(account_id, currency_id)`,
`(cash_box_id, currency_id, created_at)`, `(customer_id, created_at DESC)`.

### `vouchers` — سندات القبض والصرف

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| voucher_no | varchar(24) UNIQUE | `RCV-2026-000001` / `PAY-2026-000001` |
| type | enum(RECEIPT,PAYMENT) | |
| amount | numeric(30,10) | |
| currency_id | uuid FK currencies | |
| cash_box_id | uuid FK cash_boxes | |
| customer_id | uuid FK customers NULL | |
| counterparty_name | varchar(150) NULL | |
| category | enum(CUSTOMER_SETTLEMENT,EXPENSE,OTHER_INCOME,SALARY,RENT,UTILITY,OTHER) | |
| reason | varchar(255) | |
| reference_type / reference_id | varchar / uuid NULL | link to a transfer or exchange |
| financial_transaction_id | uuid FK | |
| status | enum(POSTED,VOIDED) | |
| void_transaction_id | uuid FK NULL | |
| created_by | uuid FK users | |
| notes | text | |

### `audit_logs`

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK users NULL | null for failed logins with an unknown username |
| username | varchar(50) | snapshot, survives user deletion |
| action | varchar(60) | `transfer.create`, `auth.login`, ... |
| entity_type | varchar(40) NULL | |
| entity_id | uuid NULL | |
| result | enum(SUCCESS,FAILURE) | |
| before_data / after_data | jsonb NULL | redacted of secrets |
| description | varchar(255) | |
| ip_address | varchar(45) | |
| user_agent | varchar(255) | |
| created_at | timestamptz | |

Indexes: `(created_at DESC)`, `(entity_type, entity_id)`,
`(user_id, created_at DESC)`.

## Number sequences

`transfer_no`, `exchange_no`, `voucher_no` and `reference_no` are generated from
Postgres sequences (`seq_transfer_no`, `seq_exchange_no`, `seq_voucher_no`,
`seq_ftx_no`) inside the transaction and formatted `PREFIX-YYYY-NNNNNN`.
Sequences are gap-tolerant by design; the UNIQUE index is the real guarantee.
