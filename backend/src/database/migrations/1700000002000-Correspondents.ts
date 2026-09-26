import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Correspondent offices and their current accounts.
 *
 * A correspondent (Hamza in Istanbul, Agha in Berlin) is not a customer. A
 * customer is a party to one deal that ends when the money is handed over; a
 * correspondent is a standing two-way relationship with a running balance per
 * currency that is settled periodically, and the office has to be able to read
 * "what Hamza owes me and what I owe Hamza" at any moment.
 *
 * Accounting-wise each one gets a *current account* (`1300-<CODE>`) under the
 * `1300` control account. A single account per correspondent - not a
 * receivable and a payable pair - because the relationship genuinely swings
 * both ways: a debit balance means they hold funds for me, a credit balance
 * means I owe them for a payout they made. The balance sheet decides which
 * side of the statement it belongs on from the sign, which is how a
 * correspondent account is presented in practice.
 *
 * The ledger gains a `correspondent_id` dimension alongside `customer_id`, so
 * a correspondent statement is the same single scan a customer statement is.
 *
 * Transfers gain two optional legs:
 *  - `sender_correspondent_id`   - who collected the money abroad, so the
 *    funding line debits their account instead of one of my cash boxes.
 *  - `payout_correspondent_id`   - who will hand it over abroad, so the payout
 *    line credits their account instead of one of my cash boxes.
 *
 * That is why `cash_box_id` becomes nullable: when Agha funds a transfer that
 * Hamza pays out, the money never touches this office's cash at all.
 */
export class Correspondents1700000002000 implements MigrationInterface {
  name = 'Correspondents1700000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "correspondents_status_enum" AS ENUM ('ACTIVE', 'SUSPENDED');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "correspondents" (
        "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "code"           character varying(20)  NOT NULL,
        "name_ar"        character varying(150) NOT NULL,
        "name_en"        character varying(150) NOT NULL,
        "name_tr"        character varying(150) NOT NULL,
        "country"        character varying(80),
        "city"           character varying(80),
        "phone"          character varying(30),
        "email"          character varying(150),
        "contact_person" character varying(150),
        "notes"          text,
        "status"         "correspondents_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "account_id"     uuid NOT NULL REFERENCES "accounts"("id") ON DELETE RESTRICT,
        "created_by"     uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at"     timestamptz NOT NULL DEFAULT now(),
        "updated_at"     timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_correspondents_code" ON "correspondents" ("code")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_correspondents_account" ON "correspondents" ("account_id")`,
    );

    // --- ledger dimension ---------------------------------------------------
    await queryRunner.query(
      `ALTER TABLE "ledger_entries" ADD COLUMN IF NOT EXISTS "correspondent_id" uuid`,
    );
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "ledger_entries"
          ADD CONSTRAINT "ledger_entries_correspondent_id_fkey"
          FOREIGN KEY ("correspondent_id") REFERENCES "correspondents"("id") ON DELETE RESTRICT;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_ledger_correspondent"
         ON "ledger_entries" ("correspondent_id", "currency_id", "created_at")`,
    );

    // --- transfer routing ---------------------------------------------------
    await queryRunner.query(`ALTER TABLE "transfers" ALTER COLUMN "cash_box_id" DROP NOT NULL`);
    for (const column of ['sender_correspondent_id', 'payout_correspondent_id']) {
      await queryRunner.query(`ALTER TABLE "transfers" ADD COLUMN IF NOT EXISTS "${column}" uuid`);
      await queryRunner.query(`
        DO $$ BEGIN
          ALTER TABLE "transfers"
            ADD CONSTRAINT "transfers_${column}_fkey"
            FOREIGN KEY ("${column}") REFERENCES "correspondents"("id") ON DELETE RESTRICT;
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      `);
    }
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_transfers_sender_correspondent"
         ON "transfers" ("sender_correspondent_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_transfers_payout_correspondent"
         ON "transfers" ("payout_correspondent_id")`,
    );

    // --- settlement vouchers ------------------------------------------------
    await queryRunner.query(
      `ALTER TABLE "vouchers" ADD COLUMN IF NOT EXISTS "correspondent_id" uuid`,
    );
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "vouchers"
          ADD CONSTRAINT "vouchers_correspondent_id_fkey"
          FOREIGN KEY ("correspondent_id") REFERENCES "correspondents"("id") ON DELETE RESTRICT;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "vouchers_category_enum" ADD VALUE IF NOT EXISTS 'CORRESPONDENT_SETTLEMENT';
      EXCEPTION WHEN undefined_object THEN NULL; END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "vouchers" DROP CONSTRAINT IF EXISTS "vouchers_correspondent_id_fkey"`,
    );
    await queryRunner.query(`ALTER TABLE "vouchers" DROP COLUMN IF EXISTS "correspondent_id"`);

    for (const column of ['sender_correspondent_id', 'payout_correspondent_id']) {
      await queryRunner.query(
        `ALTER TABLE "transfers" DROP CONSTRAINT IF EXISTS "transfers_${column}_fkey"`,
      );
      await queryRunner.query(`ALTER TABLE "transfers" DROP COLUMN IF EXISTS "${column}"`);
    }

    await queryRunner.query(
      `ALTER TABLE "ledger_entries" DROP CONSTRAINT IF EXISTS "ledger_entries_correspondent_id_fkey"`,
    );
    await queryRunner.query(`ALTER TABLE "ledger_entries" DROP COLUMN IF EXISTS "correspondent_id"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "correspondents"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "correspondents_status_enum"`);
    // `cash_box_id` is deliberately left nullable: re-imposing NOT NULL would
    // fail against any transfer that was funded by a correspondent.
  }
}
