import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Role } from './role.entity';
import { CashBox } from './cash-box.entity';
import { RefreshToken } from './refresh-token.entity';
import { Language, UserStatus } from '../types/enums';

@Entity('users')
export class User extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50 })
  username: string;

  @Index({ unique: true, where: 'email IS NOT NULL' })
  @Column({ type: 'varchar', length: 150, nullable: true })
  email: string | null;

  @Column({ name: 'full_name', type: 'varchar', length: 150 })
  fullName: string;

  /**
   * bcrypt hash. `select: false` keeps it out of every ordinary query - the
   * login service asks for it explicitly with `addSelect`.
   */
  @Column({ name: 'password_hash', type: 'varchar', length: 255, select: false })
  passwordHash: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  @Column({ name: 'role_id', type: 'uuid' })
  roleId: string;

  @ManyToOne(() => Role, (role) => role.users, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'role_id' })
  role: Role;

  /** Pre-selected cash box in the operation screens. */
  @Column({ name: 'default_cash_box_id', type: 'uuid', nullable: true })
  defaultCashBoxId: string | null;

  @ManyToOne(() => CashBox, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'default_cash_box_id' })
  defaultCashBox: CashBox | null;

  @Column({ type: 'enum', enum: Language, default: Language.AR })
  language: Language;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  /** Incrementing this invalidates every access token already issued. */
  @Column({ name: 'token_version', type: 'int', default: 0 })
  tokenVersion: number;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @OneToMany(() => RefreshToken, (token) => token.user)
  refreshTokens: RefreshToken[];
}
