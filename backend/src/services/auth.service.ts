import bcrypt from 'bcrypt';
import { IsNull } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { env } from '../config/env';
import { RefreshToken } from '../entities/refresh-token.entity';
import { User } from '../entities/user.entity';
import { AuditResult, Language, UserStatus } from '../types/enums';
import { ApiError } from '../utils/api-error';
import {
  generateRefreshToken,
  hashRefreshToken,
  parseDuration,
  signAccessToken,
} from '../utils/tokens';
import { AuditService, AUDIT_ACTIONS, type AuditActor } from './audit.service';

export interface LoginInput {
  username: string;
  password: string;
}

export interface SessionMeta {
  ipAddress: string;
  userAgent: string;
}

export interface AuthenticatedUser {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  language: Language;
  status: UserStatus;
  role: { id: string; name: string; description: string };
  permissions: string[];
  defaultCashBoxId: string | null;
  lastLoginAt: Date | null;
}

export interface LoginResult {
  user: AuthenticatedUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class AuthService {
  /**
   * Verifies credentials and opens a session.
   *
   * The same generic error is returned for an unknown username and a wrong
   * password so the endpoint cannot be used to enumerate accounts, and bcrypt
   * is run against a dummy hash in the unknown-user case to keep the response
   * time from leaking the difference.
   */
  static async login(input: LoginInput, meta: SessionMeta): Promise<LoginResult> {
    const username = input.username.trim().toLowerCase();

    const user = await AppDataSource.getRepository(User)
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .leftJoinAndSelect('user.role', 'role')
      .leftJoinAndSelect('role.permissions', 'permission')
      .where('LOWER(user.username) = :username', { username })
      .getOne();

    const actor: AuditActor = {
      userId: user?.id ?? null,
      username: input.username.trim().slice(0, 50),
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    };

    if (!user) {
      await bcrypt.compare(input.password, DUMMY_HASH);
      await AuditService.record(actor, {
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        result: AuditResult.FAILURE,
        description: 'Unknown username',
        descriptionKey: 'audit.desc.unknownUsername',
      });
      throw ApiError.invalidCredentials();
    }

    const matches = await bcrypt.compare(input.password, user.passwordHash);
    if (!matches) {
      await AuditService.record(actor, {
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        result: AuditResult.FAILURE,
        description: 'Wrong password',
        descriptionKey: 'audit.desc.wrongPassword',
      });
      throw ApiError.invalidCredentials();
    }

    if (user.status !== UserStatus.ACTIVE) {
      await AuditService.record(actor, {
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        result: AuditResult.FAILURE,
        description: 'Account suspended',
        descriptionKey: 'audit.desc.accountSuspended',
      });
      throw ApiError.unauthenticated('auth.accountSuspended');
    }

    const session = await AuthService.issueSession(user, meta);

    user.lastLoginAt = new Date();
    await AppDataSource.getRepository(User).update(user.id, { lastLoginAt: user.lastLoginAt });

    await AuditService.record(
      { ...actor, username: user.username },
      { action: AUDIT_ACTIONS.LOGIN, description: `${user.username} signed in` },
    );

    return { ...session, user: AuthService.toAuthenticatedUser(user) };
  }

  /**
   * Rotates the refresh token: the presented one is revoked and replaced. A
   * token presented twice therefore fails, which surfaces a stolen cookie
   * instead of silently allowing both parties to keep using it.
   */
  static async refresh(rawToken: string, meta: SessionMeta): Promise<LoginResult> {
    if (!rawToken) throw ApiError.unauthenticated('auth.refreshMissing');

    const tokenHash = hashRefreshToken(rawToken);
    const stored = await AppDataSource.getRepository(RefreshToken).findOne({
      where: { tokenHash },
    });

    if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
      throw ApiError.unauthenticated('auth.refreshInvalid');
    }

    const user = await AuthService.loadUserWithPermissions(stored.userId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw ApiError.unauthenticated('auth.accountSuspended');
    }

    const session = await AuthService.issueSession(user, meta);

    stored.revokedAt = new Date();
    stored.replacedBy = session.sessionId;
    await AppDataSource.getRepository(RefreshToken).save(stored);

    return {
      user: AuthService.toAuthenticatedUser(user),
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresIn: session.expiresIn,
    };
  }

  static async logout(rawToken: string | undefined, actor: AuditActor): Promise<void> {
    if (rawToken) {
      await AppDataSource.getRepository(RefreshToken).update(
        { tokenHash: hashRefreshToken(rawToken) },
        { revokedAt: new Date() },
      );
    }
    await AuditService.record(actor, {
      action: AUDIT_ACTIONS.LOGOUT,
      description: `${actor.username} signed out`,
      descriptionKey: 'audit.desc.signedOut',
      descriptionParams: { username: actor.username },
    });
  }

  /** Revokes every session of a user by bumping the token version. */
  static async logoutAll(userId: string, actor: AuditActor): Promise<void> {
    await AppDataSource.transaction(async (manager) => {
      await manager.increment(User, { id: userId }, 'tokenVersion', 1);
      await manager.update(RefreshToken, { userId, revokedAt: IsNull() }, { revokedAt: new Date() });
    });
    await AuditService.record(actor, {
      action: AUDIT_ACTIONS.LOGOUT,
      description: 'All sessions revoked',
      descriptionKey: 'audit.desc.sessionsRevoked',
    });
  }

  static async me(userId: string): Promise<AuthenticatedUser> {
    const user = await AuthService.loadUserWithPermissions(userId);
    if (!user) throw ApiError.notFound('user.notFound');
    return AuthService.toAuthenticatedUser(user);
  }

  static async updateProfile(
    userId: string,
    input: { fullName?: string; phone?: string | null; language?: Language },
  ): Promise<AuthenticatedUser> {
    const repository = AppDataSource.getRepository(User);
    const user = await repository.findOne({ where: { id: userId } });
    if (!user) throw ApiError.notFound('user.notFound');

    if (input.fullName !== undefined) user.fullName = input.fullName.trim();
    if (input.phone !== undefined) user.phone = input.phone;
    if (input.language !== undefined) user.language = input.language;
    await repository.save(user);

    return AuthService.me(userId);
  }

  /** Changing a password invalidates every existing session, including this one. */
  static async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    actor: AuditActor,
  ): Promise<void> {
    const repository = AppDataSource.getRepository(User);
    const user = await repository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :userId', { userId })
      .getOne();

    if (!user) throw ApiError.notFound('user.notFound');

    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) {
      await AuditService.record(actor, {
        action: AUDIT_ACTIONS.PASSWORD_CHANGED,
        result: AuditResult.FAILURE,
        description: 'Wrong current password',
        descriptionKey: 'audit.desc.wrongCurrentPassword',
      });
      throw ApiError.unauthenticated('auth.currentPasswordWrong');
    }

    user.passwordHash = await AuthService.hashPassword(newPassword);
    user.tokenVersion += 1;
    await repository.save(user);
    await AppDataSource.getRepository(RefreshToken).update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );

    await AuditService.record(actor, {
      action: AUDIT_ACTIONS.PASSWORD_CHANGED,
      entityType: 'user',
      entityId: userId,
      description: 'Password changed',
      descriptionKey: 'audit.desc.passwordChanged',
    });
  }

  static hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
  }

  // ------------------------------------------------------------- internals

  private static async issueSession(
    user: User,
    meta: SessionMeta,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; sessionId: string }> {
    const repository = AppDataSource.getRepository(RefreshToken);
    const rawToken = generateRefreshToken();

    const session = repository.create({
      userId: user.id,
      tokenHash: hashRefreshToken(rawToken),
      expiresAt: new Date(Date.now() + parseDuration(env.JWT_REFRESH_EXPIRES_IN)),
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent.slice(0, 255),
    });
    await repository.save(session);

    const accessToken = signAccessToken({
      sub: user.id,
      jti: session.id,
      role: user.role?.name ?? '',
      tv: user.tokenVersion,
    });

    return {
      accessToken,
      refreshToken: rawToken,
      expiresIn: Math.floor(parseDuration(env.JWT_ACCESS_EXPIRES_IN) / 1000),
      sessionId: session.id,
    };
  }

  static async loadUserWithPermissions(userId: string): Promise<User | null> {
    return AppDataSource.getRepository(User)
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.role', 'role')
      .leftJoinAndSelect('role.permissions', 'permission')
      .where('user.id = :userId', { userId })
      .getOne();
  }

  private static toAuthenticatedUser(user: User): AuthenticatedUser {
    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      language: user.language,
      status: user.status,
      role: {
        id: user.role?.id ?? '',
        name: user.role?.name ?? '',
        description: user.role?.description ?? '',
      },
      permissions: (user.role?.permissions ?? []).map((permission) => permission.code),
      defaultCashBoxId: user.defaultCashBoxId,
      lastLoginAt: user.lastLoginAt,
    };
  }
}

/**
 * A real bcrypt hash of a random value. Comparing against it keeps the
 * unknown-user path as slow as the known-user path.
 */
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.9NkV1UuFPnRoPeFqBS8vqtZ0YQGD9lu';
