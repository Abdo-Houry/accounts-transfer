import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Account } from './account.entity';
import { User } from './user.entity';
import { CorrespondentStatus } from '../types/enums';

/**
 * A partner office this one exchanges transfers with.
 *
 * Distinct from a customer on purpose: the relationship is a standing current
 * account with a running balance per currency, not a single completed deal.
 * `accountId` points at that office's own `1300-<CODE>` account, which is where
 * every leg routed through them lands.
 */
@Entity('correspondents')
export class Correspondent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Short stable handle, uppercased - also the suffix of the ledger account. */
  @Index('uq_correspondents_code', { unique: true })
  @Column({ type: 'varchar', length: 20 })
  code: string;

  @Column({ name: 'name_ar', type: 'varchar', length: 150 })
  nameAr: string;

  @Column({ name: 'name_en', type: 'varchar', length: 150 })
  nameEn: string;

  @Column({ name: 'name_tr', type: 'varchar', length: 150 })
  nameTr: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  country: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email: string | null;

  @Column({ name: 'contact_person', type: 'varchar', length: 150, nullable: true })
  contactPerson: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'enum', enum: CorrespondentStatus, default: CorrespondentStatus.ACTIVE })
  status: CorrespondentStatus;

  /** The `1300-<CODE>` current account created with this correspondent. */
  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @ManyToOne(() => Account, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'account_id' })
  account: Account;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdBy: User | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
