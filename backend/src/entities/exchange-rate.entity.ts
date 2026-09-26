import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Currency } from './currency.entity';
import { User } from './user.entity';
import { decimalTransformer } from '../utils/money';

/**
 * Append-only rate history. Publishing a new rate closes the previous row
 * (`effectiveTo`, `isActive = false`) instead of overwriting it, so any past
 * operation can always be re-priced with the rate that was live at the time.
 */
@Entity('exchange_rates')
@Index(['currencyId', 'isActive'])
@Index(['currencyId', 'effectiveFrom'])
export class ExchangeRate extends BaseEntity {
  @Column({ name: 'currency_id', type: 'uuid' })
  currencyId: string;

  @ManyToOne(() => Currency, (currency) => currency.rates, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'currency_id' })
  currency: Currency;

  /** Base-currency units the office pays to buy one unit of this currency. */
  @Column({ name: 'buy_rate', type: 'numeric', precision: 30, scale: 10, transformer: decimalTransformer })
  buyRate: string;

  /** Base-currency units the office charges to sell one unit. */
  @Column({ name: 'sell_rate', type: 'numeric', precision: 30, scale: 10, transformer: decimalTransformer })
  sellRate: string;

  @Column({ name: 'effective_from', type: 'timestamptz' })
  effectiveFrom: Date;

  @Column({ name: 'effective_to', type: 'timestamptz', nullable: true })
  effectiveTo: Date | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'previous_rate_id', type: 'uuid', nullable: true })
  previousRateId: string | null;

  @ManyToOne(() => ExchangeRate, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'previous_rate_id' })
  previousRate: ExchangeRate | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdById: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  createdBy: User;

  @Column({ type: 'varchar', length: 255, default: '' })
  note: string;
}
