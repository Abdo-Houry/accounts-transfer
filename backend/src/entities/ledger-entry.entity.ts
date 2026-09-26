import { Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Account } from './account.entity';
import { CashBox } from './cash-box.entity';
import { Currency } from './currency.entity';
import { Correspondent } from './correspondent.entity';
import { Customer } from './customer.entity';
import { FinancialTransaction } from './financial-transaction.entity';
import { EntryDirection } from '../types/enums';
import { decimalTransformer } from '../utils/money';

/**
 * Journal line. APPEND ONLY - nothing in the codebase updates or deletes a row
 * here (invariant I3). Every balance in the system is a SUM over this table.
 */
@Entity('ledger_entries')
@Check('chk_ledger_amount_positive', '"amount" > 0')
@Index(['accountId', 'currencyId'])
@Index(['cashBoxId', 'currencyId', 'createdAt'])
@Index(['customerId', 'createdAt'])
export class LedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'transaction_id', type: 'uuid' })
  transactionId: string;

  @ManyToOne(() => FinancialTransaction, (transaction) => transaction.entries, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'transaction_id' })
  transaction: FinancialTransaction;

  @Column({ name: 'line_no', type: 'smallint' })
  lineNo: number;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @ManyToOne(() => Account, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'account_id' })
  account: Account;

  /** Denormalised from the account so cash-box statements stay a single scan. */
  @Column({ name: 'cash_box_id', type: 'uuid', nullable: true })
  cashBoxId: string | null;

  @ManyToOne(() => CashBox, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cash_box_id' })
  cashBox: CashBox | null;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId: string | null;

  @ManyToOne(() => Customer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer | null;

  /** Set on any leg routed through a partner office - drives their statement. */
  @Column({ name: 'correspondent_id', type: 'uuid', nullable: true })
  correspondentId: string | null;

  @ManyToOne(() => Correspondent, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'correspondent_id' })
  correspondent: Correspondent | null;

  @Column({ name: 'currency_id', type: 'uuid' })
  currencyId: string;

  @ManyToOne(() => Currency, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'currency_id' })
  currency: Currency;

  @Column({ type: 'enum', enum: EntryDirection })
  direction: EntryDirection;

  @Column({ type: 'numeric', precision: 30, scale: 10, transformer: decimalTransformer })
  amount: string;

  /** `amount` valued in the base currency at posting time - for consolidated reports. */
  @Column({ name: 'base_amount', type: 'numeric', precision: 30, scale: 10, default: 0, transformer: decimalTransformer })
  baseAmount: string;

  @Column({ name: 'base_rate', type: 'numeric', precision: 30, scale: 10, default: 1, transformer: decimalTransformer })
  baseRate: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  description: string;

  /**
   * Translatable form of `description`: a catalogue key plus its params, so
   * the sentence is rendered in the reader's language instead of being frozen
   * in English at write time. Null on rows written before this was introduced -
   * the read layer falls back to `description` for those.
   */
  @Column({ name: 'description_key', type: 'varchar', length: 80, nullable: true })
  descriptionKey: string | null;

  @Column({ name: 'description_params', type: 'jsonb', nullable: true })
  descriptionParams: Record<string, string | number> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
