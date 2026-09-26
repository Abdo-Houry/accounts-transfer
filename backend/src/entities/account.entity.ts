import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { CashBox } from './cash-box.entity';
import { AccountType, EntryDirection } from '../types/enums';

/** A node of the chart of accounts (config/accounts.ts seeds the roots). */
@Entity('accounts')
export class Account extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 30 })
  code: string;

  @Column({ name: 'name_ar', type: 'varchar', length: 120 })
  nameAr: string;

  @Column({ name: 'name_en', type: 'varchar', length: 120 })
  nameEn: string;

  @Column({ name: 'name_tr', type: 'varchar', length: 120 })
  nameTr: string;

  @Column({ type: 'enum', enum: AccountType })
  type: AccountType;

  @Column({ name: 'normal_balance', type: 'enum', enum: EntryDirection })
  normalBalance: EntryDirection;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId: string | null;

  @ManyToOne(() => Account, (account) => account.children, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'parent_id' })
  parent: Account | null;

  @OneToMany(() => Account, (account) => account.parent)
  children: Account[];

  /** Set on the `1000-<box>` leaf that mirrors one cash box. */
  @Index({ unique: true, where: 'cash_box_id IS NOT NULL' })
  @Column({ name: 'cash_box_id', type: 'uuid', nullable: true })
  cashBoxId: string | null;

  @ManyToOne(() => CashBox, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cash_box_id' })
  cashBox: CashBox | null;

  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}
