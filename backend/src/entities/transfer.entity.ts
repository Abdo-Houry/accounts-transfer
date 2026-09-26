import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { CashBox } from './cash-box.entity';
import { Correspondent } from './correspondent.entity';
import { Currency } from './currency.entity';
import { Customer } from './customer.entity';
import { FinancialTransaction } from './financial-transaction.entity';
import { TransferStatusHistory } from './transfer-status-history.entity';
import { User } from './user.entity';
import {
  CommissionBearer,
  PaymentMethod,
  TransferDirection,
  TransferStatus,
} from '../types/enums';
import { decimalTransformer } from '../utils/money';

@Entity('transfers')
@Index(['status', 'createdAt'])
@Index(['beneficiaryPhone'])
@Index(['senderPhone'])
@Index(['beneficiaryName'])
export class Transfer extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'transfer_no', type: 'varchar', length: 24 })
  transferNo: string;

  @Column({ type: 'enum', enum: TransferDirection, default: TransferDirection.OUTGOING })
  direction: TransferDirection;

  @Column({ type: 'enum', enum: TransferStatus, default: TransferStatus.PENDING })
  status: TransferStatus;

  // ------------------------------------------------------------------ parties
  @Column({ name: 'sender_customer_id', type: 'uuid', nullable: true })
  senderCustomerId: string | null;

  @ManyToOne(() => Customer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sender_customer_id' })
  senderCustomer: Customer | null;

  @Column({ name: 'sender_name', type: 'varchar', length: 150 })
  senderName: string;

  @Column({ name: 'sender_phone', type: 'varchar', length: 30 })
  senderPhone: string;

  @Column({ name: 'beneficiary_customer_id', type: 'uuid', nullable: true })
  beneficiaryCustomerId: string | null;

  @ManyToOne(() => Customer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'beneficiary_customer_id' })
  beneficiaryCustomer: Customer | null;

  @Column({ name: 'beneficiary_name', type: 'varchar', length: 150 })
  beneficiaryName: string;

  @Column({ name: 'beneficiary_phone', type: 'varchar', length: 30 })
  beneficiaryPhone: string;

  @Column({ name: 'beneficiary_country', type: 'varchar', length: 80 })
  beneficiaryCountry: string;

  @Column({ name: 'beneficiary_city', type: 'varchar', length: 80 })
  beneficiaryCity: string;

  // ------------------------------------------------------------------ amounts
  @Column({ name: 'currency_id', type: 'uuid' })
  currencyId: string;

  @ManyToOne(() => Currency, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'currency_id' })
  currency: Currency;

  @Column({ type: 'numeric', precision: 30, scale: 10, transformer: decimalTransformer })
  amount: string;

  @Column({ name: 'commission_amount', type: 'numeric', precision: 30, scale: 10, default: 0, transformer: decimalTransformer })
  commissionAmount: string;

  @Column({ name: 'commission_currency_id', type: 'uuid' })
  commissionCurrencyId: string;

  @ManyToOne(() => Currency, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'commission_currency_id' })
  commissionCurrency: Currency;

  @Column({ name: 'commission_bearer', type: 'enum', enum: CommissionBearer, default: CommissionBearer.SENDER })
  commissionBearer: CommissionBearer;

  @Column({ name: 'payout_currency_id', type: 'uuid' })
  payoutCurrencyId: string;

  @ManyToOne(() => Currency, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'payout_currency_id' })
  payoutCurrency: Currency;

  /** 1 when there is no conversion. */
  @Column({ name: 'exchange_rate', type: 'numeric', precision: 30, scale: 10, default: 1, transformer: decimalTransformer })
  exchangeRate: string;

  /** What the beneficiary receives, in `payoutCurrency`. */
  @Column({ name: 'payout_amount', type: 'numeric', precision: 30, scale: 10, transformer: decimalTransformer })
  payoutAmount: string;

  /** What the sender handed over, in `currency`. */
  @Column({ name: 'total_collected', type: 'numeric', precision: 30, scale: 10, transformer: decimalTransformer })
  totalCollected: string;

  @Column({ name: 'payment_method', type: 'enum', enum: PaymentMethod, default: PaymentMethod.CASH })
  paymentMethod: PaymentMethod;

  // ---------------------------------------------------------------- cash boxes
  /** Null when a correspondent funded the transfer instead of a cash box. */
  @Column({ name: 'cash_box_id', type: 'uuid', nullable: true })
  cashBoxId: string | null;

  @ManyToOne(() => CashBox, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cash_box_id' })
  cashBox: CashBox;

  @Column({ name: 'payout_cash_box_id', type: 'uuid', nullable: true })
  payoutCashBoxId: string | null;

  @ManyToOne(() => CashBox, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'payout_cash_box_id' })
  payoutCashBox: CashBox | null;

  // -------------------------------------------------------- ledger back-links
  /**
   * The partner office that collected the money abroad. When set, the funding
   * line debits their current account instead of one of this office's boxes.
   */
  @Column({ name: 'sender_correspondent_id', type: 'uuid', nullable: true })
  senderCorrespondentId: string | null;

  @ManyToOne(() => Correspondent, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sender_correspondent_id' })
  senderCorrespondent: Correspondent | null;

  /**
   * The partner office that will hand the money over abroad. When set, the
   * payout line credits their current account instead of a cash box.
   */
  @Column({ name: 'payout_correspondent_id', type: 'uuid', nullable: true })
  payoutCorrespondentId: string | null;

  @ManyToOne(() => Correspondent, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'payout_correspondent_id' })
  payoutCorrespondent: Correspondent | null;

  @Column({ name: 'create_transaction_id', type: 'uuid', nullable: true })
  createTransactionId: string | null;

  @ManyToOne(() => FinancialTransaction, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'create_transaction_id' })
  createTransaction: FinancialTransaction | null;

  @Column({ name: 'payout_transaction_id', type: 'uuid', nullable: true })
  payoutTransactionId: string | null;

  @Column({ name: 'cancel_transaction_id', type: 'uuid', nullable: true })
  cancelTransactionId: string | null;

  // -------------------------------------------------------------- who / when
  @Column({ name: 'created_by', type: 'uuid' })
  createdById: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  createdBy: User;

  @Column({ name: 'sent_by', type: 'uuid', nullable: true })
  sentById: string | null;

  @Column({ name: 'received_by', type: 'uuid', nullable: true })
  receivedById: string | null;

  @Column({ name: 'cancelled_by', type: 'uuid', nullable: true })
  cancelledById: string | null;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Column({ name: 'received_at', type: 'timestamptz', nullable: true })
  receivedAt: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'cancel_reason', type: 'varchar', length: 255, nullable: true })
  cancelReason: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => TransferStatusHistory, (history) => history.transfer)
  statusHistory: TransferStatusHistory[];
}
