import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Transfer } from './transfer.entity';
import { User } from './user.entity';
import { TransferStatus } from '../types/enums';

/** Immutable trail of every status move a transfer went through. */
@Entity('transfer_status_history')
@Index(['transferId', 'createdAt'])
export class TransferStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'transfer_id', type: 'uuid' })
  transferId: string;

  @ManyToOne(() => Transfer, (transfer) => transfer.statusHistory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transfer_id' })
  transfer: Transfer;

  /** `null` on the creation row. */
  @Column({ name: 'from_status', type: 'enum', enum: TransferStatus, nullable: true })
  fromStatus: TransferStatus | null;

  @Column({ name: 'to_status', type: 'enum', enum: TransferStatus })
  toStatus: TransferStatus;

  @Column({ name: 'changed_by', type: 'uuid' })
  changedById: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'changed_by' })
  changedBy: User;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
