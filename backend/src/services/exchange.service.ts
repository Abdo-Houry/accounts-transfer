import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { ACCOUNT_CODES, cashAccountCode } from '../config/accounts';
import { Currency } from '../entities/currency.entity';
import { CurrencyExchange } from '../entities/currency-exchange.entity';
import {
  CommissionOperation,
  EntryDirection,
  ExchangeStatus,
  ExchangeType,
  TransactionType,
} from '../types/enums';
import type { Paginated, RequestContext } from '../types/common';
import type { PostingLine } from '../models/ledger.model';
import { ApiError } from '../utils/api-error';
import { Money, money } from '../utils/money';
import { normalizePagination, paginate, safeSort, safeSortOrder } from '../utils/pagination';
import { nextDocumentNumber } from '../utils/sequence';
import { AuditService, AUDIT_ACTIONS } from './audit.service';
import { CashBoxService } from './cash-box.service';
import { CommissionService } from './commission.service';
import { CurrencyService } from './currency.service';
import { CustomerService } from './customer.service';
import { LedgerService } from './ledger.service';

export interface ExchangeQuoteInput {
  /** What the office receives from the customer. */
  fromCurrencyId: string;
  fromAmount: string;
  /** What the office pays out to the customer. */
  toCurrencyId: string;
  /** Override the published cross rate (requires the same permission). */
  rate?: string | null;
  /** Omit to let the commission rules decide. Charged in the payout currency. */
  commissionAmount?: string | null;
}

export interface CreateExchangeInput extends ExchangeQuoteInput {
  cashBoxId: string;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  notes?: string | null;
}

export interface ExchangeQuote {
  type: ExchangeType;
  fromCurrencyCode: string;
  fromAmount: string;
  toCurrencyCode: string;
  /** Gross before the fee. */
  grossToAmount: string;
  commissionAmount: string;
  /** What the customer actually walks away with. */
  toAmount: string;
  rate: string;
  buyRateUsed: string;
  sellRateUsed: string;
}

export interface ExchangeListQuery {
  page?: number;
  limit?: number;
  q?: string;
  type?: ExchangeType;
  status?: ExchangeStatus;
  currencyId?: string;
  cashBoxId?: string;
  customerId?: string;
  createdById?: string;
  from?: Date;
  to?: Date;
  sortBy?: string;
  sortOrder?: string;
}

interface PricedExchange {
  type: ExchangeType;
  fromCurrency: Currency;
  toCurrency: Currency;
  fromAmount: Money;
  grossToAmount: Money;
  commission: Money;
  toAmount: Money;
  rate: Money;
  buyRateUsed: string;
  sellRateUsed: string;
  rateSourceId: string | null;
}

const SORTABLE = ['createdAt', 'fromAmount', 'exchangeNo'] as const;

export class ExchangeService {
  // ============================================================== pricing

  /**
   * Prices a deal through the published board.
   *
   * The office buys what it receives at the *buy* rate and sells what it pays
   * out at the *sell* rate; the gap between the two is the office margin. Any
   * fee is taken out of the payout leg, so the customer sees one net figure.
   */
  private static async price(
    manager: EntityManager,
    input: ExchangeQuoteInput,
  ): Promise<PricedExchange> {
    const fromCurrency = await CurrencyService.requireActive(manager, input.fromCurrencyId);
    const toCurrency = await CurrencyService.requireActive(manager, input.toCurrencyId);

    if (fromCurrency.id === toCurrency.id) throw ApiError.badRequest('currency.sameCurrency');

    const fromAmount = money(input.fromAmount);
    if (!fromAmount.isPositive()) throw ApiError.badRequest('exchange.amountPositive');

    const cross = await CurrencyService.resolveCrossRate(manager, fromCurrency, toCurrency);
    const rate = input.rate ? money(input.rate) : money(cross.rate);
    if (!rate.isPositive()) throw ApiError.badRequest('rate.invalid');

    const grossToAmount = CurrencyService.roundFor(toCurrency, fromAmount.mul(rate));

    let commission: Money;
    if (input.commissionAmount !== undefined && input.commissionAmount !== null) {
      commission = money(input.commissionAmount);
      if (commission.isNegative()) throw ApiError.badRequest('error.validation');
    } else {
      const resolved = await CommissionService.resolve(
        manager,
        CommissionOperation.EXCHANGE,
        toCurrency.id,
        grossToAmount,
      );
      commission = money(resolved.amount);
    }
    commission = CurrencyService.roundFor(toCurrency, commission);

    if (commission.gte(grossToAmount)) {
      throw ApiError.badRequest('transfer.commissionExceedsAmount', {
        commission: commission.toTrimmed(),
        amount: grossToAmount.toTrimmed(),
      });
    }

    // BUY / SELL is stated from the office point of view against the base
    // currency. A pure cross deal (neither leg is the base) is recorded as a
    // BUY of the incoming currency.
    const type = fromCurrency.isBase ? ExchangeType.SELL : ExchangeType.BUY;

    return {
      type,
      fromCurrency,
      toCurrency,
      fromAmount: CurrencyService.roundFor(fromCurrency, fromAmount),
      grossToAmount,
      commission,
      toAmount: CurrencyService.roundFor(toCurrency, grossToAmount.sub(commission)),
      rate,
      buyRateUsed: cross.fromBuyRate,
      sellRateUsed: cross.toSellRate,
      rateSourceId: cross.fromRateId ?? cross.toRateId,
    };
  }

  static async quote(input: ExchangeQuoteInput): Promise<ExchangeQuote> {
    const priced = await ExchangeService.price(AppDataSource.manager, input);
    return {
      type: priced.type,
      fromCurrencyCode: priced.fromCurrency.code,
      fromAmount: priced.fromAmount.toString(),
      toCurrencyCode: priced.toCurrency.code,
      grossToAmount: priced.grossToAmount.toString(),
      commissionAmount: priced.commission.toString(),
      toAmount: priced.toAmount.toString(),
      rate: priced.rate.toString(),
      buyRateUsed: priced.buyRateUsed,
      sellRateUsed: priced.sellRateUsed,
    };
  }

  // =============================================================== create

  /**
   * Books the deal.
   *
   * Ledger (docs/01-architecture.md sections 6.6 / 6.7) - one balanced book per
   * currency, joined by the FX position account:
   *
   *   incoming book  DR cash(from)      CR FX position(from)
   *   outgoing book  DR FX position(to) CR cash(to)  CR commission income
   *
   * The cash credit on the outgoing leg is what fails, inside the same
   * transaction, if the box cannot fund the payout.
   */
  static async create(
    context: RequestContext,
    input: CreateExchangeInput,
  ): Promise<CurrencyExchange> {
    return AppDataSource.transaction(async (manager) => {
      const cashBox = await CashBoxService.findByIdOrThrow(manager, input.cashBoxId, true);
      const priced = await ExchangeService.price(manager, input);

      if (input.customerId) await CustomerService.requireActive(manager, input.customerId);

      const exchange = manager.create(CurrencyExchange, {
        exchangeNo: await nextDocumentNumber(manager, 'exchange', 'EXC'),
        type: priced.type,
        customerId: input.customerId ?? null,
        customerName: input.customerName ?? null,
        customerPhone: input.customerPhone ?? null,
        fromCurrencyId: priced.fromCurrency.id,
        fromAmount: priced.fromAmount.toString(),
        toCurrencyId: priced.toCurrency.id,
        toAmount: priced.toAmount.toString(),
        rate: priced.rate.toString(),
        rateSourceId: priced.rateSourceId,
        commissionAmount: priced.commission.toString(),
        commissionCurrencyId: priced.commission.isPositive() ? priced.toCurrency.id : null,
        cashBoxId: cashBox.id,
        status: ExchangeStatus.COMPLETED,
        createdById: context.userId,
        notes: input.notes ?? null,
      });
      await manager.save(CurrencyExchange, exchange);

      const lines: PostingLine[] = [
        {
          accountCode: cashAccountCode(cashBox.code),
          cashBoxId: cashBox.id,
          customerId: exchange.customerId,
          currencyId: priced.fromCurrency.id,
          direction: EntryDirection.DEBIT,
          amount: priced.fromAmount.toString(),
          description: `Received ${priced.fromCurrency.code} on ${exchange.exchangeNo}`,
          descriptionKey: 'desc.exchangeReceived',
          descriptionParams: { currency: priced.fromCurrency.code, no: exchange.exchangeNo },
        },
        {
          accountCode: ACCOUNT_CODES.FX_POSITION,
          currencyId: priced.fromCurrency.id,
          direction: EntryDirection.CREDIT,
          amount: priced.fromAmount.toString(),
          description: `FX position ${priced.fromCurrency.code}`,
          descriptionKey: 'desc.fxPosition',
          descriptionParams: { currency: priced.fromCurrency.code },
        },
        {
          accountCode: ACCOUNT_CODES.FX_POSITION,
          currencyId: priced.toCurrency.id,
          direction: EntryDirection.DEBIT,
          amount: priced.grossToAmount.toString(),
          description: `FX position ${priced.toCurrency.code}`,
          descriptionKey: 'desc.fxPosition',
          descriptionParams: { currency: priced.toCurrency.code },
        },
        {
          accountCode: cashAccountCode(cashBox.code),
          cashBoxId: cashBox.id,
          customerId: exchange.customerId,
          currencyId: priced.toCurrency.id,
          direction: EntryDirection.CREDIT,
          amount: priced.toAmount.toString(),
          description: `Paid ${priced.toCurrency.code} on ${exchange.exchangeNo}`,
          descriptionKey: 'desc.exchangePaid',
          descriptionParams: { currency: priced.toCurrency.code, no: exchange.exchangeNo },
        },
      ];

      if (priced.commission.isPositive()) {
        lines.push({
          accountCode: ACCOUNT_CODES.COMMISSION_INCOME,
          currencyId: priced.toCurrency.id,
          direction: EntryDirection.CREDIT,
          amount: priced.commission.toString(),
          description: `Commission on ${exchange.exchangeNo}`,
          descriptionKey: 'desc.commissionOn',
          descriptionParams: { no: exchange.exchangeNo },
        });
      }

      const transaction = await LedgerService.post(manager, context, {
        type: TransactionType.EXCHANGE,
        sourceType: 'currency_exchange',
        sourceId: exchange.id,
        description: `Exchange ${exchange.exchangeNo}: ${priced.fromAmount.toTrimmed()} ${priced.fromCurrency.code} -> ${priced.toAmount.toTrimmed()} ${priced.toCurrency.code}`,
        descriptionKey: 'desc.exchange',
        descriptionParams: { no: exchange.exchangeNo, fromAmount: priced.fromAmount.toTrimmed(), fromCurrency: priced.fromCurrency.code, toAmount: priced.toAmount.toTrimmed(), toCurrency: priced.toCurrency.code },
        lines,
      });

      exchange.financialTransactionId = transaction.id;
      await manager.save(CurrencyExchange, exchange);

      await AuditService.recordInTransaction(manager, AuditService.actorFromContext(context), {
        action: AUDIT_ACTIONS.EXCHANGE_CREATED,
        entityType: 'currency_exchange',
        entityId: exchange.id,
        after: {
          exchangeNo: exchange.exchangeNo,
          type: priced.type,
          from: `${priced.fromAmount.toTrimmed()} ${priced.fromCurrency.code}`,
          to: `${priced.toAmount.toTrimmed()} ${priced.toCurrency.code}`,
          rate: priced.rate.toTrimmed(),
          cashBox: cashBox.code,
        },
        description: `Exchange ${exchange.exchangeNo} completed`,
        descriptionKey: 'audit.desc.exchangeCompleted',
        descriptionParams: { no: exchange.exchangeNo },
      });

      return ExchangeService.findByIdOrThrow(manager, exchange.id);
    });
  }

  /** Undoes a deal with a full reversing entry - the original row stays. */
  static async reverse(
    context: RequestContext,
    id: string,
    reason: string,
  ): Promise<CurrencyExchange> {
    return AppDataSource.transaction(async (manager) => {
      const exchange = await manager
        .getRepository(CurrencyExchange)
        .createQueryBuilder('exchange')
        .setLock('pessimistic_write')
        .where('exchange.id = :id', { id })
        .getOne();

      if (!exchange) throw ApiError.notFound('exchange.notFound');
      if (exchange.status === ExchangeStatus.REVERSED) {
        throw ApiError.conflict('exchange.alreadyReversed', { no: exchange.exchangeNo });
      }
      if (!exchange.financialTransactionId) throw ApiError.internal();

      const reversal = await LedgerService.reverse(
        manager,
        context,
        exchange.financialTransactionId,
        TransactionType.EXCHANGE_REVERSAL,
        `Reversal of exchange ${exchange.exchangeNo}: ${reason}`,
      );

      exchange.status = ExchangeStatus.REVERSED;
      exchange.reversalTransactionId = reversal.id;
      exchange.reversedById = context.userId;
      exchange.reversedAt = new Date();
      exchange.notes = [exchange.notes, `Reversed: ${reason}`].filter(Boolean).join('\n');
      await manager.save(CurrencyExchange, exchange);

      await AuditService.recordInTransaction(manager, AuditService.actorFromContext(context), {
        action: AUDIT_ACTIONS.EXCHANGE_REVERSED,
        entityType: 'currency_exchange',
        entityId: exchange.id,
        after: { status: ExchangeStatus.REVERSED, reason },
        description: `Exchange ${exchange.exchangeNo} reversed`,
        descriptionKey: 'audit.desc.exchangeReversed',
        descriptionParams: { no: exchange.exchangeNo },
      });

      return ExchangeService.findByIdOrThrow(manager, exchange.id);
    });
  }

  // ================================================================ reads

  static async list(query: ExchangeListQuery): Promise<Paginated<CurrencyExchange>> {
    const { page, limit, skip, take } = normalizePagination(query);
    const sortBy = safeSort(query.sortBy, SORTABLE, 'createdAt');
    const sortOrder = safeSortOrder(query.sortOrder);

    const builder = ExchangeService.baseQuery()
      .orderBy(`exchange.${sortBy}`, sortOrder)
      .skip(skip)
      .take(take);

    if (query.type) builder.andWhere('exchange.type = :type', { type: query.type });
    if (query.status) builder.andWhere('exchange.status = :status', { status: query.status });
    if (query.cashBoxId) builder.andWhere('exchange.cash_box_id = :cashBoxId', { cashBoxId: query.cashBoxId });
    if (query.customerId) builder.andWhere('exchange.customer_id = :customerId', { customerId: query.customerId });
    if (query.createdById) builder.andWhere('exchange.created_by = :createdById', { createdById: query.createdById });
    if (query.currencyId) {
      builder.andWhere('(exchange.from_currency_id = :currencyId OR exchange.to_currency_id = :currencyId)', {
        currencyId: query.currencyId,
      });
    }
    if (query.from) builder.andWhere('exchange.created_at >= :from', { from: query.from });
    if (query.to) builder.andWhere('exchange.created_at <= :to', { to: query.to });
    if (query.q) {
      const term = `%${query.q.trim()}%`;
      builder.andWhere(
        '(exchange.exchange_no ILIKE :term OR exchange.customer_name ILIKE :term OR exchange.customer_phone ILIKE :term)',
        { term },
      );
    }

    const [items, total] = await builder.getManyAndCount();
    return paginate(items, page, limit, total);
  }

  static async findByIdOrThrow(manager: EntityManager, id: string): Promise<CurrencyExchange> {
    const exchange = await manager.getRepository(CurrencyExchange).findOne({
      where: { id },
      relations: {
        fromCurrency: true,
        toCurrency: true,
        commissionCurrency: true,
        cashBox: true,
        customer: true,
        createdBy: true,
      },
    });
    if (!exchange) throw ApiError.notFound('exchange.notFound');
    return exchange;
  }

  private static baseQuery() {
    return AppDataSource.getRepository(CurrencyExchange)
      .createQueryBuilder('exchange')
      .leftJoinAndSelect('exchange.fromCurrency', 'fromCurrency')
      .leftJoinAndSelect('exchange.toCurrency', 'toCurrency')
      .leftJoinAndSelect('exchange.cashBox', 'cashBox')
      .leftJoinAndSelect('exchange.customer', 'customer')
      .leftJoinAndSelect('exchange.createdBy', 'createdBy');
  }
}
