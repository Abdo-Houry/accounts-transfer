import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { CashBox } from './cash-box.entity';
import { Currency } from './currency.entity';
import { Customer } from './customer.entity';
import { Correspondent } from './correspondent.entity';
import { FinancialTransaction } from './financial-transaction.entity';
import { User } from './user.entity';
import { VoucherCategory, VoucherStatus, VoucherType } from '../types/enums';
import { decimalTransformer } from '../utils/money';

/**
 * Receipt (money in) and payment (money out) vouchers share one table: they
 * differ only by `type` and by which side of the cash account they post to,
 * so splitting them would duplicate every column and every query.
 */
@Entity('vouchers')
@Index(['type', 'createdAt'])
@Index(['customerId', 'createdAt'])
export class Voucher extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'voucher_no', type: 'varchar', length: 24 })
  voucherNo: string;

  @Column({ type: 'enum', enum: VoucherType })
  type: VoucherType;

  @Column({ type: 'numeric', precision: 30, scale: 10, transformer: decimalTransformer })
  amount: string;

  @Column({ name: 'currency_id', type: 'uuid' })
  currencyId: string;

  @ManyToOne(() => Currency, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'currency_id' })
  currency: Currency;

  @Column({ name: 'cash_box_id', type: 'uuid' })
  cashBoxId: string;

  @ManyToOne(() => CashBox, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cash_box_id' })
  cashBox: CashBox;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId: string | null;

  @ManyToOne(() => Customer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer | null;

  /** Free-text counterparty when the money did not come from a registered customer. */
  /** Set when the voucher squares a partner office's current account. */
  @Column({ name: 'correspondent_id', type: 'uuid', nullable: true })
  correspondentId: string | null;

  @ManyToOne(() => Correspondent, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'correspondent_id' })
  correspondent: Correspondent | null;

  @Column({ name: 'counterparty_name', type: 'varchar', length: 150, nullable: true })
  counterpartyName: string | null;

  @Column({ type: 'enum', enum: VoucherCategory, default: VoucherCategory.OTHER })
  category: VoucherCategory;

  @Column({ type: 'varchar', length: 255 })
  reason: string;

  @Column({ name: 'reference_type', type: 'varchar', length: 40, nullable: true })
  referenceType: string | null;

  @Column({ name: 'reference_id', type: 'uuid', nullable: true })
  referenceId: string | null;

  @Column({ name: 'financial_transaction_id', type: 'uuid', nullable: true })
  financialTransactionId: string | null;

  @ManyToOne(() => FinancialTransaction, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'financial_transaction_id' })
  financialTransaction: FinancialTransaction | null;

  @Column({ name: 'void_transaction_id', type: 'uuid', nullable: true })
  voidTransactionId: string | null;

  @Column({ type: 'enum', enum: VoucherStatus, default: VoucherStatus.POSTED })
  status: VoucherStatus;

  @Column({ name: 'created_by', type: 'uuid' })
  createdById: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  createdBy: User;

  @Column({ name: 'voided_by', type: 'uuid', nullable: true })
  voidedById: string | null;

  @Column({ name: 'voided_at', type: 'timestamptz', nullable: true })
  voidedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
