import type { EntityManager } from 'typeorm';

/**
 * Human-facing document numbers.
 *
 * Generated from Postgres sequences *inside* the caller's transaction, so two
 * concurrent operations can never receive the same number. Sequences are
 * gap-tolerant by design (a rollback burns a number); the UNIQUE index on each
 * column is the real guarantee of uniqueness.
 */

export const SEQUENCES = {
  transfer: 'seq_transfer_no',
  exchange: 'seq_exchange_no',
  voucher: 'seq_voucher_no',
  transaction: 'seq_ftx_no',
  customer: 'seq_customer_no',
} as const;

export type SequenceName = keyof typeof SEQUENCES;

/** `TRF-2026-000123` */
export async function nextDocumentNumber(
  manager: EntityManager,
  sequence: SequenceName,
  prefix: string,
  occurredAt: Date = new Date(),
): Promise<string> {
  const rows: Array<{ value: string }> = await manager.query(
    `SELECT nextval('${SEQUENCES[sequence]}')::text AS value`,
  );
  const serial = rows[0].value.padStart(6, '0');
  return `${prefix}-${occurredAt.getFullYear()}-${serial}`;
}

/** `CUS-000123` - customers are not year-scoped. */
export async function nextCustomerNumber(manager: EntityManager): Promise<string> {
  const rows: Array<{ value: string }> = await manager.query(
    `SELECT nextval('${SEQUENCES.customer}')::text AS value`,
  );
  return `CUS-${rows[0].value.padStart(6, '0')}`;
}
