import { Column, Entity, Index, ManyToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Role } from './role.entity';

@Entity('permissions')
export class Permission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** e.g. `transfer.create` - see config/permissions.ts */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 80 })
  code: string;

  @Column({ type: 'varchar', length: 40 })
  module: string;

  @Column({ type: 'varchar', length: 200, default: '' })
  description: string;

  @ManyToMany(() => Role, (role) => role.permissions)
  roles: Role[];
}
