import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity';
import { AuditResult } from '../types/enums';

/**
 * Append-only trail of every security- or money-relevant action.
 * `username` is snapshotted so the trail survives a user row being changed.
 */
@Entity('audit_logs')
@Index(['createdAt'])
@Index(['entityType', 'entityId'])
@Index(['userId', 'createdAt'])
@Index(['action', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Null for a failed login against an unknown username. */
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({ type: 'varchar', length: 50, default: '' })
  username: string;

  @Column({ type: 'varchar', length: 60 })
  action: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 40, nullable: true })
  entityType: string | null;

  @Column({ name: 'entity_id', type: 'uuid', nullable: true })
  entityId: string | null;

  @Column({ type: 'enum', enum: AuditResult, default: AuditResult.SUCCESS })
  result: AuditResult;

  @Column({ name: 'before_data', type: 'jsonb', nullable: true })
  beforeData: Record<string, unknown> | null;

  @Column({ name: 'after_data', type: 'jsonb', nullable: true })
  afterData: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 255, default: '' })
  description: string;

  /**
   * Translatable form of `description`: a catalogue key plus its params, so
   * the sentence is rendered in the reader's language instead of being frozen
   * in English at write time. Null on rows written before this was introduced -
   * the read layer falls back to `description` for those.
   */
  @Column({ name: 'description_key', type: 'varchar', length: 80, nullable: true })
  descriptionKey: string | null;

  @Column({ name: 'description_params', type: 'jsonb', nullable: true })
  descriptionParams: Record<string, string | number> | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, default: '' })
  ipAddress: string;

  @Column({ name: 'user_agent', type: 'varchar', length: 255, default: '' })
  userAgent: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
