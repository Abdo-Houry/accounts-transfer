import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { ACCOUNT_CODES, cashAccountCode } from '../config/accounts';
import { Account } from '../entities/account.entity';
import { CashBox } from '../entities/cash-box.entity';
import { CashBoxBalance } from '../entities/cash-box-balance.entity';
import { Currency } from '../entities/currency.entity';
import { LedgerEntry } from '../entities/ledger-entry.entity';
import {
  AccountType,
  CashBoxStatus,
  EntryDirection,
  TransactionType,
} from '../types/enums';
import type { Paginated, RequestContext } from '../types/common';
import { ApiError } from '../utils/api-error';
import { Money, money } from '../utils/money';
import { normalizePagination, paginate } from '../utils/pagination';
import { AuditService, AUDIT_ACTIONS } from './audit.service';
import { CurrencyService } from './currency.service';
import { LedgerService } from './ledger.service';

export interface CreateCashBoxInput {
  code: string;
  nameAr: string;
  nameEn: string;
  nameTr: string;
  branch?: string;
  description?: string;
  allowsNegative?: boolean;
}

export interface UpdateCashBoxInput {
  nameAr?: string;
  nameEn?: string;
  nameTr?: string;
  branch?: string;
  description?: string;
  allowsNegative?: boolean;
}

export interface OpeningBalanceInput {
  currencyId: string;
  amount: string;
  note?: string;
  occurredAt?: Date;
}

export interface CashBoxTransferInput {
  fromCashBoxId: string;
  toCashBoxId: string;
  currencyId: string;
  amount: string;
  note?: string;
}

export interface StatementQuery {
  page?: number;
  limit?: number;
  currencyId?: string;
  from?: Date;
  to?: Date;
  direction?: EntryDirection;
}

export interface ReconciliationRow {
  currencyId: string;
  currencyCode: string;
  recordedBalance: string;
  ledgerBalance: string;
  difference: string;
  matches: boolean;
}

export class CashBoxService {
  // ------------------------------------------------------------------ reads

  static async list(includeClosed = false): Promise<CashBox[]> {
    return AppDataSource.getRepository(CashBox).find({
      where: includeClosed ? {} : { status: CashBoxStatus.ACTIVE },
      order: { code: 'ASC' },
    });
  }

  static async findByIdOrThrow(
    manager: EntityManager,
    id: string,
    requireActive = false,
  ): Promise<CashBox> {
    const box = await manager.getRepository(CashBox).findOne({ where: { id } });
    if (!box) throw ApiError.notFound('cashbox.notFound');
    if (requireActive && box.status !== CashBoxStatus.ACTIVE) {
      throw ApiError.conflict('cashbox.inactive', { name: box.nameAr || box.nameEn });
    }
    return box;
  }

  static async balances(cashBoxId: string): Promise<CashBoxBalance[]> {
    return AppDataSource.getRepository(CashBoxBalance).find({
      where: { cashBoxId },
      relations: { currency: true },
      order: { currency: { sortOrder: 'ASC' } },
    });
  }

  /** Balances of every active box, used by the dashboard. */
  static async allBalances(): Promise<CashBoxBalance[]> {
    return AppDataSource.getRepository(CashBoxBalance)
      .createQueryBuilder('balance')
      .innerJoinAndSelect('balance.cashBox', 'cashBox')
      .innerJoinAndSelect('balance.currency', 'currency')
      .where('cashBox.status = :status', { status: CashBoxStatus.ACTIVE })
      .orderBy('cashBox.code', 'ASC')
      .addOrderBy('currency.sortOrder', 'ASC')
      .getMany();
  }

  // --------------------------------------------------------------- mutations

  /**
   * Creates the box together with its dedicated `1000-<CODE>` cash account.
   * Without that account no cash line could ever be posted for the box, so the
   * two are created in one transaction.
   */
  static async create(context: RequestContext, input: CreateCashBoxInput): Promise<CashBox> {
    return AppDataSource.transaction(async (manager) => {
      const code = input.code.trim().toUpperCase();
      const existing = await manager.getRepository(CashBox).findOne({ where: { code } });
      if (existing) throw ApiError.conflict('cashbox.codeTaken', { code });

      const box = manager.create(CashBox, {
        code,
        nameAr: input.nameAr,
        nameEn: input.nameEn,
        nameTr: input.nameTr,
        branch: input.branch ?? null,
        description: input.description ?? '',
        allowsNegative: input.allowsNegative ?? false,
        status: CashBoxStatus.ACTIVE,
      });
      await manager.save(CashBox, box);

      const parentId = await LedgerService.resolveAccountId(manager, ACCOUNT_CODES.CASH);
      const account = manager.create(Account, {
        code: cashAccountCode(code),
        nameAr: `نقدية - ${input.nameAr}`,
        nameEn: `Cash - ${input.nameEn}`,
        nameTr: `Kasa - ${input.nameTr}`,
        type: AccountType.ASSET,
        normalBalance: EntryDirection.DEBIT,
        parentId,
        cashBoxId: box.id,
        isSystem: true,
        isActive: true,
      });
      await manager.save(Account, account);
      LedgerService.clearAccountCache();

      await AuditService.recordInTransaction(manager, AuditService.actorFromContext(context), {
        action: AUDIT_ACTIONS.CASHBOX_CREATED,
        entityType: 'cash_box',
        entityId: box.id,
        after: { code, nameEn: input.nameEn },
        description: `Cash box ${code} created`,
        descriptionKey: 'audit.desc.cashBoxCreated',
        descriptionParams: { code },
      });

      return box;
    });
  }

  static async update(
    context: RequestContext,
    id: string,
    input: UpdateCashBoxInput,
  ): Promise<CashBox> {
    return AppDataSource.transaction(async (manager) => {
      const box = await CashBoxService.findByIdOrThrow(manager, id);
      const before = { ...box };

      Object.assign(box, {
        nameAr: input.nameAr ?? box.nameAr,
        nameEn: input.nameEn ?? box.nameEn,
        nameTr: input.nameTr ?? box.nameTr,
        branch: input.branch ?? box.branch,
        description: input.description ?? box.description,
        allowsNegative: input.allowsNegative ?? box.allowsNegative,
      });
      await manager.save(CashBox, box);

      await AuditService.recordInTransaction(manager, AuditService.actorFromContext(context), {
        action: AUDIT_ACTIONS.CASHBOX_UPDATED,
        entityType: 'cash_box',
        entityId: box.id,
        before,
        after: { ...box },
        description: `Cash box ${box.code} updated`,
        descriptionKey: 'audit.desc.cashBoxUpdated',
        descriptionParams: { code: box.code },
      });

      return box;
    });
  }

  /**
   * Records the money that was already in the box when the system went live.
   *
   * Posted as `DR cash / CR equity` so the opening figure is part of the ledger
   * like everything else - there is no back door that writes a balance directly.
   * Allowed once per (box, currency); later corrections go through a voucher or
   * an adjustment entry.
   */
  static async setOpeningBalance(
    context: RequestContext,
    cashBoxId: string,
    input: OpeningBalanceInput,
  ): Promise<{ cashBox: CashBox; currency: Currency; amount: string }> {
    return AppDataSource.transaction(async (manager) => {
      const box = await CashBoxService.findByIdOrThrow(manager, cashBoxId, true);
      const currency = await CurrencyService.requireActive(manager, input.currencyId);
      const amount = money(input.amount);
      if (!amount.isPositive()) throw ApiError.badRequest('voucher.amountPositive');

      const alreadyOpened = await manager
        .getRepository(LedgerEntry)
        .createQueryBuilder('entry')
        .innerJoin('entry.transaction', 'transaction')
        .where('entry.cash_box_id = :cashBoxId', { cashBoxId })
        .andWhere('entry.currency_id = :currencyId', { currencyId: currency.id })
        .andWhere('transaction.type = :type', { type: TransactionType.OPENING_BALANCE })
        .getExists();

      if (alreadyOpened) {
        throw ApiError.conflict('cashbox.openingBalanceExists', { currency: currency.code });
      }

      await LedgerService.post(manager, context, {
        type: TransactionType.OPENING_BALANCE,
        sourceType: 'cash_box',
        sourceId: box.id,
        description: input.note || `Opening balance for ${box.code}`,
        // A note typed by the operator is their own wording and is left alone;
        // only the generated fallback carries a key.
        descriptionKey: input.note ? undefined : 'desc.openingBalanceLine',
        descriptionParams: input.note ? undefined : { box: box.code },
        occurredAt: input.occurredAt ?? new Date(),
        lines: [
          {
            accountCode: cashAccountCode(box.code),
            cashBoxId: box.id,
            currencyId: currency.id,
            direction: EntryDirection.DEBIT,
            amount: amount.toString(),
          },
          {
            accountCode: ACCOUNT_CODES.EQUITY_OPENING,
            currencyId: currency.id,
            direction: EntryDirection.CREDIT,
            amount: amount.toString(),
          },
        ],
      });

      await AuditService.recordInTransaction(manager, AuditService.actorFromContext(context), {
        action: AUDIT_ACTIONS.CASHBOX_OPENING,
        entityType: 'cash_box',
        entityId: box.id,
        after: { currency: currency.code, amount: amount.toTrimmed() },
        description: `Opening balance ${amount.toTrimmed()} ${currency.code} for ${box.code}`,
        descriptionKey: 'desc.openingBalance',
        descriptionParams: { amount: amount.toTrimmed(), currency: currency.code, box: box.code },
      });

      return { cashBox: box, currency, amount: amount.toString() };
    });
  }

  /** Moves cash between two boxes in the same currency. */
  static async transferBetweenBoxes(
    context: RequestContext,
    input: CashBoxTransferInput,
  ): Promise<{ from: CashBox; to: CashBox; currency: Currency; amount: string }> {
    if (input.fromCashBoxId === input.toCashBoxId) throw ApiError.badRequest('cashbox.sameBox');

    return AppDataSource.transaction(async (manager) => {
      const from = await CashBoxService.findByIdOrThrow(manager, input.fromCashBoxId, true);
      const to = await CashBoxService.findByIdOrThrow(manager, input.toCashBoxId, true);
      const currency = await CurrencyService.requireActive(manager, input.currencyId);
      const amount = money(input.amount);
      if (!amount.isPositive()) throw ApiError.badRequest('voucher.amountPositive');

      await LedgerService.post(manager, context, {
        type: TransactionType.CASHBOX_TRANSFER,
        sourceType: 'cash_box',
        sourceId: from.id,
        description: input.note || `Cash transfer ${from.code} -> ${to.code}`,
        descriptionKey: input.note ? undefined : 'desc.cashTransferLine',
        descriptionParams: input.note ? undefined : { from: from.code, to: to.code },
        lines: [
          {
            accountCode: cashAccountCode(to.code),
            cashBoxId: to.id,
            currencyId: currency.id,
            direction: EntryDirection.DEBIT,
            amount: amount.toString(),
          },
          {
            accountCode: cashAccountCode(from.code),
            cashBoxId: from.id,
            currencyId: currency.id,
            direction: EntryDirection.CREDIT,
            amount: amount.toString(),
          },
        ],
      });

      await AuditService.recordInTransaction(manager, AuditService.actorFromContext(context), {
        action: AUDIT_ACTIONS.CASHBOX_TRANSFER,
        entityType: 'cash_box',
        entityId: from.id,
        after: {
          from: from.code,
          to: to.code,
          currency: currency.code,
          amount: amount.toTrimmed(),
        },
        description: `Transferred ${amount.toTrimmed()} ${currency.code} from ${from.code} to ${to.code}`,
        descriptionKey: 'desc.cashTransfer',
        descriptionParams: { amount: amount.toTrimmed(), currency: currency.code, from: from.code, to: to.code },
      });

      return { from, to, currency, amount: amount.toString() };
    });
  }

  /** A box may only be closed once every currency balance is exactly zero. */
  static async close(context: RequestContext, id: string): Promise<CashBox> {
    return AppDataSource.transaction(async (manager) => {
      const box = await CashBoxService.findByIdOrThrow(manager, id, true);

      const balances = await manager.getRepository(CashBoxBalance).find({
        where: { cashBoxId: box.id },
        relations: { currency: true },
      });

      const nonZero = balances.find((balance) => !money(balance.balance).isZero());
      if (nonZero) {
        throw ApiError.conflict('cashbox.notEmpty', {
          currency: nonZero.currency.code,
          balance: money(nonZero.balance).toTrimmed(),
        });
      }

      box.status = CashBoxStatus.CLOSED;
      box.closedAt = new Date();
      box.closedById = context.userId;
      await manager.save(CashBox, box);

      await AuditService.recordInTransaction(manager, AuditService.actorFromContext(context), {
        action: AUDIT_ACTIONS.CASHBOX_CLOSED,
        entityType: 'cash_box',
        entityId: box.id,
        description: `Cash box ${box.code} closed`,
        descriptionKey: 'audit.desc.cashBoxClosed',
        descriptionParams: { code: box.code },
      });

      return box;
    });
  }

  // ------------------------------------------------------- statement / audit

  /** Ledger movement of one box, newest first, with a running context. */
  static async statement(cashBoxId: string, query: StatementQuery): Promise<Paginated<LedgerEntry>> {
    const { page, limit, skip, take } = normalizePagination(query);

    const builder = AppDataSource.getRepository(LedgerEntry)
      .createQueryBuilder('entry')
      .innerJoinAndSelect('entry.transaction', 'transaction')
      .innerJoinAndSelect('entry.currency', 'currency')
      .leftJoinAndSelect('entry.account', 'account')
      .leftJoinAndSelect('entry.customer', 'customer')
      .leftJoinAndSelect('transaction.createdBy', 'user')
      .where('entry.cash_box_id = :cashBoxId', { cashBoxId })
      .orderBy('transaction.occurredAt', 'DESC')
      .addOrderBy('entry.lineNo', 'ASC')
      .skip(skip)
      .take(take);

    if (query.currencyId) builder.andWhere('entry.currency_id = :currencyId', { currencyId: query.currencyId });
    if (query.direction) builder.andWhere('entry.direction = :direction', { direction: query.direction });
    if (query.from) builder.andWhere('transaction.occurred_at >= :from', { from: query.from });
    if (query.to) builder.andWhere('transaction.occurred_at <= :to', { to: query.to });

    const [items, total] = await builder.getManyAndCount();
    return paginate(items, page, limit, total);
  }

  /**
   * Proves invariant I2: the cached `cash_box_balances` row must equal the sum
   * of the ledger for the same (box, currency). A mismatch means something
   * bypassed `LedgerService.post` and is worth investigating immediately.
   */
  static async reconcile(cashBoxId: string): Promise<ReconciliationRow[]> {
    const ledgerRows: Array<{ currency_id: string; code: string; ledger_balance: string }> =
      await AppDataSource.query(
        `SELECT e.currency_id,
                c.code,
                COALESCE(SUM(CASE WHEN e.direction = 'DEBIT' THEN e.amount ELSE -e.amount END), 0)::text AS ledger_balance
           FROM ledger_entries e
           JOIN currencies c ON c.id = e.currency_id
          WHERE e.cash_box_id = $1
          GROUP BY e.currency_id, c.code`,
        [cashBoxId],
      );

    const recorded = await AppDataSource.getRepository(CashBoxBalance).find({
      where: { cashBoxId },
      relations: { currency: true },
    });

    const byCurrency = new Map<string, ReconciliationRow>();

    for (const row of ledgerRows) {
      byCurrency.set(row.currency_id, {
        currencyId: row.currency_id,
        currencyCode: row.code,
        recordedBalance: '0',
        ledgerBalance: money(row.ledger_balance).toString(),
        difference: '0',
        matches: false,
      });
    }

    for (const balance of recorded) {
      const existing = byCurrency.get(balance.currencyId);
      if (existing) {
        existing.recordedBalance = money(balance.balance).toString();
      } else {
        byCurrency.set(balance.currencyId, {
          currencyId: balance.currencyId,
          currencyCode: balance.currency.code,
          recordedBalance: money(balance.balance).toString(),
          ledgerBalance: '0',
          difference: '0',
          matches: false,
        });
      }
    }

    return [...byCurrency.values()].map((row) => {
      const difference = money(row.recordedBalance).sub(row.ledgerBalance);
      return { ...row, difference: difference.toString(), matches: difference.isZero() };
    });
  }

  /** Sum of a box across currencies, valued in the base currency. */
  static totalInBase(balances: CashBoxBalance[], rates: Map<string, string>): Money {
    return balances.reduce<Money>(
      (total, balance) => total.add(money(balance.balance).mul(rates.get(balance.currencyId) ?? '0')),
      Money.ZERO,
    );
  }
}
