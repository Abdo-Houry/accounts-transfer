import { AppDataSource } from '../config/data-source';
import { Account } from '../entities/account.entity';
import { FinancialTransaction } from '../entities/financial-transaction.entity';
import { LedgerEntry } from '../entities/ledger-entry.entity';
import { EntryDirection, TransactionType } from '../types/enums';
import type { Paginated, RequestContext } from '../types/common';
import type { AccountBalanceRow, PostingLine } from '../models/ledger.model';
import { ApiError } from '../utils/api-error';
import { money } from '../utils/money';
import { normalizePagination, paginate } from '../utils/pagination';
import { AuditService, AUDIT_ACTIONS } from './audit.service';
import { LedgerService } from './ledger.service';

export interface TransactionListQuery {
  page?: number;
  limit?: number;
  type?: TransactionType;
  sourceType?: string;
  sourceId?: string;
  createdById?: string;
  referenceNo?: string;
  from?: Date;
  to?: Date;
}

export interface EntryListQuery {
  page?: number;
  limit?: number;
  accountId?: string;
  cashBoxId?: string;
  customerId?: string;
  currencyId?: string;
  direction?: EntryDirection;
  from?: Date;
  to?: Date;
}

export interface AdjustmentInput {
  description: string;
  occurredAt?: Date;
  lines: PostingLine[];
}

export class LedgerQueryService {
  static async transactions(query: TransactionListQuery): Promise<Paginated<FinancialTransaction>> {
    const { page, limit, skip, take } = normalizePagination(query);

    const builder = AppDataSource.getRepository(FinancialTransaction)
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.createdBy', 'user')
      .orderBy('transaction.occurredAt', 'DESC')
      .addOrderBy('transaction.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (query.type) builder.andWhere('transaction.type = :type', { type: query.type });
    if (query.sourceType) builder.andWhere('transaction.source_type = :sourceType', { sourceType: query.sourceType });
    if (query.sourceId) builder.andWhere('transaction.source_id = :sourceId', { sourceId: query.sourceId });
    if (query.createdById) builder.andWhere('transaction.created_by = :createdById', { createdById: query.createdById });
    if (query.referenceNo) {
      builder.andWhere('transaction.reference_no ILIKE :referenceNo', {
        referenceNo: `%${query.referenceNo}%`,
      });
    }
    if (query.from) builder.andWhere('transaction.occurred_at >= :from', { from: query.from });
    if (query.to) builder.andWhere('transaction.occurred_at <= :to', { to: query.to });

    const [items, total] = await builder.getManyAndCount();
    return paginate(items, page, limit, total);
  }

  static async transactionDetail(
    id: string,
    // Write paths pass their own manager: a plain `AppDataSource` repository is
    // a different connection and cannot see an entry the open transaction has
    // not committed yet.
    manager: import('typeorm').EntityManager = AppDataSource.manager,
  ): Promise<FinancialTransaction> {
    const transaction = await manager.getRepository(FinancialTransaction).findOne({
      where: { id },
      relations: {
        createdBy: true,
        entries: { account: true, currency: true, cashBox: true, customer: true },
      },
    });
    if (!transaction) throw ApiError.notFound('ledger.transactionNotFound');
    transaction.entries.sort((a, b) => a.lineNo - b.lineNo);
    return transaction;
  }

  static async entries(query: EntryListQuery): Promise<Paginated<LedgerEntry>> {
    const { page, limit, skip, take } = normalizePagination(query);

    const builder = AppDataSource.getRepository(LedgerEntry)
      .createQueryBuilder('entry')
      .innerJoinAndSelect('entry.transaction', 'transaction')
      .innerJoinAndSelect('entry.currency', 'currency')
      .innerJoinAndSelect('entry.account', 'account')
      .leftJoinAndSelect('entry.cashBox', 'cashBox')
      .leftJoinAndSelect('entry.customer', 'customer')
      .orderBy('transaction.occurredAt', 'DESC')
      .addOrderBy('entry.lineNo', 'ASC')
      .skip(skip)
      .take(take);

    if (query.accountId) builder.andWhere('entry.account_id = :accountId', { accountId: query.accountId });
    if (query.cashBoxId) builder.andWhere('entry.cash_box_id = :cashBoxId', { cashBoxId: query.cashBoxId });
    if (query.customerId) builder.andWhere('entry.customer_id = :customerId', { customerId: query.customerId });
    if (query.currencyId) builder.andWhere('entry.currency_id = :currencyId', { currencyId: query.currencyId });
    if (query.direction) builder.andWhere('entry.direction = :direction', { direction: query.direction });
    if (query.from) builder.andWhere('transaction.occurred_at >= :from', { from: query.from });
    if (query.to) builder.andWhere('transaction.occurred_at <= :to', { to: query.to });

    const [items, total] = await builder.getManyAndCount();
    return paginate(items, page, limit, total);
  }

  static async chartOfAccounts(): Promise<Account[]> {
    return AppDataSource.getRepository(Account).find({ order: { code: 'ASC' } });
  }

  /**
   * Trial balance per account **per currency**.
   *
   * A multi-currency book does not have one meaningful grand total, so the
   * report is grouped by currency and each currency column must add up to zero
   * on its own - which is the same invariant `LedgerService.post` enforces on
   * every single entry.
   */
  static async trialBalance(asOf?: Date, currencyId?: string): Promise<AccountBalanceRow[]> {
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (asOf) {
      params.push(asOf);
      conditions.push(`t.occurred_at <= $${params.length}`);
    }
    if (currencyId) {
      params.push(currencyId);
      conditions.push(`e.currency_id = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows: Array<{
      account_id: string;
      code: string;
      name_ar: string;
      name_en: string;
      name_tr: string;
      currency_id: string;
      currency_code: string;
      debit: string;
      credit: string;
    }> = await AppDataSource.query(
      `SELECT a.id   AS account_id,
              a.code,
              a.name_ar,
              a.name_en,
              a.name_tr,
              c.id   AS currency_id,
              c.code AS currency_code,
              COALESCE(SUM(CASE WHEN e.direction = 'DEBIT'  THEN e.amount ELSE 0 END), 0)::text AS debit,
              COALESCE(SUM(CASE WHEN e.direction = 'CREDIT' THEN e.amount ELSE 0 END), 0)::text AS credit
         FROM ledger_entries e
         JOIN financial_transactions t ON t.id = e.transaction_id
         JOIN accounts   a ON a.id = e.account_id
         JOIN currencies c ON c.id = e.currency_id
         ${where}
        GROUP BY a.id, a.code, a.name_ar, a.name_en, a.name_tr, c.id, c.code
        ORDER BY c.code, a.code`,
      params,
    );

    return rows.map((row) => ({
      accountId: row.account_id,
      accountCode: row.code,
      accountNameAr: row.name_ar,
      accountNameEn: row.name_en,
      accountNameTr: row.name_tr,
      currencyId: row.currency_id,
      currencyCode: row.currency_code,
      debit: money(row.debit).toString(),
      credit: money(row.credit).toString(),
      balance: money(row.debit).sub(row.credit).toString(),
    }));
  }

  /**
   * Manual journal entry, for corrections that no operation screen covers.
   *
   * It goes through the same `LedgerService.post`, so it is subject to the same
   * balance check and the same cash-box guard as every automatic entry - an
   * administrator can record a correction, not conjure cash.
   */
  static async postAdjustment(
    context: RequestContext,
    input: AdjustmentInput,
  ): Promise<FinancialTransaction> {
    return AppDataSource.transaction(async (manager) => {
      const transaction = await LedgerService.post(manager, context, {
        type: TransactionType.ADJUSTMENT,
        sourceType: 'adjustment',
        sourceId: null,
        description: input.description,
        occurredAt: input.occurredAt ?? new Date(),
        lines: input.lines,
      });

      await AuditService.recordInTransaction(manager, AuditService.actorFromContext(context), {
        action: AUDIT_ACTIONS.LEDGER_ADJUSTMENT,
        entityType: 'financial_transaction',
        entityId: transaction.id,
        after: { referenceNo: transaction.referenceNo, lines: input.lines },
        description: `Adjustment ${transaction.referenceNo}: ${input.description}`,
        descriptionKey: 'desc.adjustment',
        descriptionParams: { ref: transaction.referenceNo, text: input.description },
      });

      return LedgerQueryService.transactionDetail(transaction.id, manager);
    });
  }
}
