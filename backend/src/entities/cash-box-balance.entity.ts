import { Column, Entity, Index, JoinColumn, ManyToOne, Unique, UpdateDateColumn, PrimaryGeneratedColumn } from 'typeorm';
import { CashBox } from './cash-box.entity';
import { Currency } from './currency.entity';
import { decimalTransformer } from '../utils/money';

/**
 * A per-(box, currency) running balance.
 *
 * This is a *derived cache* of `ledger_entries`, never an independent source of
 * truth: it is only ever mutated inside the same DB transaction that posts the
 * journal entry, under a `FOR UPDATE` row lock, and
 * `GET /cash-boxes/:id/reconciliation` proves it still equals the ledger sum
 * (invariant I2 in docs/01-architecture.md).
 */
@Entity('cash_box_balances')
@Unique('uq_cash_box_currency', ['cashBoxId', 'currencyId'])
@Index(['currencyId'])
export class CashBoxBalance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cash_box_id', type: 'uuid' })
  cashBoxId: string;

  @ManyToOne(() => CashBox, (box) => box.balances, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cash_box_id' })
  cashBox: CashBox;

  @Column({ name: 'currency_id', type: 'uuid' })
  currencyId: string;

  @ManyToOne(() => Currency, (currency) => currency.balances, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'currency_id' })
  currency: Currency;

  @Column({ type: 'numeric', precision: 30, scale: 10, default: 0, transformer: decimalTransformer })
  balance: string;

  /** Bumped on every mutation; useful for debugging lost-update reports. */
  @Column({ type: 'int', default: 0 })
  version: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
