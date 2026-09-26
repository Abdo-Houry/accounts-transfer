import { In } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { Permission } from '../entities/permission.entity';
import { Role } from '../entities/role.entity';
import { User } from '../entities/user.entity';
import type { RequestContext } from '../types/common';
import { ApiError } from '../utils/api-error';
import { AuditService, AUDIT_ACTIONS } from './audit.service';

export interface RoleInput {
  name: string;
  description?: string;
  permissionCodes?: string[];
}

export class RoleService {
  static async list(): Promise<Role[]> {
    return AppDataSource.getRepository(Role).find({
      relations: { permissions: true },
      order: { name: 'ASC' },
    });
  }

  static async findById(id: string): Promise<Role> {
    return RoleService.loadDetail(AppDataSource.manager, id);
  }

  /**
   * Reads through the caller's manager: inside a write transaction, a plain
   * `AppDataSource` repository is a different connection and cannot see the
   * uncommitted row it is meant to return.
   */
  private static async loadDetail(
    manager: import('typeorm').EntityManager,
    id: string,
  ): Promise<Role> {
    const role = await manager.getRepository(Role).findOne({
      where: { id },
      relations: { permissions: true },
    });
    if (!role) throw ApiError.notFound('role.notFound');
    return role;
  }

  static async listPermissions(): Promise<Permission[]> {
    return AppDataSource.getRepository(Permission).find({
      order: { module: 'ASC', code: 'ASC' },
    });
  }

  static async create(context: RequestContext, input: RoleInput): Promise<Role> {
    return AppDataSource.transaction(async (manager) => {
      const name = input.name.trim().toLowerCase();
      const clash = await manager.getRepository(Role).findOne({ where: { name } });
      if (clash) throw ApiError.conflict('role.nameTaken', { name });

      const role = manager.create(Role, {
        name,
        description: input.description ?? '',
        isSystem: false,
        permissions: await RoleService.resolvePermissions(manager, input.permissionCodes ?? []),
      });
      await manager.save(Role, role);

      await AuditService.recordInTransaction(manager, AuditService.actorFromContext(context), {
        action: AUDIT_ACTIONS.ROLE_CREATED,
        entityType: 'role',
        entityId: role.id,
        after: { name, permissions: input.permissionCodes ?? [] },
        description: `Role ${name} created`,
        descriptionKey: 'audit.desc.roleCreated',
        descriptionParams: { name },
      });

      return RoleService.loadDetail(manager, role.id);
    });
  }

  static async update(
    context: RequestContext,
    id: string,
    input: Partial<RoleInput>,
  ): Promise<Role> {
    return AppDataSource.transaction(async (manager) => {
      const role = await manager
        .getRepository(Role)
        .findOne({ where: { id }, relations: { permissions: true } });
      if (!role) throw ApiError.notFound('role.notFound');

      const before = { name: role.name, description: role.description };

      if (input.name && input.name.trim().toLowerCase() !== role.name) {
        if (role.isSystem) throw ApiError.conflict('role.systemImmutable', { name: role.name });
        const clash = await manager
          .getRepository(Role)
          .findOne({ where: { name: input.name.trim().toLowerCase() } });
        if (clash) throw ApiError.conflict('role.nameTaken', { name: input.name });
        role.name = input.name.trim().toLowerCase();
      }

      if (input.description !== undefined) role.description = input.description;
      await manager.save(Role, role);

      await AuditService.recordInTransaction(manager, AuditService.actorFromContext(context), {
        action: AUDIT_ACTIONS.ROLE_UPDATED,
        entityType: 'role',
        entityId: role.id,
        before,
        after: { name: role.name, description: role.description },
        description: `Role ${role.name} updated`,
        descriptionKey: 'audit.desc.roleUpdated',
        descriptionParams: { name: role.name },
      });

      return RoleService.loadDetail(manager, role.id);
    });
  }

  /**
   * Replaces a role's permission set.
   *
   * Every affected user's `tokenVersion` is bumped so the change is enforced on
   * their very next request instead of whenever their access token expires -
   * revoking a right has to be immediate.
   */
  static async setPermissions(
    context: RequestContext,
    id: string,
    permissionCodes: string[],
  ): Promise<Role> {
    return AppDataSource.transaction(async (manager) => {
      const role = await manager
        .getRepository(Role)
        .findOne({ where: { id }, relations: { permissions: true } });
      if (!role) throw ApiError.notFound('role.notFound');

      const before = role.permissions.map((permission) => permission.code).sort();
      role.permissions = await RoleService.resolvePermissions(manager, permissionCodes);
      await manager.save(Role, role);

      await manager
        .createQueryBuilder()
        .update(User)
        .set({ tokenVersion: () => '"token_version" + 1' })
        .where('role_id = :id', { id })
        .execute();

      await AuditService.recordInTransaction(manager, AuditService.actorFromContext(context), {
        action: AUDIT_ACTIONS.ROLE_PERMISSIONS,
        entityType: 'role',
        entityId: role.id,
        before: { permissions: before },
        after: { permissions: [...permissionCodes].sort() },
        description: `Permissions of role ${role.name} updated`,
        descriptionKey: 'audit.desc.rolePermissions',
        descriptionParams: { name: role.name },
      });

      return RoleService.loadDetail(manager, role.id);
    });
  }

  static async remove(context: RequestContext, id: string): Promise<void> {
    await AppDataSource.transaction(async (manager) => {
      const role = await manager.getRepository(Role).findOne({ where: { id } });
      if (!role) throw ApiError.notFound('role.notFound');
      if (role.isSystem) throw ApiError.conflict('role.systemImmutable', { name: role.name });

      const assigned = await manager.getRepository(User).count({ where: { roleId: id } });
      if (assigned > 0) throw ApiError.conflict('role.inUse', { count: assigned });

      await manager.remove(Role, role);

      await AuditService.recordInTransaction(manager, AuditService.actorFromContext(context), {
        action: AUDIT_ACTIONS.ROLE_DELETED,
        entityType: 'role',
        entityId: id,
        before: { name: role.name },
        description: `Role ${role.name} deleted`,
        descriptionKey: 'audit.desc.roleDeleted',
        descriptionParams: { name: role.name },
      });
    });
  }

  private static async resolvePermissions(
    manager: import('typeorm').EntityManager,
    codes: string[],
  ): Promise<Permission[]> {
    const unique = [...new Set(codes)];
    if (unique.length === 0) return [];

    const permissions = await manager.getRepository(Permission).find({ where: { code: In(unique) } });
    if (permissions.length !== unique.length) {
      const found = new Set(permissions.map((permission) => permission.code));
      const missing = unique.find((code) => !found.has(code));
      throw ApiError.badRequest('permission.unknown', { code: missing ?? '' });
    }
    return permissions;
  }
}
