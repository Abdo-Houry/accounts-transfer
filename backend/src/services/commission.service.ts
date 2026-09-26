import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { CommissionRule } from '../entities/commission-rule.entity';
import { CommissionMethod, CommissionOperation } from '../types/enums';
import type { RequestContext } from '../types/common';
import { ApiError } from '../utils/api-error';
import { Money, money } from '../utils/money';
import { AuditService, AUDIT_ACTIONS } from './audit.service';

export interface CommissionRuleInput {
  name: string;
  operation: CommissionOperation;
  currencyId?: string | null;
  method: CommissionMethod;
  fixedAmount?: string | null;
  percent?: string | null;
  minAmount?: string | null;
  maxAmount?: string | null;
  fromAmount?: string | null;
  toAmount?: string | null;
  priority?: number;
  isActive?: boolean;
}

export interface ResolvedCommission {
  amount: string;
  ruleId: string | null;
  ruleName: string | null;
  method: CommissionMethod | null;
}

export class CommissionService {
  static async list(operation?: CommissionOperation): Promise<CommissionRule[]> {
    return AppDataSource.getRepository(CommissionRule).find({
      where: operation ? { operation } : {},
      relations: { currency: true },
      order: { operation: 'ASC', priority: 'DESC', name: 'ASC' },
    });
  }

  static async create(
    context: RequestContext,
    input: CommissionRuleInput,
  ): Promise<CommissionRule> {
    CommissionService.assertConsistent(input);

    return AppDataSource.transaction(async (manager) => {
      const rule = manager.create(CommissionRule, CommissionService.toEntity(input));
      await manager.save(CommissionRule, rule);

      await AuditService.recordInTransaction(manager, AuditService.actorFromContext(context), {
        action: AUDIT_ACTIONS.COMMISSION_CREATED,
        entityType: 'commission_rule',
        entityId: rule.id,
        after: { ...rule },
        description: `Commission rule ${rule.name} created`,
        descriptionKey: 'audit.desc.commissionCreated',
        descriptionParams: { name: rule.name },
      });

      return rule;
    });
  }

  static async update(
    context: RequestContext,
    id: string,
    input: Partial<CommissionRuleInput>,
  ): Promise<CommissionRule> {
    return AppDataSource.transaction(async (manager) => {
      const rule = await manager.getRepository(CommissionRule).findOne({ where: { id } });
      if (!rule) throw ApiError.notFound('commission.notFound');

      const merged = { ...rule, ...input } as CommissionRuleInput;
      CommissionService.assertConsistent(merged);

      const before = { ...rule };
      Object.assign(rule, CommissionService.toEntity(merged));
      await manager.save(CommissionRule, rule);

      await AuditService.recordInTransaction(manager, AuditService.actorFromContext(context), {
        action: AUDIT_ACTIONS.COMMISSION_UPDATED,
        entityType: 'commission_rule',
        entityId: rule.id,
        before,
        after: { ...rule },
        description: `Commission rule ${rule.name} updated`,
        descriptionKey: 'audit.desc.commissionUpdated',
        descriptionParams: { name: rule.name },
      });

      return rule;
    });
  }

  static async remove(context: RequestContext, id: string): Promise<void> {
    await AppDataSource.transaction(async (manager) => {
      const rule = await manager.getRepository(CommissionRule).findOne({ where: { id } });
      if (!rule) throw ApiError.notFound('commission.notFound');

      await manager.remove(CommissionRule, rule);

      await AuditService.recordInTransaction(manager, AuditService.actorFromContext(context), {
        action: AUDIT_ACTIONS.COMMISSION_DELETED,
        entityType: 'commission_rule',
        entityId: id,
        before: { ...rule },
        description: `Commission rule ${rule.name} deleted`,
        descriptionKey: 'audit.desc.commissionDeleted',
        descriptionParams: { name: rule.name },
      });
    });
  }

  /**
   * Suggests the commission for an operation.
   *
   * The most specific active rule wins: a currency-specific rule beats a
   * currency-agnostic one, then higher `priority`, then a tier that actually
   * contains the amount. The result is only a *suggestion* - the operator may
   * override it, and whatever is finally charged is stored on the operation
   * itself, so editing a rule never rewrites past deals.
   */
  static async resolve(
    manager: EntityManager,
    operation: CommissionOperation,
    currencyId: string,
    amount: Money | string,
  ): Promise<ResolvedCommission> {
    const value = money(amount);

    const rules = await manager
      .getRepository(CommissionRule)
      .createQueryBuilder('rule')
      .where('rule.is_active = true')
      .andWhere('rule.operation = :operation', { operation })
      .andWhere('(rule.currency_id = :currencyId OR rule.currency_id IS NULL)', { currencyId })
      .orderBy('CASE WHEN rule.currency_id IS NULL THEN 0 ELSE 1 END', 'DESC')
      .addOrderBy('rule.priority', 'DESC')
      .getMany();

    const applicable = rules.find((rule) => CommissionService.matchesRange(rule, value));
    if (!applicable) {
      return { amount: '0', ruleId: null, ruleName: null, method: null };
    }

    return {
      amount: CommissionService.compute(applicable, value).toString(),
      ruleId: applicable.id,
      ruleName: applicable.name,
      method: applicable.method,
    };
  }

  // ------------------------------------------------------------- internals

  private static matchesRange(rule: CommissionRule, amount: Money): boolean {
    if (rule.method !== CommissionMethod.TIERED) return true;
    if (rule.fromAmount !== null && amount.lt(rule.fromAmount)) return false;
    if (rule.toAmount !== null && amount.gte(rule.toAmount)) return false;
    return true;
  }

  private static compute(rule: CommissionRule, amount: Money): Money {
    let result: Money;

    switch (rule.method) {
      case CommissionMethod.FIXED:
        result = money(rule.fixedAmount ?? '0');
        break;
      case CommissionMethod.PERCENT:
        result = amount.percent(rule.percent ?? '0');
        break;
      case CommissionMethod.TIERED:
        // A tier may carry a flat part, a percentage part, or both.
        result = money(rule.fixedAmount ?? '0').add(
          rule.percent ? amount.percent(rule.percent) : Money.ZERO,
        );
        break;
      default:
        result = Money.ZERO;
    }

    return result.clamp(rule.minAmount, rule.maxAmount);
  }

  private static assertConsistent(input: CommissionRuleInput): void {
    const hasFixed = input.fixedAmount !== null && input.fixedAmount !== undefined;
    const hasPercent = input.percent !== null && input.percent !== undefined;

    if (input.method === CommissionMethod.FIXED && !hasFixed) {
      throw ApiError.badRequest('commission.invalidRule');
    }
    if (input.method === CommissionMethod.PERCENT && !hasPercent) {
      throw ApiError.badRequest('commission.invalidRule');
    }
    if (input.method === CommissionMethod.TIERED && !hasFixed && !hasPercent) {
      throw ApiError.badRequest('commission.invalidRule');
    }
  }

  private static toEntity(input: CommissionRuleInput): Partial<CommissionRule> {
    return {
      name: input.name,
      operation: input.operation,
      currencyId: input.currencyId ?? null,
      method: input.method,
      fixedAmount: input.fixedAmount ? money(input.fixedAmount).toString() : null,
      percent: input.percent ? money(input.percent).toString() : null,
      minAmount: input.minAmount ? money(input.minAmount).toString() : null,
      maxAmount: input.maxAmount ? money(input.maxAmount).toString() : null,
      fromAmount: input.fromAmount ? money(input.fromAmount).toString() : null,
      toAmount: input.toAmount ? money(input.toAmount).toString() : null,
      priority: input.priority ?? 0,
      isActive: input.isActive ?? true,
    };
  }
}
