import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { LedgerEntry } from './ledger-entry.entity';
import { User } from './user.entity';
import { TransactionType } from '../types/enums';

/**
 * Journal header. One row per business event that moved value.
 *
 * Immutable once written: a mistake is corrected by posting a *reversing*
 * transaction that points back here through `reversesTransactionId`.
 */
@Entity('financial_transactions')
@Index(['type', 'occurredAt'])
@Index(['sourceType', 'sourceId'])
export class FinancialTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ name: 'reference_no', type: 'varchar', length: 24 })
  referenceNo: string;

  @Column({ type: 'enum', enum: TransactionType })
  type: TransactionType;

  /** Polymorphic back-pointer: `transfer` | `currency_exchange` | `voucher` | `cash_box`. */
  @Column({ name: 'source_type', type: 'varchar', length: 40 })
  sourceType: string;

  @Column({ name: 'source_id', type: 'uuid', nullable: true })
  sourceId: string | null;

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

  /** Business date. May differ from `createdAt` for back-dated adjustments. */
  @Index()
  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt: Date;

  @Column({ name: 'reverses_transaction_id', type: 'uuid', nullable: true })
  reversesTransactionId: string | null;

  @ManyToOne(() => FinancialTransaction, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reverses_transaction_id' })
  reversesTransaction: FinancialTransaction | null;

  @Column({ name: 'is_reversed', type: 'boolean', default: false })
  isReversed: boolean;

  @Column({ name: 'created_by', type: 'uuid' })
  createdById: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  createdBy: User;

  @OneToMany(() => LedgerEntry, (entry) => entry.transaction, { cascade: ['insert'] })
  entries: LedgerEntry[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
