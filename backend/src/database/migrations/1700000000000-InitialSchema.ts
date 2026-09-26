import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema.
 *
 * Written by hand rather than generated, so the things TypeORM decorators
 * cannot express are part of the schema from day one:
 *  - the document-number sequences used by `utils/sequence.ts`;
 *  - the partial unique indexes (nullable email, one cash account per box);
 *  - the CHECK that keeps a ledger amount strictly positive - the side of an
 *    entry is carried by `direction`, never by a negative number;
 *  - `ON DELETE RESTRICT` on everything the ledger points at, so no posted
 *    entry can ever be orphaned by deleting a currency, account or cash box.
 */
export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const statement of UP) {
      await queryRunner.query(statement);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const statement of DOWN) {
      await queryRunner.query(statement);
    }
  }
}

const UP: string[] = [
  `CREATE EXTENSION IF NOT EXISTS "pgcrypto"`,

  // ------------------------------------------------------------------ enums
  `CREATE TYPE "users_language_enum" AS ENUM ('ar','en','tr')`,
  `CREATE TYPE "users_status_enum" AS ENUM ('active','suspended')`,
  `CREATE TYPE "customers_status_enum" AS ENUM ('active','blocked')`,
  `CREATE TYPE "cash_boxes_status_enum" AS ENUM ('active','closed')`,
  `CREATE TYPE "accounts_type_enum" AS ENUM ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')`,
  `CREATE TYPE "accounts_normal_balance_enum" AS ENUM ('DEBIT','CREDIT')`,
  `CREATE TYPE "ledger_entries_direction_enum" AS ENUM ('DEBIT','CREDIT')`,
  `CREATE TYPE "transfers_direction_enum" AS ENUM ('OUTGOING','INCOMING')`,
  `CREATE TYPE "transfers_status_enum" AS ENUM ('PENDING','SENT','RECEIVED','CANCELLED')`,
  `CREATE TYPE "transfers_commission_bearer_enum" AS ENUM ('SENDER','BENEFICIARY')`,
  `CREATE TYPE "transfers_payment_method_enum" AS ENUM ('CASH','BANK','WALLET','ACCOUNT')`,
  `CREATE TYPE "transfer_status_history_from_status_enum" AS ENUM ('PENDING','SENT','RECEIVED','CANCELLED')`,
  `CREATE TYPE "transfer_status_history_to_status_enum" AS ENUM ('PENDING','SENT','RECEIVED','CANCELLED')`,
  `CREATE TYPE "currency_exchanges_type_enum" AS ENUM ('BUY','SELL')`,
  `CREATE TYPE "currency_exchanges_status_enum" AS ENUM ('COMPLETED','REVERSED')`,
  `CREATE TYPE "commission_rules_operation_enum" AS ENUM ('TRANSFER','EXCHANGE')`,
  `CREATE TYPE "commission_rules_method_enum" AS ENUM ('FIXED','PERCENT','TIERED')`,
  `CREATE TYPE "financial_transactions_type_enum" AS ENUM (
     'TRANSFER_CREATE','TRANSFER_PAYOUT','TRANSFER_CANCEL','EXCHANGE','EXCHANGE_REVERSAL',
     'RECEIPT_VOUCHER','PAYMENT_VOUCHER','VOUCHER_VOID','CASHBOX_TRANSFER','OPENING_BALANCE','ADJUSTMENT')`,
  `CREATE TYPE "vouchers_type_enum" AS ENUM ('RECEIPT','PAYMENT')`,
  `CREATE TYPE "vouchers_category_enum" AS ENUM ('CUSTOMER_SETTLEMENT','EXPENSE','OTHER_INCOME','SALARY','RENT','UTILITY','OTHER')`,
  `CREATE TYPE "vouchers_status_enum" AS ENUM ('POSTED','VOIDED')`,
  `CREATE TYPE "audit_logs_result_enum" AS ENUM ('SUCCESS','FAILURE')`,

  // -------------------------------------------------------------- sequences
  `CREATE SEQUENCE IF NOT EXISTS "seq_transfer_no" START 1`,
  `CREATE SEQUENCE IF NOT EXISTS "seq_exchange_no" START 1`,
  `CREATE SEQUENCE IF NOT EXISTS "seq_voucher_no" START 1`,
  `CREATE SEQUENCE IF NOT EXISTS "seq_ftx_no" START 1`,
  `CREATE SEQUENCE IF NOT EXISTS "seq_customer_no" START 1`,

  // ----------------------------------------------------- identity & access
  `CREATE TABLE "permissions" (
     "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     "code"        varchar(80)  NOT NULL,
     "module"      varchar(40)  NOT NULL,
     "description" varchar(200) NOT NULL DEFAULT ''
   )`,
  `CREATE UNIQUE INDEX "uq_permissions_code" ON "permissions" ("code")`,

  `CREATE TABLE "roles" (
     "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     "name"        varchar(50)  NOT NULL,
     "description" varchar(200) NOT NULL DEFAULT '',
     "is_system"   boolean      NOT NULL DEFAULT false,
     "created_at"  timestamptz  NOT NULL DEFAULT now(),
     "updated_at"  timestamptz  NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX "uq_roles_name" ON "roles" ("name")`,

  `CREATE TABLE "role_permissions" (
     "role_id"       uuid NOT NULL REFERENCES "roles" ("id") ON DELETE CASCADE,
     "permission_id" uuid NOT NULL REFERENCES "permissions" ("id") ON DELETE CASCADE,
     PRIMARY KEY ("role_id", "permission_id")
   )`,
  `CREATE INDEX "idx_role_permissions_permission" ON "role_permissions" ("permission_id")`,

  `CREATE TABLE "cash_boxes" (
     "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     "code"            varchar(30)  NOT NULL,
     "name_ar"         varchar(100) NOT NULL,
     "name_en"         varchar(100) NOT NULL,
     "name_tr"         varchar(100) NOT NULL,
     "branch"          varchar(100),
     "status"          "cash_boxes_status_enum" NOT NULL DEFAULT 'active',
     "allows_negative" boolean      NOT NULL DEFAULT false,
     "description"     varchar(255) NOT NULL DEFAULT '',
     "closed_at"       timestamptz,
     "closed_by"       uuid,
     "created_at"      timestamptz  NOT NULL DEFAULT now(),
     "updated_at"      timestamptz  NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX "uq_cash_boxes_code" ON "cash_boxes" ("code")`,

  `CREATE TABLE "users" (
     "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     "username"            varchar(50)  NOT NULL,
     "email"               varchar(150),
     "full_name"           varchar(150) NOT NULL,
     "password_hash"       varchar(255) NOT NULL,
     "phone"               varchar(30),
     "role_id"             uuid NOT NULL REFERENCES "roles" ("id") ON DELETE RESTRICT,
     "default_cash_box_id" uuid REFERENCES "cash_boxes" ("id") ON DELETE SET NULL,
     "language"            "users_language_enum" NOT NULL DEFAULT 'ar',
     "status"              "users_status_enum"   NOT NULL DEFAULT 'active',
     "token_version"       integer      NOT NULL DEFAULT 0,
     "last_login_at"       timestamptz,
     "created_at"          timestamptz  NOT NULL DEFAULT now(),
     "updated_at"          timestamptz  NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX "uq_users_username" ON "users" ("username")`,
  `CREATE UNIQUE INDEX "uq_users_email" ON "users" ("email") WHERE "email" IS NOT NULL`,

  `ALTER TABLE "cash_boxes" ADD CONSTRAINT "fk_cash_boxes_closed_by"
     FOREIGN KEY ("closed_by") REFERENCES "users" ("id") ON DELETE SET NULL`,

  `CREATE TABLE "refresh_tokens" (
     "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     "user_id"     uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
     "token_hash"  varchar(255) NOT NULL,
     "expires_at"  timestamptz  NOT NULL,
     "revoked_at"  timestamptz,
     "replaced_by" uuid,
     "ip_address"  varchar(45)  NOT NULL DEFAULT '',
     "user_agent"  varchar(255) NOT NULL DEFAULT '',
     "created_at"  timestamptz  NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX "idx_refresh_tokens_hash" ON "refresh_tokens" ("token_hash")`,
  `CREATE INDEX "idx_refresh_tokens_user" ON "refresh_tokens" ("user_id", "revoked_at")`,

  // ------------------------------------------------------------ currencies
  `CREATE TABLE "currencies" (
     "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     "code"           varchar(3)  NOT NULL,
     "name_ar"        varchar(60) NOT NULL,
     "name_en"        varchar(60) NOT NULL,
     "name_tr"        varchar(60) NOT NULL,
     "symbol"         varchar(8)  NOT NULL DEFAULT '',
     "decimal_places" smallint    NOT NULL DEFAULT 2,
     "is_base"        boolean     NOT NULL DEFAULT false,
     "is_active"      boolean     NOT NULL DEFAULT true,
     "sort_order"     integer     NOT NULL DEFAULT 0,
     "created_at"     timestamptz NOT NULL DEFAULT now(),
     "updated_at"     timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX "uq_currencies_code" ON "currencies" ("code")`,
  // Exactly one base currency, enforced by the database rather than by code.
  `CREATE UNIQUE INDEX "uq_currencies_single_base" ON "currencies" (("is_base")) WHERE "is_base" = true`,

  `CREATE TABLE "exchange_rates" (
     "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     "currency_id"      uuid NOT NULL REFERENCES "currencies" ("id") ON DELETE RESTRICT,
     "buy_rate"         numeric(30,10) NOT NULL,
     "sell_rate"        numeric(30,10) NOT NULL,
     "effective_from"   timestamptz NOT NULL,
     "effective_to"     timestamptz,
     "is_active"        boolean NOT NULL DEFAULT true,
     "previous_rate_id" uuid REFERENCES "exchange_rates" ("id") ON DELETE SET NULL,
     "created_by"       uuid NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT,
     "note"             varchar(255) NOT NULL DEFAULT '',
     "created_at"       timestamptz NOT NULL DEFAULT now(),
     "updated_at"       timestamptz NOT NULL DEFAULT now(),
     CONSTRAINT "chk_exchange_rates_positive" CHECK ("buy_rate" > 0 AND "sell_rate" > 0)
   )`,
  `CREATE INDEX "idx_exchange_rates_currency_active" ON "exchange_rates" ("currency_id", "is_active")`,
  `CREATE INDEX "idx_exchange_rates_currency_from" ON "exchange_rates" ("currency_id", "effective_from")`,
  // At most one live rate per currency - the board can never be ambiguous.
  `CREATE UNIQUE INDEX "uq_exchange_rates_active" ON "exchange_rates" ("currency_id") WHERE "is_active" = true`,

  // ------------------------------------------------------ chart of accounts
  `CREATE TABLE "accounts" (
     "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     "code"           varchar(30)  NOT NULL,
     "name_ar"        varchar(120) NOT NULL,
     "name_en"        varchar(120) NOT NULL,
     "name_tr"        varchar(120) NOT NULL,
     "type"           "accounts_type_enum" NOT NULL,
     "normal_balance" "accounts_normal_balance_enum" NOT NULL,
     "parent_id"      uuid REFERENCES "accounts" ("id") ON DELETE RESTRICT,
     "cash_box_id"    uuid REFERENCES "cash_boxes" ("id") ON DELETE RESTRICT,
     "is_system"      boolean NOT NULL DEFAULT false,
     "is_active"      boolean NOT NULL DEFAULT true,
     "created_at"     timestamptz NOT NULL DEFAULT now(),
     "updated_at"     timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX "uq_accounts_code" ON "accounts" ("code")`,
  `CREATE UNIQUE INDEX "uq_accounts_cash_box" ON "accounts" ("cash_box_id") WHERE "cash_box_id" IS NOT NULL`,

  `CREATE TABLE "cash_box_balances" (
     "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     "cash_box_id" uuid NOT NULL REFERENCES "cash_boxes" ("id") ON DELETE CASCADE,
     "currency_id" uuid NOT NULL REFERENCES "currencies" ("id") ON DELETE RESTRICT,
     "balance"     numeric(30,10) NOT NULL DEFAULT 0,
     "version"     integer NOT NULL DEFAULT 0,
     "updated_at"  timestamptz NOT NULL DEFAULT now(),
     CONSTRAINT "uq_cash_box_currency" UNIQUE ("cash_box_id", "currency_id")
   )`,
  `CREATE INDEX "idx_cash_box_balances_currency" ON "cash_box_balances" ("currency_id")`,

  // -------------------------------------------------------------- customers
  `CREATE TABLE "customers" (
     "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     "customer_no" varchar(20)  NOT NULL,
     "full_name"   varchar(150) NOT NULL,
     "phone"       varchar(30)  NOT NULL,
     "alt_phone"   varchar(30),
     "national_id" varchar(50),
     "country"     varchar(80),
     "city"        varchar(80),
     "address"     varchar(255),
     "notes"       text,
     "status"      "customers_status_enum" NOT NULL DEFAULT 'active',
     "created_by"  uuid REFERENCES "users" ("id") ON DELETE SET NULL,
     "created_at"  timestamptz NOT NULL DEFAULT now(),
     "updated_at"  timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX "uq_customers_no" ON "customers" ("customer_no")`,
  `CREATE INDEX "idx_customers_phone" ON "customers" ("phone")`,
  `CREATE INDEX "idx_customers_name" ON "customers" ("full_name")`,

  // ------------------------------------------------------ commission rules
  `CREATE TABLE "commission_rules" (
     "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     "name"         varchar(100) NOT NULL,
     "operation"    "commission_rules_operation_enum" NOT NULL,
     "currency_id"  uuid REFERENCES "currencies" ("id") ON DELETE CASCADE,
     "method"       "commission_rules_method_enum" NOT NULL,
     "fixed_amount" numeric(30,10),
     "percent"      numeric(10,6),
     "min_amount"   numeric(30,10),
     "max_amount"   numeric(30,10),
     "from_amount"  numeric(30,10),
     "to_amount"    numeric(30,10),
     "priority"     integer NOT NULL DEFAULT 0,
     "is_active"    boolean NOT NULL DEFAULT true,
     "created_at"   timestamptz NOT NULL DEFAULT now(),
     "updated_at"   timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX "idx_commission_rules_lookup" ON "commission_rules" ("operation", "is_active", "priority")`,

  // ------------------------------------------------------------- the ledger
  `CREATE TABLE "financial_transactions" (
     "id"                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     "reference_no"            varchar(24) NOT NULL,
     "type"                    "financial_transactions_type_enum" NOT NULL,
     "source_type"             varchar(40) NOT NULL,
     "source_id"               uuid,
     "description"             varchar(255) NOT NULL DEFAULT '',
     "occurred_at"             timestamptz NOT NULL,
     "reverses_transaction_id" uuid REFERENCES "financial_transactions" ("id") ON DELETE RESTRICT,
     "is_reversed"             boolean NOT NULL DEFAULT false,
     "created_by"              uuid NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT,
     "created_at"              timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX "uq_financial_transactions_ref" ON "financial_transactions" ("reference_no")`,
  `CREATE INDEX "idx_ftx_type_occurred" ON "financial_transactions" ("type", "occurred_at")`,
  `CREATE INDEX "idx_ftx_source" ON "financial_transactions" ("source_type", "source_id")`,
  `CREATE INDEX "idx_ftx_occurred" ON "financial_transactions" ("occurred_at")`,

  `CREATE TABLE "ledger_entries" (
     "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     "transaction_id" uuid NOT NULL REFERENCES "financial_transactions" ("id") ON DELETE RESTRICT,
     "line_no"        smallint NOT NULL,
     "account_id"     uuid NOT NULL REFERENCES "accounts" ("id") ON DELETE RESTRICT,
     "cash_box_id"    uuid REFERENCES "cash_boxes" ("id") ON DELETE RESTRICT,
     "customer_id"    uuid REFERENCES "customers" ("id") ON DELETE SET NULL,
     "currency_id"    uuid NOT NULL REFERENCES "currencies" ("id") ON DELETE RESTRICT,
     "direction"      "ledger_entries_direction_enum" NOT NULL,
     "amount"         numeric(30,10) NOT NULL,
     "base_amount"    numeric(30,10) NOT NULL DEFAULT 0,
     "base_rate"      numeric(30,10) NOT NULL DEFAULT 1,
     "description"    varchar(255) NOT NULL DEFAULT '',
     "created_at"     timestamptz NOT NULL DEFAULT now(),
     CONSTRAINT "chk_ledger_amount_positive" CHECK ("amount" > 0)
   )`,
  `CREATE INDEX "idx_ledger_transaction" ON "ledger_entries" ("transaction_id")`,
  `CREATE INDEX "idx_ledger_account_currency" ON "ledger_entries" ("account_id", "currency_id")`,
  `CREATE INDEX "idx_ledger_cashbox" ON "ledger_entries" ("cash_box_id", "currency_id", "created_at")`,
  `CREATE INDEX "idx_ledger_customer" ON "ledger_entries" ("customer_id", "created_at")`,

  // -------------------------------------------------------------- transfers
  `CREATE TABLE "transfers" (
     "id"                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     "transfer_no"             varchar(24) NOT NULL,
     "direction"               "transfers_direction_enum" NOT NULL DEFAULT 'OUTGOING',
     "status"                  "transfers_status_enum"    NOT NULL DEFAULT 'PENDING',
     "sender_customer_id"      uuid REFERENCES "customers" ("id") ON DELETE SET NULL,
     "sender_name"             varchar(150) NOT NULL,
     "sender_phone"            varchar(30)  NOT NULL,
     "beneficiary_customer_id" uuid REFERENCES "customers" ("id") ON DELETE SET NULL,
     "beneficiary_name"        varchar(150) NOT NULL,
     "beneficiary_phone"       varchar(30)  NOT NULL,
     "beneficiary_country"     varchar(80)  NOT NULL,
     "beneficiary_city"        varchar(80)  NOT NULL,
     "currency_id"             uuid NOT NULL REFERENCES "currencies" ("id") ON DELETE RESTRICT,
     "amount"                  numeric(30,10) NOT NULL,
     "commission_amount"       numeric(30,10) NOT NULL DEFAULT 0,
     "commission_currency_id"  uuid NOT NULL REFERENCES "currencies" ("id") ON DELETE RESTRICT,
     "commission_bearer"       "transfers_commission_bearer_enum" NOT NULL DEFAULT 'SENDER',
     "payout_currency_id"      uuid NOT NULL REFERENCES "currencies" ("id") ON DELETE RESTRICT,
     "exchange_rate"           numeric(30,10) NOT NULL DEFAULT 1,
     "payout_amount"           numeric(30,10) NOT NULL,
     "total_collected"         numeric(30,10) NOT NULL,
     "payment_method"          "transfers_payment_method_enum" NOT NULL DEFAULT 'CASH',
     "cash_box_id"             uuid NOT NULL REFERENCES "cash_boxes" ("id") ON DELETE RESTRICT,
     "payout_cash_box_id"      uuid REFERENCES "cash_boxes" ("id") ON DELETE RESTRICT,
     "create_transaction_id"   uuid REFERENCES "financial_transactions" ("id") ON DELETE RESTRICT,
     "payout_transaction_id"   uuid REFERENCES "financial_transactions" ("id") ON DELETE RESTRICT,
     "cancel_transaction_id"   uuid REFERENCES "financial_transactions" ("id") ON DELETE RESTRICT,
     "created_by"              uuid NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT,
     "sent_by"                 uuid REFERENCES "users" ("id") ON DELETE SET NULL,
     "received_by"             uuid REFERENCES "users" ("id") ON DELETE SET NULL,
     "cancelled_by"            uuid REFERENCES "users" ("id") ON DELETE SET NULL,
     "sent_at"                 timestamptz,
     "received_at"             timestamptz,
     "cancelled_at"            timestamptz,
     "cancel_reason"           varchar(255),
     "notes"                   text,
     "created_at"              timestamptz NOT NULL DEFAULT now(),
     "updated_at"              timestamptz NOT NULL DEFAULT now(),
     CONSTRAINT "chk_transfers_amount_positive" CHECK ("amount" > 0 AND "payout_amount" > 0),
     CONSTRAINT "chk_transfers_commission_non_negative" CHECK ("commission_amount" >= 0)
   )`,
  `CREATE UNIQUE INDEX "uq_transfers_no" ON "transfers" ("transfer_no")`,
  `CREATE INDEX "idx_transfers_status_created" ON "transfers" ("status", "created_at")`,
  `CREATE INDEX "idx_transfers_beneficiary_phone" ON "transfers" ("beneficiary_phone")`,
  `CREATE INDEX "idx_transfers_sender_phone" ON "transfers" ("sender_phone")`,
  `CREATE INDEX "idx_transfers_beneficiary_name" ON "transfers" ("beneficiary_name")`,
  `CREATE INDEX "idx_transfers_cash_box" ON "transfers" ("cash_box_id")`,

  `CREATE TABLE "transfer_status_history" (
     "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     "transfer_id" uuid NOT NULL REFERENCES "transfers" ("id") ON DELETE CASCADE,
     "from_status" "transfer_status_history_from_status_enum",
     "to_status"   "transfer_status_history_to_status_enum" NOT NULL,
     "changed_by"  uuid NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT,
     "reason"      varchar(255),
     "created_at"  timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX "idx_transfer_history" ON "transfer_status_history" ("transfer_id", "created_at")`,

  // ------------------------------------------------------ currency exchange
  `CREATE TABLE "currency_exchanges" (
     "id"                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     "exchange_no"              varchar(24) NOT NULL,
     "type"                     "currency_exchanges_type_enum" NOT NULL,
     "customer_id"              uuid REFERENCES "customers" ("id") ON DELETE SET NULL,
     "customer_name"            varchar(150),
     "customer_phone"           varchar(30),
     "from_currency_id"         uuid NOT NULL REFERENCES "currencies" ("id") ON DELETE RESTRICT,
     "from_amount"              numeric(30,10) NOT NULL,
     "to_currency_id"           uuid NOT NULL REFERENCES "currencies" ("id") ON DELETE RESTRICT,
     "to_amount"                numeric(30,10) NOT NULL,
     "rate"                     numeric(30,10) NOT NULL,
     "rate_source_id"           uuid REFERENCES "exchange_rates" ("id") ON DELETE SET NULL,
     "commission_amount"        numeric(30,10) NOT NULL DEFAULT 0,
     "commission_currency_id"   uuid REFERENCES "currencies" ("id") ON DELETE RESTRICT,
     "cash_box_id"              uuid NOT NULL REFERENCES "cash_boxes" ("id") ON DELETE RESTRICT,
     "financial_transaction_id" uuid REFERENCES "financial_transactions" ("id") ON DELETE RESTRICT,
     "reversal_transaction_id"  uuid REFERENCES "financial_transactions" ("id") ON DELETE RESTRICT,
     "status"                   "currency_exchanges_status_enum" NOT NULL DEFAULT 'COMPLETED',
     "created_by"               uuid NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT,
     "reversed_by"              uuid REFERENCES "users" ("id") ON DELETE SET NULL,
     "reversed_at"              timestamptz,
     "notes"                    text,
     "created_at"               timestamptz NOT NULL DEFAULT now(),
     "updated_at"               timestamptz NOT NULL DEFAULT now(),
     CONSTRAINT "chk_exchange_amounts" CHECK ("from_amount" > 0 AND "to_amount" > 0 AND "rate" > 0),
     CONSTRAINT "chk_exchange_currencies" CHECK ("from_currency_id" <> "to_currency_id")
   )`,
  `CREATE UNIQUE INDEX "uq_exchanges_no" ON "currency_exchanges" ("exchange_no")`,
  `CREATE INDEX "idx_exchanges_status_created" ON "currency_exchanges" ("status", "created_at")`,

  // --------------------------------------------------------------- vouchers
  `CREATE TABLE "vouchers" (
     "id"                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     "voucher_no"               varchar(24) NOT NULL,
     "type"                     "vouchers_type_enum" NOT NULL,
     "amount"                   numeric(30,10) NOT NULL,
     "currency_id"              uuid NOT NULL REFERENCES "currencies" ("id") ON DELETE RESTRICT,
     "cash_box_id"              uuid NOT NULL REFERENCES "cash_boxes" ("id") ON DELETE RESTRICT,
     "customer_id"              uuid REFERENCES "customers" ("id") ON DELETE SET NULL,
     "counterparty_name"        varchar(150),
     "category"                 "vouchers_category_enum" NOT NULL DEFAULT 'OTHER',
     "reason"                   varchar(255) NOT NULL,
     "reference_type"           varchar(40),
     "reference_id"             uuid,
     "financial_transaction_id" uuid REFERENCES "financial_transactions" ("id") ON DELETE RESTRICT,
     "void_transaction_id"      uuid REFERENCES "financial_transactions" ("id") ON DELETE RESTRICT,
     "status"                   "vouchers_status_enum" NOT NULL DEFAULT 'POSTED',
     "created_by"               uuid NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT,
     "voided_by"                uuid REFERENCES "users" ("id") ON DELETE SET NULL,
     "voided_at"                timestamptz,
     "notes"                    text,
     "created_at"               timestamptz NOT NULL DEFAULT now(),
     "updated_at"               timestamptz NOT NULL DEFAULT now(),
     CONSTRAINT "chk_vouchers_amount_positive" CHECK ("amount" > 0)
   )`,
  `CREATE UNIQUE INDEX "uq_vouchers_no" ON "vouchers" ("voucher_no")`,
  `CREATE INDEX "idx_vouchers_type_created" ON "vouchers" ("type", "created_at")`,
  `CREATE INDEX "idx_vouchers_customer" ON "vouchers" ("customer_id", "created_at")`,

  // ------------------------------------------------------------- audit log
  `CREATE TABLE "audit_logs" (
     "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     "user_id"     uuid REFERENCES "users" ("id") ON DELETE SET NULL,
     "username"    varchar(50) NOT NULL DEFAULT '',
     "action"      varchar(60) NOT NULL,
     "entity_type" varchar(40),
     "entity_id"   uuid,
     "result"      "audit_logs_result_enum" NOT NULL DEFAULT 'SUCCESS',
     "before_data" jsonb,
     "after_data"  jsonb,
     "description" varchar(255) NOT NULL DEFAULT '',
     "ip_address"  varchar(45)  NOT NULL DEFAULT '',
     "user_agent"  varchar(255) NOT NULL DEFAULT '',
     "created_at"  timestamptz  NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX "idx_audit_created" ON "audit_logs" ("created_at")`,
  `CREATE INDEX "idx_audit_entity" ON "audit_logs" ("entity_type", "entity_id")`,
  `CREATE INDEX "idx_audit_user" ON "audit_logs" ("user_id", "created_at")`,
  `CREATE INDEX "idx_audit_action" ON "audit_logs" ("action", "created_at")`,
];

const DOWN: string[] = [
  `DROP TABLE IF EXISTS "audit_logs"`,
  `DROP TABLE IF EXISTS "vouchers"`,
  `DROP TABLE IF EXISTS "currency_exchanges"`,
  `DROP TABLE IF EXISTS "transfer_status_history"`,
  `DROP TABLE IF EXISTS "transfers"`,
  `DROP TABLE IF EXISTS "ledger_entries"`,
  `DROP TABLE IF EXISTS "financial_transactions"`,
  `DROP TABLE IF EXISTS "commission_rules"`,
  `DROP TABLE IF EXISTS "customers"`,
  `DROP TABLE IF EXISTS "cash_box_balances"`,
  `DROP TABLE IF EXISTS "accounts"`,
  `DROP TABLE IF EXISTS "exchange_rates"`,
  `DROP TABLE IF EXISTS "currencies"`,
  `DROP TABLE IF EXISTS "refresh_tokens"`,
  `ALTER TABLE IF EXISTS "cash_boxes" DROP CONSTRAINT IF EXISTS "fk_cash_boxes_closed_by"`,
  `DROP TABLE IF EXISTS "users"`,
  `DROP TABLE IF EXISTS "cash_boxes"`,
  `DROP TABLE IF EXISTS "role_permissions"`,
  `DROP TABLE IF EXISTS "roles"`,
  `DROP TABLE IF EXISTS "permissions"`,

  `DROP SEQUENCE IF EXISTS "seq_customer_no"`,
  `DROP SEQUENCE IF EXISTS "seq_ftx_no"`,
  `DROP SEQUENCE IF EXISTS "seq_voucher_no"`,
  `DROP SEQUENCE IF EXISTS "seq_exchange_no"`,
  `DROP SEQUENCE IF EXISTS "seq_transfer_no"`,

  `DROP TYPE IF EXISTS "audit_logs_result_enum"`,
  `DROP TYPE IF EXISTS "vouchers_status_enum"`,
  `DROP TYPE IF EXISTS "vouchers_category_enum"`,
  `DROP TYPE IF EXISTS "vouchers_type_enum"`,
  `DROP TYPE IF EXISTS "financial_transactions_type_enum"`,
  `DROP TYPE IF EXISTS "commission_rules_method_enum"`,
  `DROP TYPE IF EXISTS "commission_rules_operation_enum"`,
  `DROP TYPE IF EXISTS "currency_exchanges_status_enum"`,
  `DROP TYPE IF EXISTS "currency_exchanges_type_enum"`,
  `DROP TYPE IF EXISTS "transfer_status_history_to_status_enum"`,
  `DROP TYPE IF EXISTS "transfer_status_history_from_status_enum"`,
  `DROP TYPE IF EXISTS "transfers_payment_method_enum"`,
  `DROP TYPE IF EXISTS "transfers_commission_bearer_enum"`,
  `DROP TYPE IF EXISTS "transfers_status_enum"`,
  `DROP TYPE IF EXISTS "transfers_direction_enum"`,
  `DROP TYPE IF EXISTS "ledger_entries_direction_enum"`,
  `DROP TYPE IF EXISTS "accounts_normal_balance_enum"`,
  `DROP TYPE IF EXISTS "accounts_type_enum"`,
  `DROP TYPE IF EXISTS "cash_boxes_status_enum"`,
  `DROP TYPE IF EXISTS "customers_status_enum"`,
  `DROP TYPE IF EXISTS "users_status_enum"`,
  `DROP TYPE IF EXISTS "users_language_enum"`,
];
