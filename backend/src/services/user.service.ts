import { IsNull } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { SYSTEM_ROLES } from '../config/permissions';
import { RefreshToken } from '../entities/refresh-token.entity';
import { Role } from '../entities/role.entity';
import { User } from '../entities/user.entity';
import { Language, UserStatus } from '../types/enums';
import type { Paginated, RequestContext } from '../types/common';
import { ApiError } from '../utils/api-error';
import { normalizePagination, paginate, safeSort, safeSortOrder } from '../utils/pagination';
import { AuthService } from './auth.service';
import { AuditService, AUDIT_ACTIONS } from './audit.service';

export interface CreateUserInput {
  username: string;
  password: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  roleId: string;
  defaultCashBoxId?: string | null;
  language?: Language;
}

export interface UpdateUserInput {
  fullName?: string;
  email?: string | null;
  phone?: string | null;
  roleId?: string;
  defaultCashBoxId?: string | null;
  language?: Language;
}

export interface UserListQuery {
  page?: number;
  limit?: number;
  q?: string;
  roleId?: string;
  status?: UserStatus;
  sortBy?: string;
  sortOrder?: string;
}

const SORTABLE = ['createdAt', 'username', 'fullName', 'lastLoginAt'] as const;

export class UserService {
  static async list(query: UserListQuery): Promise<Paginated<User>> {
    const { page, limit, skip, take } = normalizePagination(query);
    const sortBy = safeSort(query.sortBy, SORTABLE, 'createdAt');
    const sortOrder = safeSortOrder(query.sortOrder);

    const builder = AppDataSource.getRepository(User)
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .leftJoinAndSelect('user.defaultCashBox', 'cashBox')
      .orderBy(`user.${sortBy}`, sortOrder)
      .skip(skip)
      .take(take);

    if (query.roleId) builder.andWhere('user.role_id = :roleId', { roleId: query.roleId });
    if (query.status) builder.andWhere('user.status = :status', { status: query.status });
    if (query.q) {
      const term = `%${query.q.trim()}%`;
      builder.andWhere(
        '(user.username ILIKE :term OR user.full_name ILIKE :term OR user.email ILIKE :term OR user.phone ILIKE :term)',
        { term },
      );
    }

    const [items, total] = await builder.getManyAndCount();
    return paginate(items, page, limit, total);
  }

  static async findById(id: string): Promise<User> {
    return UserService.loadDetail(AppDataSource.manager, id);
  }

  /**
   * Reads through the *caller's* manager.
   *
   * A write path must reload with its own transaction manager: a plain
   * `AppDataSource` repository is a different connection and cannot see rows
   * that the open transaction has not committed yet, which would make a
   * just-created user come back as "not found".
   */
  private static async loadDetail(
    manager: import('typeorm').EntityManager,
    id: string,
  ): Promise<User> {
    const user = await manager.getRepository(User).findOne({
      where: { id },
      relations: { role: { permissions: true }, defaultCashBox: true },
    });
    if (!user) throw ApiError.notFound('user.notFound');
    return user;
  }

  static async create(context: RequestContext, input: CreateUserInput): Promise<User> {
    return AppDataSource.transaction(async (manager) => {
      const username = input.username.trim().toLowerCase();

      const clash = await manager.getRepository(User).findOne({ where: { username } });
      if (clash) throw ApiError.conflict('user.usernameTaken', { username });

      if (input.email) {
        const emailClash = await manager
          .getRepository(User)
          .findOne({ where: { email: input.email.trim().toLowerCase() } });
        if (emailClash) throw ApiError.conflict('user.emailTaken', { email: input.email });
      }

      const role = await manager.getRepository(Role).findOne({ where: { id: input.roleId } });
      if (!role) throw ApiError.notFound('role.notFound');

      const user = manager.create(User, {
        username,
        email: input.email?.trim().toLowerCase() || null,
        fullName: input.fullName.trim(),
        passwordHash: await AuthService.hashPassword(input.password),
        phone: input.phone ?? null,
        roleId: role.id,
        defaultCashBoxId: input.defaultCashBoxId ?? null,
        language: input.language ?? Language.AR,
        status: UserStatus.ACTIVE,
        tokenVersion: 0,
      });
      await manager.save(User, user);

      await AuditService.recordInTransaction(manager, AuditService.actorFromContext(context), {
        action: AUDIT_ACTIONS.USER_CREATED,
        entityType: 'user',
        entityId: user.id,
        after: { username, fullName: user.fullName, role: role.name },
        description: `User ${username} created with role ${role.name}`,
        descriptionKey: 'audit.desc.userCreated',
        descriptionParams: { username, role: role.name },
      });

      return UserService.loadDetail(manager, user.id);
    });
  }

  static async update(
    context: RequestContext,
    id: string,
    input: UpdateUserInput,
  ): Promise<User> {
    return AppDataSource.transaction(async (manager) => {
      const user = await manager.getRepository(User).findOne({ where: { id }, relations: { role: true } });
      if (!user) throw ApiError.notFound('user.notFound');

      if (input.email && input.email.trim().toLowerCase() !== user.email) {
        const emailClash = await manager
          .getRepository(User)
          .findOne({ where: { email: input.email.trim().toLowerCase() } });
        if (emailClash && emailClash.id !== id) {
          throw ApiError.conflict('user.emailTaken', { email: input.email });
        }
      }

      const before = { username: user.username, roleId: user.roleId, fullName: user.fullName };
      const roleChanged = input.roleId !== undefined && input.roleId !== user.roleId;

      if (roleChanged) {
        const role = await manager.getRepository(Role).findOne({ where: { id: input.roleId } });
        if (!role) throw ApiError.notFound('role.notFound');
        await UserService.assertNotLastAdmin(manager, user);
        user.roleId = role.id;
      }

      if (input.fullName !== undefined) user.fullName = input.fullName.trim();
      if (input.email !== undefined) user.email = input.email?.trim().toLowerCase() || null;
      if (input.phone !== undefined) user.phone = input.phone;
      if (input.defaultCashBoxId !== undefined) user.defaultCashBoxId = input.defaultCashBoxId;
      if (input.language !== undefined) user.language = input.language;

      // A changed role must take effect immediately, not when the token expires.
      if (roleChanged) user.tokenVersion += 1;

      await manager.save(User, user);

      await AuditService.recordInTransaction(manager, AuditService.actorFromContext(context), {
        action: AUDIT_ACTIONS.USER_UPDATED,
        entityType: 'user',
        entityId: user.id,
        before,
        after: { username: user.username, roleId: user.roleId, fullName: user.fullName },
        description: `User ${user.username} updated`,
        descriptionKey: 'audit.desc.userUpdated',
        descriptionParams: { username: user.username },
      });

      return UserService.loadDetail(manager, user.id);
    });
  }

  static async setStatus(
    context: RequestContext,
    id: string,
    status: UserStatus,
  ): Promise<User> {
    if (id === context.userId && status !== UserStatus.ACTIVE) {
      throw ApiError.conflict('user.cannotSuspendSelf');
    }

    return AppDataSource.transaction(async (manager) => {
      const user = await manager
        .getRepository(User)
        .findOne({ where: { id }, relations: { role: true } });
      if (!user) throw ApiError.notFound('user.notFound');

      if (status !== UserStatus.ACTIVE) await UserService.assertNotLastAdmin(manager, user);

      const before = user.status;
      user.status = status;
      if (status !== UserStatus.ACTIVE) {
        // Suspension must end the sessions the user already has open.
        user.tokenVersion += 1;
        await manager.update(RefreshToken, { userId: id, revokedAt: IsNull() }, { revokedAt: new Date() });
      }
      await manager.save(User, user);

      await AuditService.recordInTransaction(manager, AuditService.actorFromContext(context), {
        action: AUDIT_ACTIONS.USER_STATUS,
        entityType: 'user',
        entityId: user.id,
        before: { status: before },
        after: { status },
        description: `User ${user.username} status -> ${status}`,
        descriptionKey: 'audit.desc.userStatus',
        descriptionParams: { username: user.username, status },
      });

      return UserService.loadDetail(manager, user.id);
    });
  }

  static async resetPassword(
    context: RequestContext,
    id: string,
    newPassword: string,
  ): Promise<{ username: string }> {
    return AppDataSource.transaction(async (manager) => {
      const user = await manager.getRepository(User).findOne({ where: { id } });
      if (!user) throw ApiError.notFound('user.notFound');

      user.passwordHash = await AuthService.hashPassword(newPassword);
      user.tokenVersion += 1;
      await manager.save(User, user);
      await manager.update(RefreshToken, { userId: id, revokedAt: IsNull() }, { revokedAt: new Date() });

      await AuditService.recordInTransaction(manager, AuditService.actorFromContext(context), {
        action: AUDIT_ACTIONS.PASSWORD_RESET,
        entityType: 'user',
        entityId: user.id,
        description: `Password reset for ${user.username}`,
        descriptionKey: 'audit.desc.passwordResetFor',
        descriptionParams: { username: user.username },
      });

      return { username: user.username };
    });
  }

  /**
   * Guards against locking everyone out: the office must always keep at least
   * one active administrator.
   */
  private static async assertNotLastAdmin(
    manager: import('typeorm').EntityManager,
    user: User,
  ): Promise<void> {
    const role = user.role ?? (await manager.getRepository(Role).findOne({ where: { id: user.roleId } }));
    if (role?.name !== SYSTEM_ROLES.ADMIN) return;

    const remaining = await manager
      .getRepository(User)
      .createQueryBuilder('user')
      .innerJoin('user.role', 'role')
      .where('role.name = :admin', { admin: SYSTEM_ROLES.ADMIN })
      .andWhere('user.status = :status', { status: UserStatus.ACTIVE })
      .andWhere('user.id != :id', { id: user.id })
      .getCount();

    if (remaining === 0) throw ApiError.conflict('user.cannotDeleteLastAdmin');
  }
}
