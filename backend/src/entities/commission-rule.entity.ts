import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Currency } from './currency.entity';
import { CommissionMethod, CommissionOperation } from '../types/enums';
import { decimalTransformer } from '../utils/money';

/**
 * Configurable pricing. The *resolved* commission is denormalised onto each
 * transfer / exchange, so editing a rule never rewrites history.
 */
@Entity('commission_rules')
export class CommissionRule extends BaseEntity {
  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'enum', enum: CommissionOperation })
  operation: CommissionOperation;

  /** `null` means the rule applies to every currency. */
  @Column({ name: 'currency_id', type: 'uuid', nullable: true })
  currencyId: string | null;

  @ManyToOne(() => Currency, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'currency_id' })
  currency: Currency | null;

  @Column({ type: 'enum', enum: CommissionMethod })
  method: CommissionMethod;

  @Column({ name: 'fixed_amount', type: 'numeric', precision: 30, scale: 10, nullable: true, transformer: decimalTransformer })
  fixedAmount: string | null;

  /** Percentage points: `1.5` means 1.5 %. */
  @Column({ type: 'numeric', precision: 10, scale: 6, nullable: true, transformer: decimalTransformer })
  percent: string | null;

  @Column({ name: 'min_amount', type: 'numeric', precision: 30, scale: 10, nullable: true, transformer: decimalTransformer })
  minAmount: string | null;

  @Column({ name: 'max_amount', type: 'numeric', precision: 30, scale: 10, nullable: true, transformer: decimalTransformer })
  maxAmount: string | null;

  /** Tier bounds, inclusive lower / exclusive upper. */
  @Column({ name: 'from_amount', type: 'numeric', precision: 30, scale: 10, nullable: true, transformer: decimalTransformer })
  fromAmount: string | null;

  @Column({ name: 'to_amount', type: 'numeric', precision: 30, scale: 10, nullable: true, transformer: decimalTransformer })
  toAmount: string | null;

  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}
