import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { CashBox } from './cash-box.entity';
import { Currency } from './currency.entity';
import { Customer } from './customer.entity';
import { ExchangeRate } from './exchange-rate.entity';
import { FinancialTransaction } from './financial-transaction.entity';
import { User } from './user.entity';
import { ExchangeStatus, ExchangeType } from '../types/enums';
import { decimalTransformer } from '../utils/money';

/**
 * One currency exchange deal. `type` is always stated from the *office* point
 * of view: BUY means the office bought foreign currency from the customer.
 */
@Entity('currency_exchanges')
@Index(['status', 'createdAt'])
export class CurrencyExchange extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'exchange_no', type: 'varchar', length: 24 })
  exchangeNo: string;

  @Column({ type: 'enum', enum: ExchangeType })
  type: ExchangeType;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId: string | null;

  @ManyToOne(() => Customer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer | null;

  @Column({ name: 'customer_name', type: 'varchar', length: 150, nullable: true })
  customerName: string | null;

  @Column({ name: 'customer_phone', type: 'varchar', length: 30, nullable: true })
  customerPhone: string | null;

  /** What the office receives. */
  @Column({ name: 'from_currency_id', type: 'uuid' })
  fromCurrencyId: string;

  @ManyToOne(() => Currency, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'from_currency_id' })
  fromCurrency: Currency;

  @Column({ name: 'from_amount', type: 'numeric', precision: 30, scale: 10, transformer: decimalTransformer })
  fromAmount: string;

  /** What the office pays out. */
  @Column({ name: 'to_currency_id', type: 'uuid' })
  toCurrencyId: string;

  @ManyToOne(() => Currency, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'to_currency_id' })
  toCurrency: Currency;

  @Column({ name: 'to_amount', type: 'numeric', precision: 30, scale: 10, transformer: decimalTransformer })
  toAmount: string;

  @Column({ type: 'numeric', precision: 30, scale: 10, transformer: decimalTransformer })
  rate: string;

  /** Which published rate row was applied - keeps pricing auditable. */
  @Column({ name: 'rate_source_id', type: 'uuid', nullable: true })
  rateSourceId: string | null;

  @ManyToOne(() => ExchangeRate, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'rate_source_id' })
  rateSource: ExchangeRate | null;

  @Column({ name: 'commission_amount', type: 'numeric', precision: 30, scale: 10, default: 0, transformer: decimalTransformer })
  commissionAmount: string;

  @Column({ name: 'commission_currency_id', type: 'uuid', nullable: true })
  commissionCurrencyId: string | null;

  @ManyToOne(() => Currency, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'commission_currency_id' })
  commissionCurrency: Currency | null;

  @Column({ name: 'cash_box_id', type: 'uuid' })
  cashBoxId: string;

  @ManyToOne(() => CashBox, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cash_box_id' })
  cashBox: CashBox;

  @Column({ name: 'financial_transaction_id', type: 'uuid', nullable: true })
  financialTransactionId: string | null;

  @ManyToOne(() => FinancialTransaction, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'financial_transaction_id' })
  financialTransaction: FinancialTransaction | null;

  @Column({ name: 'reversal_transaction_id', type: 'uuid', nullable: true })
  reversalTransactionId: string | null;

  @Column({ type: 'enum', enum: ExchangeStatus, default: ExchangeStatus.COMPLETED })
  status: ExchangeStatus;

  @Column({ name: 'created_by', type: 'uuid' })
  createdById: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  createdBy: User;

  @Column({ name: 'reversed_by', type: 'uuid', nullable: true })
  reversedById: string | null;

  @Column({ name: 'reversed_at', type: 'timestamptz', nullable: true })
  reversedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
