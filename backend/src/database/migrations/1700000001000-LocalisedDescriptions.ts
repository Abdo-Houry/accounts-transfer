import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Structured, translatable descriptions for the journal and the audit trail.
 *
 * Until now a posting stored one English sentence ("Opening balance for MAIN")
 * built with string interpolation at write time, so the ledger's البيان column
 * and every audit row read in English no matter which language the operator had
 * chosen. Error and success messages never had that problem - they already
 * travel as a key plus params and are rendered per request (docs/01 section 8);
 * these two tables were simply the places that had not adopted it.
 *
 * The key and its params are added alongside the existing text rather than
 * replacing it: `ledger_entries` and `financial_transactions` are append-only
 * (invariant I3), so rows written before this migration keep the only wording
 * they ever had, and the read layer falls back to it whenever a key is absent.
 */
export class LocalisedDescriptions1700000001000 implements MigrationInterface {
  name = 'LocalisedDescriptions1700000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['financial_transactions', 'ledger_entries', 'audit_logs']) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "description_key" character varying(80)`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "description_params" jsonb`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['financial_transactions', 'ledger_entries', 'audit_logs']) {
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "description_params"`);
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "description_key"`);
    }
  }
}
