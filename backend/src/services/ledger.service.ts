import type { EntityManager } from 'typeorm';
import { Account } from '../entities/account.entity';
import { CashBox } from '../entities/cash-box.entity';
import { CashBoxBalance } from '../entities/cash-box-balance.entity';
import { Currency } from '../entities/currency.entity';
import { ExchangeRate } from '../entities/exchange-rate.entity';
import { FinancialTransaction } from '../entities/financial-transaction.entity';
import { LedgerEntry } from '../entities/ledger-entry.entity';
import { EntryDirection, TransactionType } from '../types/enums';
import type { RequestContext } from '../types/common';
import type { PostingLine, PostingRequest } from '../models/ledger.model';
import { ApiError } from '../utils/api-error';
import { logger } from '../utils/logger';
import { Money, money } from '../utils/money';
import { nextDocumentNumber } from '../utils/sequence';

/**
 * The posting engine.
 *
 * Every rial, lira and dollar that moves in this system moves through
 * `LedgerService.post()`. Centralising it here is what makes the three
 * invariants in docs/01-architecture.md structural rather than aspirational:
 *
 *  - I1 balance: `post()` refuses an entry whose debits and credits differ in
 *    any single currency.
 *  - I2 cash box balances: `post()` is the *only* writer of
 *    `cash_box_balances`, and it derives every delta from the lines it is about
 *    to insert, under a row lock, in the caller's transaction.
 *  - I3 append-only: there is no update or delete path. `reverse()` writes a
 *    mirrored entry instead.
 *
 * A service that forgets to check a balance therefore still cannot overdraw a
 * cash box, and a service that builds a lopsided entry cannot commit it.
 */
export class LedgerService {
  /**
   * `code -> account id`. The chart of accounts is seeded and only grows when a
   * cash box is created, so a process-wide cache is safe as long as that path
   * invalidates it.
   */
  private static accountIdByCode = new Map<string, string>();

  static clearAccountCache(): void {
    LedgerService.accountIdByCode.clear();
  }

  // --------------------------------------------------------------- accounts

  static async resolveAccountId(manager: EntityManager, code: string): Promise<string> {
    const cached = LedgerService.accountIdByCode.get(code);
    if (cached) return cached;

    const account = await manager.getRepository(Account).findOne({
      where: { code },
      select: { id: true, code: true },
    });
    if (!account) throw ApiError.notFound('ledger.accountNotFound', { code });

    LedgerService.accountIdByCode.set(code, account.id);
    return account.id;
  }

  // ---------------------------------------------------------------- posting

  /**
   * Writes one balanced journal entry and applies its cash effect.
   *
   * MUST be called inside a transaction (`manager` comes from
   * `dataSource.transaction(...)`). Throwing here rolls back the caller's whole
   * operation, which is exactly the intended behaviour.
   */
  static async post(
    manager: EntityManager,
    context: RequestContext,
    request: PostingRequest,
  ): Promise<FinancialTransaction> {
    if (!request.lines || request.lines.length === 0) {
      throw ApiError.badRequest('ledger.emptyTransaction');
    }

    const occurredAt = request.occurredAt ?? new Date();
    const resolved = await LedgerService.resolveLines(manager, request.lines);

    LedgerService.assertBalanced(resolved);

    // Cash first: if the box cannot cover it, nothing else should be written.
    await LedgerService.applyCashEffect(manager, resolved);

    const transaction = manager.create(FinancialTransaction, {
      referenceNo: await nextDocumentNumber(manager, 'transaction', 'FTX', occurredAt),
      type: request.type,
      sourceType: request.sourceType,
      sourceId: request.sourceId ?? null,
      description: request.description,
      descriptionKey: request.descriptionKey ?? null,
      descriptionParams: request.descriptionParams ?? null,
      occurredAt,
      reversesTransactionId: request.reversesTransactionId ?? null,
      isReversed: false,
      createdById: context.userId,
    });
    await manager.save(FinancialTransaction, transaction);

    const valuation = await LedgerService.baseValuationMap(
      manager,
      resolved.map((line) => line.currencyId),
    );

    const entries = resolved.map((line, index) => {
      const rate = valuation.get(line.currencyId) ?? '0';
      return manager.create(LedgerEntry, {
        transactionId: transaction.id,
        lineNo: index + 1,
        accountId: line.accountId,
        cashBoxId: line.cashBoxId ?? null,
        customerId: line.customerId ?? null,
        correspondentId: line.correspondentId ?? null,
        currencyId: line.currencyId,
        direction: line.direction,
        amount: money(line.amount).toString(),
        baseRate: rate,
        baseAmount: money(line.amount).mul(rate).toString(),
        description: line.description ?? request.description,
        // A line without its own key inherits the entry's, so every row in the
        // journal renders in the reader's language rather than only the header.
        descriptionKey: line.descriptionKey ?? (line.description ? null : request.descriptionKey ?? null),
        descriptionParams:
          line.descriptionKey ? line.descriptionParams ?? null
          : line.description ? null
          : request.descriptionParams ?? null,
      });
    });
    await manager.save(LedgerEntry, entries);

    transaction.entries = entries;
    return transaction;
  }

  /**
   * Posts the mirror image of an existing entry.
   * This is the only way to correct the books - see invariant I3.
   */
  static async reverse(
    manager: EntityManager,
    context: RequestContext,
    transactionId: string,
    type: TransactionType,
    description: string,
    occurredAt: Date = new Date(),
  ): Promise<FinancialTransaction> {
    const original = await manager.getRepository(FinancialTransaction).findOne({
      where: { id: transactionId },
      relations: { entries: true },
    });
    if (!original) throw ApiError.notFound('ledger.transactionNotFound');
    if (original.isReversed) throw ApiError.conflict('ledger.alreadyReversed');

    const lines: PostingLine[] = original.entries
      .sort((a, b) => a.lineNo - b.lineNo)
      .map((entry) => ({
        accountId: entry.accountId,
        cashBoxId: entry.cashBoxId,
        customerId: entry.customerId,
        currencyId: entry.currencyId,
        direction:
          entry.direction === EntryDirection.DEBIT ? EntryDirection.CREDIT : EntryDirection.DEBIT,
        amount: entry.amount,
        description: `Reversal of ${original.referenceNo}`,
        descriptionKey: 'desc.reversalOf',
        descriptionParams: { ref: original.referenceNo },
      }));

    const reversal = await LedgerService.post(manager, context, {
      type,
      sourceType: original.sourceType,
      sourceId: original.sourceId,
      description,
      occurredAt,
      reversesTransactionId: original.id,
      lines,
    });

    original.isReversed = true;
    await manager.save(FinancialTransaction, original);

    return reversal;
  }

  // ------------------------------------------------------------- internals

  private static async resolveLines(
    manager: EntityManager,
    lines: PostingLine[],
  ): Promise<Array<PostingLine & { accountId: string }>> {
    const resolved: Array<PostingLine & { accountId: string }> = [];

    for (const line of lines) {
      const amount = money(line.amount);
      if (!amount.isPositive()) {
        // A zero or negative line means the caller encoded the side wrongly.
        throw ApiError.internal('ledger.emptyTransaction');
      }

      const accountId =
        line.accountId ??
        (line.accountCode
          ? await LedgerService.resolveAccountId(manager, line.accountCode)
          : undefined);

      if (!accountId) throw ApiError.notFound('ledger.accountNotFound', { code: '-' });

      resolved.push({ ...line, accountId, amount: amount.toString() });
    }

    return resolved;
  }

  /** Invariant I1: debits equal credits within every currency of the entry. */
  private static assertBalanced(lines: Array<PostingLine & { accountId: string }>): void {
    const totals = new Map<string, { debit: Money; credit: Money }>();

    for (const line of lines) {
      const bucket = totals.get(line.currencyId) ?? { debit: Money.ZERO, credit: Money.ZERO };
      if (line.direction === EntryDirection.DEBIT) {
        bucket.debit = bucket.debit.add(line.amount);
      } else {
        bucket.credit = bucket.credit.add(line.amount);
      }
      totals.set(line.currencyId, bucket);
    }

    for (const [currencyId, bucket] of totals) {
      if (!bucket.debit.eq(bucket.credit)) {
        logger.error('Unbalanced journal entry rejected', {
          currencyId,
          debit: bucket.debit.toString(),
          credit: bucket.credit.toString(),
          lines,
        });
        throw ApiError.unbalanced({
          currency: currencyId,
          debit: bucket.debit.toTrimmed(),
          credit: bucket.credit.toTrimmed(),
        });
      }
    }
  }

  /**
   * Invariant I2. Nets the cash lines per (box, currency), locks exactly those
   * rows in a deterministic order, and refuses the whole entry if a box would
   * go negative without permission.
   */
  private static async applyCashEffect(
    manager: EntityManager,
    lines: Array<PostingLine & { accountId: string }>,
  ): Promise<void> {
    const deltas = new Map<string, { cashBoxId: string; currencyId: string; delta: Money }>();

    for (const line of lines) {
      if (!line.cashBoxId) continue;
      const key = `${line.cashBoxId}:${line.currencyId}`;
      const signed =
        line.direction === EntryDirection.DEBIT ? money(line.amount) : money(line.amount).negated();
      const current = deltas.get(key);
      deltas.set(key, {
        cashBoxId: line.cashBoxId,
        currencyId: line.currencyId,
        delta: current ? current.delta.add(signed) : signed,
      });
    }

    if (deltas.size === 0) return;

    // Deterministic lock order removes the classic two-box deadlock.
    const ordered = [...deltas.values()].sort((a, b) =>
      a.cashBoxId === b.cashBoxId
        ? a.currencyId.localeCompare(b.currencyId)
        : a.cashBoxId.localeCompare(b.cashBoxId),
    );

    for (const item of ordered) {
      if (item.delta.isZero()) continue;

      const balance = await LedgerService.lockBalance(manager, item.cashBoxId, item.currencyId);
      const next = money(balance.balance).add(item.delta);

      if (next.isNegative()) {
        const box = await manager
          .getRepository(CashBox)
          .findOne({ where: { id: item.cashBoxId }, select: { id: true, nameAr: true, nameEn: true, allowsNegative: true } });

        if (!box?.allowsNegative) {
          const currency = await manager
            .getRepository(Currency)
            .findOne({ where: { id: item.currencyId }, select: { id: true, code: true } });

          throw ApiError.insufficientFunds({
            cashBox: box?.nameAr ?? box?.nameEn ?? '-',
            currency: currency?.code ?? '-',
            available: money(balance.balance).toTrimmed(),
            required: item.delta.abs().toTrimmed(),
          });
        }
      }

      balance.balance = next.toString();
      balance.version += 1;
      await manager.save(CashBoxBalance, balance);
    }
  }

  /**
   * Loads a (box, currency) balance `FOR UPDATE`, creating the row on first use.
   * The insert races with concurrent first-use of the same pair, so a unique
   * violation is retried as a read.
   */
  private static async lockBalance(
    manager: EntityManager,
    cashBoxId: string,
    currencyId: string,
  ): Promise<CashBoxBalance> {
    const load = () =>
      manager
        .getRepository(CashBoxBalance)
        .createQueryBuilder('balance')
        .setLock('pessimistic_write')
        .where('balance.cash_box_id = :cashBoxId', { cashBoxId })
        .andWhere('balance.currency_id = :currencyId', { currencyId })
        .getOne();

    const existing = await load();
    if (existing) return existing;

    try {
      await manager
        .createQueryBuilder()
        .insert()
        .into(CashBoxBalance)
        .values({ cashBoxId, currencyId, balance: '0', version: 0 })
        .orIgnore()
        .execute();
    } catch {
      // Ignore: another transaction created it first; the reload below wins.
    }

    const created = await load();
    if (!created) throw ApiError.internal();
    return created;
  }

  /**
   * `currencyId -> rate to the base currency`, used to stamp `base_amount` on
   * each line for consolidated reporting.
   *
   * The buy rate is used deliberately: it is the rate at which the office could
   * liquidate the position, so consolidated figures stay conservative. A
   * currency with no published rate is stamped `0` - the per-currency figures
   * remain exact, only the consolidated total ignores it.
   */
  private static async baseValuationMap(
    manager: EntityManager,
    currencyIds: string[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(currencyIds)];
    const result = new Map<string, string>();
    if (unique.length === 0) return result;

    const currencies = await manager
      .getRepository(Currency)
      .createQueryBuilder('currency')
      .where('currency.id IN (:...ids)', { ids: unique })
      .getMany();

    const rates = await manager
      .getRepository(ExchangeRate)
      .createQueryBuilder('rate')
      .where('rate.currency_id IN (:...ids)', { ids: unique })
      .andWhere('rate.is_active = true')
      .getMany();

    const rateByCurrency = new Map(rates.map((rate) => [rate.currencyId, rate.buyRate]));

    for (const currency of currencies) {
      if (currency.isBase) {
        result.set(currency.id, '1');
        continue;
      }
      const rate = rateByCurrency.get(currency.id);
      if (rate) {
        result.set(currency.id, rate);
      } else {
        result.set(currency.id, '0');
        logger.warn('Ledger line valued at 0 in base currency: no active rate', {
          currency: currency.code,
        });
      }
    }

    return result;
  }
}
