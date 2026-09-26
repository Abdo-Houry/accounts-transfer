import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { AuditLog } from '../entities/audit-log.entity';
import { AuditResult } from '../types/enums';
import type { RequestContext, Paginated } from '../types/common';
import { logger, redact } from '../utils/logger';
import type { MessageParams } from '../utils/i18n';
import { normalizePagination, paginate } from '../utils/pagination';

export interface AuditInput {
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  result?: AuditResult;
  before?: unknown;
  after?: unknown;
  description?: string;
  /**
   * Translatable form of `description`. The trail is read by the office's own
   * staff, so a row has to be legible in the language they run the UI in.
   */
  descriptionKey?: string;
  descriptionParams?: MessageParams;
}

export interface AuditActor {
  userId: string | null;
  username: string;
  ipAddress: string;
  userAgent: string;
}

export interface AuditQuery {
  page?: number;
  limit?: number;
  userId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  result?: AuditResult;
  from?: Date;
  to?: Date;
  q?: string;
}

/**
 * Audit trail writer.
 *
 * Two entry points on purpose:
 *  - `recordInTransaction` joins the caller's transaction, so the trail of a
 *    money operation is committed or rolled back together with the money.
 *  - `record` opens its own connection, so a *failure* is still recorded after
 *    the failing transaction has been rolled back.
 */
export class AuditService {
  static async recordInTransaction(
    manager: EntityManager,
    actor: AuditActor,
    input: AuditInput,
  ): Promise<void> {
    const log = manager.create(AuditLog, AuditService.build(actor, input));
    await manager.save(AuditLog, log);
  }

  /**
   * Fire-and-forget. Never lets an audit write break the request it describes -
   * a failure here is logged loudly instead.
   */
  static async record(actor: AuditActor, input: AuditInput): Promise<void> {
    try {
      const repository = AppDataSource.getRepository(AuditLog);
      await repository.save(repository.create(AuditService.build(actor, input)));
    } catch (error) {
      logger.error('Failed to write audit log', { action: input.action, error });
    }
  }

  /** Convenience overload for authenticated requests. */
  static actorFromContext(context: RequestContext): AuditActor {
    return {
      userId: context.userId,
      username: context.username,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    };
  }

  private static build(actor: AuditActor, input: AuditInput): Partial<AuditLog> {
    return {
      userId: actor.userId,
      username: actor.username,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      result: input.result ?? AuditResult.SUCCESS,
      beforeData: input.before ? (redact(input.before) as Record<string, unknown>) : null,
      afterData: input.after ? (redact(input.after) as Record<string, unknown>) : null,
      description: (input.description ?? '').slice(0, 255),
      descriptionKey: input.descriptionKey ?? null,
      descriptionParams: input.descriptionParams ?? null,
      ipAddress: actor.ipAddress.slice(0, 45),
      userAgent: actor.userAgent.slice(0, 255),
    };
  }

  // ------------------------------------------------------------------ query

  static async list(query: AuditQuery): Promise<Paginated<AuditLog>> {
    const { page, limit, skip, take } = normalizePagination(query);
    const builder = AppDataSource.getRepository(AuditLog)
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.user', 'user')
      .orderBy('log.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (query.userId) builder.andWhere('log.user_id = :userId', { userId: query.userId });
    if (query.action) builder.andWhere('log.action = :action', { action: query.action });
    if (query.entityType) builder.andWhere('log.entity_type = :entityType', { entityType: query.entityType });
    if (query.entityId) builder.andWhere('log.entity_id = :entityId', { entityId: query.entityId });
    if (query.result) builder.andWhere('log.result = :result', { result: query.result });
    if (query.from) builder.andWhere('log.created_at >= :from', { from: query.from });
    if (query.to) builder.andWhere('log.created_at <= :to', { to: query.to });
    if (query.q) {
      builder.andWhere('(log.username ILIKE :q OR log.description ILIKE :q)', { q: `%${query.q}%` });
    }

    const [items, total] = await builder.getManyAndCount();
    return paginate(items, page, limit, total);
  }

  static async findById(id: string): Promise<AuditLog | null> {
    return AppDataSource.getRepository(AuditLog).findOne({
      where: { id },
      relations: { user: true },
    });
  }
}

/** Canonical action names - keeps the audit trail searchable. */
export const AUDIT_ACTIONS = {
  LOGIN: 'auth.login',
  LOGIN_FAILED: 'auth.login.failed',
  LOGOUT: 'auth.logout',
  PASSWORD_CHANGED: 'auth.password.change',
  PASSWORD_RESET: 'auth.password.reset',
  USER_CREATED: 'user.create',
  USER_UPDATED: 'user.update',
  USER_STATUS: 'user.status',
  ROLE_CREATED: 'role.create',
  ROLE_UPDATED: 'role.update',
  ROLE_DELETED: 'role.delete',
  ROLE_PERMISSIONS: 'role.permissions',
  CUSTOMER_CREATED: 'customer.create',
  CUSTOMER_UPDATED: 'customer.update',
  CORRESPONDENT_CREATED: 'correspondent.create',
  CORRESPONDENT_UPDATED: 'correspondent.update',
  CORRESPONDENT_STATUS: 'correspondent.status',
  CURRENCY_CREATED: 'currency.create',
  CURRENCY_UPDATED: 'currency.update',
  RATE_UPDATED: 'rate.update',
  CASHBOX_CREATED: 'cashbox.create',
  CASHBOX_UPDATED: 'cashbox.update',
  CASHBOX_CLOSED: 'cashbox.close',
  CASHBOX_OPENING: 'cashbox.opening',
  CASHBOX_TRANSFER: 'cashbox.transfer',
  TRANSFER_CREATED: 'transfer.create',
  TRANSFER_UPDATED: 'transfer.update',
  TRANSFER_SENT: 'transfer.send',
  TRANSFER_RECEIVED: 'transfer.receive',
  TRANSFER_CANCELLED: 'transfer.cancel',
  EXCHANGE_CREATED: 'exchange.create',
  EXCHANGE_REVERSED: 'exchange.reverse',
  VOUCHER_RECEIPT: 'voucher.receipt',
  VOUCHER_PAYMENT: 'voucher.payment',
  VOUCHER_VOIDED: 'voucher.void',
  COMMISSION_CREATED: 'commission.create',
  COMMISSION_UPDATED: 'commission.update',
  COMMISSION_DELETED: 'commission.delete',
  LEDGER_ADJUSTMENT: 'ledger.adjustment',
} as const;
