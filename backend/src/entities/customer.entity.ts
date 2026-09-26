import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';
import { CustomerStatus } from '../types/enums';

@Entity('customers')
@Index(['fullName'])
export class Customer extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'customer_no', type: 'varchar', length: 20 })
  customerNo: string;

  @Column({ name: 'full_name', type: 'varchar', length: 150 })
  fullName: string;

  @Index()
  @Column({ type: 'varchar', length: 30 })
  phone: string;

  @Column({ name: 'alt_phone', type: 'varchar', length: 30, nullable: true })
  altPhone: string | null;

  @Column({ name: 'national_id', type: 'varchar', length: 50, nullable: true })
  nationalId: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  country: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'enum', enum: CustomerStatus, default: CustomerStatus.ACTIVE })
  status: CustomerStatus;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdBy: User | null;
}
