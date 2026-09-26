import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { ExchangeRate } from './exchange-rate.entity';
import { CashBoxBalance } from './cash-box-balance.entity';

@Entity('currencies')
export class Currency extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 3 })
  code: string;

  @Column({ name: 'name_ar', type: 'varchar', length: 60 })
  nameAr: string;

  @Column({ name: 'name_en', type: 'varchar', length: 60 })
  nameEn: string;

  @Column({ name: 'name_tr', type: 'varchar', length: 60 })
  nameTr: string;

  @Column({ type: 'varchar', length: 8, default: '' })
  symbol: string;

  /** Display rounding only - storage is always numeric(30,10). */
  @Column({ name: 'decimal_places', type: 'smallint', default: 2 })
  decimalPlaces: number;

  /** Exactly one currency is the accounting base (see BASE_CURRENCY). */
  @Column({ name: 'is_base', type: 'boolean', default: false })
  isBase: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @OneToMany(() => ExchangeRate, (rate) => rate.currency)
  rates: ExchangeRate[];

  @OneToMany(() => CashBoxBalance, (balance) => balance.currency)
  balances: CashBoxBalance[];
}
