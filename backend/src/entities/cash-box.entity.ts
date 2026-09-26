import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { CashBoxBalance } from './cash-box-balance.entity';
import { User } from './user.entity';
import { CashBoxStatus } from '../types/enums';

@Entity('cash_boxes')
export class CashBox extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 30 })
  code: string;

  @Column({ name: 'name_ar', type: 'varchar', length: 100 })
  nameAr: string;

  @Column({ name: 'name_en', type: 'varchar', length: 100 })
  nameEn: string;

  @Column({ name: 'name_tr', type: 'varchar', length: 100 })
  nameTr: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  branch: string | null;

  @Column({ type: 'enum', enum: CashBoxStatus, default: CashBoxStatus.ACTIVE })
  status: CashBoxStatus;

  /**
   * Off by default. Only a box that legitimately runs a credit line (e.g. a
   * partner settlement box) should ever be allowed to go negative.
   */
  @Column({ name: 'allows_negative', type: 'boolean', default: false })
  allowsNegative: boolean;

  @Column({ type: 'varchar', length: 255, default: '' })
  description: string;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @Column({ name: 'closed_by', type: 'uuid', nullable: true })
  closedById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'closed_by' })
  closedBy: User | null;

  @OneToMany(() => CashBoxBalance, (balance) => balance.cashBox)
  balances: CashBoxBalance[];
}
