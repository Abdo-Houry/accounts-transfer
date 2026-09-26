import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { ACCOUNT_CODES, correspondentAccountCode } from '../config/accounts';
import { Account } from '../entities/account.entity';
import { Correspondent } from '../entities/correspondent.entity';
import { LedgerEntry } from '../entities/ledger-entry.entity';
import { AccountType, CorrespondentStatus, EntryDirection } from '../types/enums';
import type { Paginated, RequestContext } from '../types/common';
import { ApiError } from '../utils/api-error';
import { money } from '../utils/money';
import { normalizePagination, paginate } from '../utils/pagination';
import { AUDIT_ACTIONS, AuditService } from './audit.service';
import { LedgerService } from './ledger.service';

export interface CreateCorrespondentInput {
  code: string;
  nameAr: string;
  nameEn: string;
  nameTr: string;
  country?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  contactPerson?: string | null;
  notes?: string | null;
}

export type UpdateCorrespondentInput = Partial<Omit<CreateCorrespondentInput, 'code'>>;

export interface CorrespondentListQuery {
  page?: number;
  limit?: number;
  q?: string;
  status?: CorrespondentStatus;
}

/** One currency's standing between this office and a partner. */
export interface CorrespondentPositionRow {
  currencyId: string;
  currencyCode: string;
  decimalPlaces: number;
  debit: string;
  credit: string;
  /**
   * Signed, from this office's point of view:
   * positive = the partner holds funds for us (they owe us),
   * negative = we owe the partner for payouts they have made.
   */
  balance: string;
}

export interface CorrespondentPosition {
  correspondent: Correspondent;
  rows: CorrespondentPositionRow[];
}

/** A statement line: one ledger movement plus the balance it left behind. */
export interface StatementLine {
  entryId: string;
  occurredAt: Date;
  referenceNo: string;
  description: string;
  descriptionKey: string | null;
  descriptionParams: Record<string, string | number> | null;
  currencyId: string;
  currencyCode: string;
  decimalPlaces: number;
  debit: string;
  credit: string;
  /** Running balance in that currency, oldest line first. */
  balance: string;
}

/**
 * Partner offices and their current accounts.
 *
 * The balance of a correspondent is the balance of their own `1300-<CODE>`
 * account and nothing else. That is the difference from the way customer
 * balances were being derived: summing every entry that merely *mentions* the
 * party sweeps in the cash leg of the same journal entry, and the two cancel.
 */
export class CorrespondentService {
  // ------------------------------------------------------------------ reads

  static async findByIdOrThrow(manager: EntityManager, id: string): Promise<Correspondent> {
    const correspondent = await manager
      .getRepository(Correspondent)
      .findOne({ where: { id }, relations: { account: true } });
    if (!correspondent) throw ApiError.notFound('correspondent.notFound');
    return correspondent;
  }

  /** Refuses a suspended partner - used by every path that would post to them. */
  static async requireActive(manager: EntityManager, id: string): Promise<Correspondent> {
    const correspondent = await CorrespondentService.findByIdOrThrow(manager, id);
    if (correspondent.status !== CorrespondentStatus.ACTIVE) {
      throw ApiError.conflict('correspondent.suspended', { name: correspondent.nameAr });
    }
    return correspondent;
  }

  static async list(query: CorrespondentListQuery): Promise<Paginated<Correspondent>> {
    const { page, limit, skip, take } = normalizePagination(query);
    const builder = AppDataSource.getRepository(Correspondent)
      .createQueryBuilder('correspondent')
      .leftJoinAndSelect('correspondent.account', 'account')
      .orderBy('correspondent.code', 'ASC')
      .skip(skip)
      .take(take);

    if (query.status) builder.andWhere('correspondent.status = :status', { status: query.status });
    if (query.q) {
      builder.andWhere(
        '(correspondent.code ILIKE :q OR correspondent.name_ar ILIKE :q OR correspondent.name_en ILIKE :q OR correspondent.name_tr ILIKE :q)',
        { q: `%${query.q}%` },
      );
    }

    const [items, total] = await builder.getManyAndCount();
    return paginate(items, page, limit, total);
  }

  // -------------------------------------------------------------- mutations

  /**
   * Creates the partner together with its `1300-<CODE>` current account, in one
   * transaction: without the account no leg could ever be posted to them.
   */
  static async create(
    context: RequestContext,
    input: CreateCorrespondentInput,
  ): Promise<Correspondent> {
    return AppDataSource.transaction(async (manager) => {
      const code = input.code.trim().toUpperCase();
      const existing = await manager.getRepository(Correspondent).findOne({ where: { code } });
      if (existing) throw ApiError.conflict('correspondent.codeTaken', { code });

      const parentId = await LedgerService.resolveAccountId(
        manager,
        ACCOUNT_CODES.CORRESPONDENT_CURRENT,
      );
      const account = manager.create(Account, {
        code: correspondentAccountCode(code),
        nameAr: `جاري - ${input.nameAr}`,
        nameEn: `Current - ${input.nameEn}`,
        nameTr: `Cari - ${input.nameTr}`,
        type: AccountType.ASSET,
        normalBalance: EntryDirection.DEBIT,
        parentId,
        isSystem: true,
        isActive: true,
      });
      await manager.save(Account, account);
      LedgerService.clearAccountCache();

      const correspondent = manager.create(Correspondent, {
        code,
        nameAr: input.nameAr,
        nameEn: input.nameEn,
        nameTr: input.nameTr,
        country: input.country ?? null,
        city: input.city ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        contactPerson: input.contactPerson ?? null,
        notes: input.notes ?? null,
        status: CorrespondentStatus.ACTIVE,
        accountId: account.id,
        createdById: context.userId,
      });
      await manager.save(Correspondent, correspondent);

      await AuditService.recordInTransaction(manager, AuditService.actorFromContext(context), {
        action: AUDIT_ACTIONS.CORRESPONDENT_CREATED,
        entityType: 'correspondent',
        entityId: correspondent.id,
        after: { code, nameEn: input.nameEn, account: account.code },
        description: `Correspondent ${code} created`,
        descriptionKey: 'audit.desc.correspondentCreated',
        descriptionParams: { code },
      });

      return CorrespondentService.findByIdOrThrow(manager, correspondent.id);
    });
  }

  static async update(
    context: RequestContext,
    id: string,
    input: UpdateCorrespondentInput,
  ): Promise<Correspondent> {
    return AppDataSource.transaction(async (manager) => {
      const correspondent = await CorrespondentService.findByIdOrThrow(manager, id);
      const before = { ...correspondent };

      Object.assign(correspondent, {
        nameAr: input.nameAr ?? correspondent.nameAr,
        nameEn: input.nameEn ?? correspondent.nameEn,
        nameTr: input.nameTr ?? correspondent.nameTr,
        country: input.country ?? correspondent.country,
        city: input.city ?? correspondent.city,
        phone: input.phone ?? correspondent.phone,
        email: input.email ?? correspondent.email,
        contactPerson: input.contactPerson ?? correspondent.contactPerson,
        notes: input.notes ?? correspondent.notes,
      });
      await manager.save(Correspondent, correspondent);

      await AuditService.recordInTransaction(manager, AuditService.actorFromContext(context), {
        action: AUDIT_ACTIONS.CORRESPONDENT_UPDATED,
        entityType: 'correspondent',
        entityId: correspondent.id,
        before,
        after: { ...correspondent },
        description: `Correspondent ${correspondent.code} updated`,
        descriptionKey: 'audit.desc.correspondentUpdated',
        descriptionParams: { code: correspondent.code },
      });

      return correspondent;
    });
  }

  static async setStatus(
    context: RequestContext,
    id: string,
    status: CorrespondentStatus,
  ): Promise<Correspondent> {
    return AppDataSource.transaction(async (manager) => {
      const correspondent = await CorrespondentService.findByIdOrThrow(manager, id);
      correspondent.status = status;
      await manager.save(Correspondent, correspondent);

      await AuditService.recordInTransaction(manager, AuditService.actorFromContext(context), {
        action: AUDIT_ACTIONS.CORRESPONDENT_STATUS,
        entityType: 'correspondent',
        entityId: correspondent.id,
        after: { status },
        description: `Correspondent ${correspondent.code} status -> ${status}`,
        descriptionKey: 'audit.desc.correspondentStatus',
        descriptionParams: { code: correspondent.code, status },
      });

      return correspondent;
    });
  }

  // ------------------------------------------------------------- positions

  /**
   * Every partner's standing, per currency.
   *
   * Read straight off their own account, so it cannot drift from the ledger.
   */
  static async positions(correspondentId?: string): Promise<CorrespondentPosition[]> {
    const correspondents = await AppDataSource.getRepository(Correspondent).find({
      where: correspondentId ? { id: correspondentId } : {},
      relations: { account: true },
      order: { code: 'ASC' },
    });
    if (correspondents.length === 0) return [];

    const rows: Array<{
      correspondent_id: string;
      currency_id: string;
      code: string;
      decimal_places: number;
      debit: string;
      credit: string;
    }> = await AppDataSource.query(
      `SELECT e.correspondent_id,
              e.currency_id,
              c.code,
              c.decimal_places,
              COALESCE(SUM(CASE WHEN e.direction = 'DEBIT'  THEN e.amount ELSE 0 END), 0)::text AS debit,
              COALESCE(SUM(CASE WHEN e.direction = 'CREDIT' THEN e.amount ELSE 0 END), 0)::text AS credit
         FROM ledger_entries e
         JOIN currencies c ON c.id = e.currency_id
        WHERE e.correspondent_id = ANY($1::uuid[])
        GROUP BY e.correspondent_id, e.currency_id, c.code, c.decimal_places
        ORDER BY c.code`,
      [correspondents.map((one) => one.id)],
    );

    return correspondents.map((correspondent) => ({
      correspondent,
      rows: rows
        .filter((row) => row.correspondent_id === correspondent.id)
        .map((row) => ({
          currencyId: row.currency_id,
          currencyCode: row.code,
          decimalPlaces: row.decimal_places,
          debit: money(row.debit).toString(),
          credit: money(row.credit).toString(),
          balance: money(row.debit).sub(money(row.credit)).toString(),
        })),
    }));
  }

  /**
   * Statement of one partner's current account, oldest first with a running
   * balance kept per currency - the shape an office reconciles against.
   */
  static async statement(
    id: string,
    options: { currencyId?: string; from?: Date; to?: Date; limit?: number } = {},
  ): Promise<StatementLine[]> {
    await CorrespondentService.findByIdOrThrow(AppDataSource.manager, id);

    const builder = AppDataSource.getRepository(LedgerEntry)
      .createQueryBuilder('entry')
      .innerJoinAndSelect('entry.transaction', 'transaction')
      .innerJoinAndSelect('entry.currency', 'currency')
      .where('entry.correspondent_id = :id', { id })
      .orderBy('transaction.occurredAt', 'ASC')
      .addOrderBy('entry.lineNo', 'ASC')
      .take(options.limit ?? 500);

    if (options.currencyId) {
      builder.andWhere('entry.currency_id = :currencyId', { currencyId: options.currencyId });
    }
    if (options.from) builder.andWhere('transaction.occurred_at >= :from', { from: options.from });
    if (options.to) builder.andWhere('transaction.occurred_at <= :to', { to: options.to });

    return runningBalance(await builder.getMany());
  }
}

/**
 * Turns raw ledger lines into a statement.
 *
 * The balance runs per currency: a statement that mixed USD and TRY into one
 * column would be arithmetic on incompatible units, which is the whole reason
 * the ledger balances each currency separately in the first place.
 */
export function runningBalance(
  entries: LedgerEntry[],
  /**
   * Which side increases the balance. A correspondent current account is an
   * asset, so a debit raises it; a customer account is a liability of the
   * office, so a credit does. Getting this backwards would show every customer
   * balance with the wrong sign.
   */
  increasesOn: 'DEBIT' | 'CREDIT' = 'DEBIT',
): StatementLine[] {
  const balances = new Map<string, ReturnType<typeof money>>();

  return entries.map((entry) => {
    const isDebit = entry.direction === EntryDirection.DEBIT;
    const raises = increasesOn === 'DEBIT' ? isDebit : !isDebit;
    const amount = money(entry.amount);
    const previous = balances.get(entry.currencyId) ?? money('0');
    const next = raises ? previous.add(amount) : previous.sub(amount);
    balances.set(entry.currencyId, next);

    return {
      entryId: entry.id,
      occurredAt: entry.transaction.occurredAt,
      referenceNo: entry.transaction.referenceNo,
      description: entry.description,
      descriptionKey: entry.descriptionKey ?? null,
      descriptionParams: entry.descriptionParams ?? null,
      currencyId: entry.currencyId,
      currencyCode: entry.currency.code,
      decimalPlaces: entry.currency.decimalPlaces,
      debit: isDebit ? amount.toString() : '0',
      credit: isDebit ? '0' : amount.toString(),
      balance: next.toString(),
    };
  });
}
