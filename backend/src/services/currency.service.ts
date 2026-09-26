import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { Currency } from '../entities/currency.entity';
import { ExchangeRate } from '../entities/exchange-rate.entity';
import type { RequestContext } from '../types/common';
import { ApiError } from '../utils/api-error';
import { Money, money } from '../utils/money';
import { AuditService, AUDIT_ACTIONS } from './audit.service';

export interface CreateCurrencyInput {
  code: string;
  nameAr: string;
  nameEn: string;
  nameTr: string;
  symbol?: string;
  decimalPlaces?: number;
  sortOrder?: number;
}

export interface UpdateCurrencyInput {
  nameAr?: string;
  nameEn?: string;
  nameTr?: string;
  symbol?: string;
  decimalPlaces?: number;
  sortOrder?: number;
  isActive?: boolean;
}

export interface SetRateInput {
  currencyId: string;
  buyRate: string;
  sellRate: string;
  effectiveFrom?: Date;
  note?: string;
}

export interface RateBoardRow {
  currency: Currency;
  rate: ExchangeRate | null;
}

/** The two legs of a cross rate, kept so the UI can show how a deal was priced. */
export interface ResolvedCrossRate {
  /** `toAmount = fromAmount * rate` */
  rate: string;
  fromBuyRate: string;
  toSellRate: string;
  fromRateId: string | null;
  toRateId: string | null;
}

export class CurrencyService {
  // ------------------------------------------------------------- currencies

  static async list(includeInactive = false): Promise<Currency[]> {
    const repository = AppDataSource.getRepository(Currency);
    return repository.find({
      where: includeInactive ? {} : { isActive: true },
      order: { sortOrder: 'ASC', code: 'ASC' },
    });
  }

  static async getBase(manager: EntityManager = AppDataSource.manager): Promise<Currency> {
    const base = await manager.getRepository(Currency).findOne({ where: { isBase: true } });
    if (!base) {
      // The seeder guarantees exactly one base currency; missing it is a setup bug.
      throw ApiError.internal('currency.notFound');
    }
    return base;
  }

  /**
   * Loads a currency and refuses inactive ones - an operation must never be
   * booked in a currency the office has retired.
   */
  static async requireActive(manager: EntityManager, currencyId: string): Promise<Currency> {
    const currency = await manager.getRepository(Currency).findOne({ where: { id: currencyId } });
    if (!currency) throw ApiError.notFound('currency.notFound');
    if (!currency.isActive) throw ApiError.conflict('currency.inactive', { code: currency.code });
    return currency;
  }

  static async create(context: RequestContext, input: CreateCurrencyInput): Promise<Currency> {
    return AppDataSource.transaction(async (manager) => {
      const code = input.code.trim().toUpperCase();
      const existing = await manager.getRepository(Currency).findOne({ where: { code } });
      if (existing) throw ApiError.conflict('currency.codeTaken', { code });

      const currency = manager.create(Currency, {
        code,
        nameAr: input.nameAr,
        nameEn: input.nameEn,
        nameTr: input.nameTr,
        symbol: input.symbol ?? '',
        decimalPlaces: input.decimalPlaces ?? 2,
        sortOrder: input.sortOrder ?? 0,
        isBase: false,
        isActive: true,
      });
      await manager.save(Currency, currency);

      await AuditService.recordInTransaction(manager, AuditService.actorFromContext(context), {
        action: AUDIT_ACTIONS.CURRENCY_CREATED,
        entityType: 'currency',
        entityId: currency.id,
        after: { code, nameEn: input.nameEn },
        description: `Currency ${code} created`,
        descriptionKey: 'audit.desc.currencyCreated',
        descriptionParams: { code },
      });

      return currency;
    });
  }

  static async update(
    context: RequestContext,
    id: string,
    input: UpdateCurrencyInput,
  ): Promise<Currency> {
    return AppDataSource.transaction(async (manager) => {
      const currency = await manager.getRepository(Currency).findOne({ where: { id } });
      if (!currency) throw ApiError.notFound('currency.notFound');

      if (input.isActive === false && currency.isBase) {
        throw ApiError.conflict('currency.baseImmutable');
      }

      const before = { ...currency };
      Object.assign(currency, {
        nameAr: input.nameAr ?? currency.nameAr,
        nameEn: input.nameEn ?? currency.nameEn,
        nameTr: input.nameTr ?? currency.nameTr,
        symbol: input.symbol ?? currency.symbol,
        decimalPlaces: input.decimalPlaces ?? currency.decimalPlaces,
        sortOrder: input.sortOrder ?? currency.sortOrder,
        isActive: input.isActive ?? currency.isActive,
      });
      await manager.save(Currency, currency);

      await AuditService.recordInTransaction(manager, AuditService.actorFromContext(context), {
        action: AUDIT_ACTIONS.CURRENCY_UPDATED,
        entityType: 'currency',
        entityId: currency.id,
        before,
        after: { ...currency },
        description: `Currency ${currency.code} updated`,
        descriptionKey: 'audit.desc.currencyUpdated',
        descriptionParams: { code: currency.code },
      });

      return currency;
    });
  }

  // ------------------------------------------------------------------ rates

  /** The live buy/sell board, one row per active currency. */
  static async rateBoard(): Promise<RateBoardRow[]> {
    const currencies = await CurrencyService.list();
    const rates = await AppDataSource.getRepository(ExchangeRate).find({
      where: { isActive: true },
    });
    const byCurrency = new Map(rates.map((rate) => [rate.currencyId, rate]));
    return currencies.map((currency) => ({
      currency,
      rate: currency.isBase ? null : (byCurrency.get(currency.id) ?? null),
    }));
  }

  static async rateHistory(
    currencyId?: string,
    from?: Date,
    to?: Date,
    limit = 200,
  ): Promise<ExchangeRate[]> {
    const builder = AppDataSource.getRepository(ExchangeRate)
      .createQueryBuilder('rate')
      .leftJoinAndSelect('rate.currency', 'currency')
      .leftJoinAndSelect('rate.createdBy', 'user')
      .orderBy('rate.effectiveFrom', 'DESC')
      .limit(limit);

    if (currencyId) builder.andWhere('rate.currency_id = :currencyId', { currencyId });
    if (from) builder.andWhere('rate.effective_from >= :from', { from });
    if (to) builder.andWhere('rate.effective_from <= :to', { to });

    return builder.getMany();
  }

  static async getActiveRate(
    manager: EntityManager,
    currencyId: string,
  ): Promise<ExchangeRate | null> {
    return manager
      .getRepository(ExchangeRate)
      .findOne({ where: { currencyId, isActive: true }, relations: { currency: true } });
  }

  /**
   * Publishes a new rate.
   *
   * The previous row is *closed*, never overwritten: `effectiveTo` is stamped
   * and `isActive` cleared, so any past deal can still be re-priced with the
   * rate that was live when it was booked.
   */
  static async setRate(context: RequestContext, input: SetRateInput): Promise<ExchangeRate> {
    return AppDataSource.transaction(async (manager) =>
      CurrencyService.setRateInTransaction(manager, context, input),
    );
  }

  static async setRatesBulk(
    context: RequestContext,
    inputs: SetRateInput[],
  ): Promise<ExchangeRate[]> {
    return AppDataSource.transaction(async (manager) => {
      const results: ExchangeRate[] = [];
      for (const input of inputs) {
        results.push(await CurrencyService.setRateInTransaction(manager, context, input));
      }
      return results;
    });
  }

  private static async setRateInTransaction(
    manager: EntityManager,
    context: RequestContext,
    input: SetRateInput,
  ): Promise<ExchangeRate> {
    const currency = await CurrencyService.requireActive(manager, input.currencyId);
    if (currency.isBase) throw ApiError.conflict('rate.baseCurrencyRate', { code: currency.code });

    const buy = money(input.buyRate);
    const sell = money(input.sellRate);
    if (!buy.isPositive() || !sell.isPositive()) throw ApiError.badRequest('rate.invalid');
    if (sell.lt(buy)) {
      throw ApiError.badRequest('rate.sellBelowBuy', {
        buy: buy.toTrimmed(),
        sell: sell.toTrimmed(),
      });
    }

    const effectiveFrom = input.effectiveFrom ?? new Date();
    const previous = await manager
      .getRepository(ExchangeRate)
      .findOne({ where: { currencyId: currency.id, isActive: true } });

    if (previous) {
      previous.isActive = false;
      previous.effectiveTo = effectiveFrom;
      await manager.save(ExchangeRate, previous);
    }

    const rate = manager.create(ExchangeRate, {
      currencyId: currency.id,
      buyRate: buy.toString(),
      sellRate: sell.toString(),
      effectiveFrom,
      effectiveTo: null,
      isActive: true,
      previousRateId: previous?.id ?? null,
      createdById: context.userId,
      note: input.note ?? '',
    });
    await manager.save(ExchangeRate, rate);

    await AuditService.recordInTransaction(manager, AuditService.actorFromContext(context), {
      action: AUDIT_ACTIONS.RATE_UPDATED,
      entityType: 'exchange_rate',
      entityId: rate.id,
      before: previous ? { buyRate: previous.buyRate, sellRate: previous.sellRate } : null,
      after: { buyRate: rate.buyRate, sellRate: rate.sellRate },
      description: `Rate for ${currency.code}: buy ${buy.toTrimmed()} / sell ${sell.toTrimmed()}`,
      descriptionKey: 'audit.desc.rateUpdated',
      descriptionParams: { code: currency.code, buy: buy.toTrimmed(), sell: sell.toTrimmed() },
    });

    rate.currency = currency;
    return rate;
  }

  // ------------------------------------------------------------ cross rates

  /**
   * Price one currency in terms of another, always through the base currency.
   *
   * The office buys what it receives (`from`) at the buy rate and sells what it
   * pays out (`to`) at the sell rate, which is what produces the spread the
   * office earns:
   *
   *   toAmount = fromAmount * buyRate(from) / sellRate(to)
   *
   * The base currency itself trades at 1 on both sides.
   */
  static async resolveCrossRate(
    manager: EntityManager,
    fromCurrency: Currency,
    toCurrency: Currency,
  ): Promise<ResolvedCrossRate> {
    if (fromCurrency.id === toCurrency.id) throw ApiError.badRequest('currency.sameCurrency');

    let fromBuyRate = '1';
    let fromRateId: string | null = null;
    if (!fromCurrency.isBase) {
      const rate = await CurrencyService.getActiveRate(manager, fromCurrency.id);
      if (!rate) throw ApiError.rateNotAvailable(fromCurrency.code);
      fromBuyRate = rate.buyRate;
      fromRateId = rate.id;
    }

    let toSellRate = '1';
    let toRateId: string | null = null;
    if (!toCurrency.isBase) {
      const rate = await CurrencyService.getActiveRate(manager, toCurrency.id);
      if (!rate) throw ApiError.rateNotAvailable(toCurrency.code);
      toSellRate = rate.sellRate;
      toRateId = rate.id;
    }

    if (money(toSellRate).isZero()) throw ApiError.rateNotAvailable(toCurrency.code);

    return {
      rate: money(fromBuyRate).div(toSellRate).toString(),
      fromBuyRate,
      toSellRate,
      fromRateId,
      toRateId,
    };
  }

  /** Rounds an amount to the display precision of its currency. */
  static roundFor(currency: Currency, amount: Money | string): Money {
    return money(amount).round(currency.decimalPlaces);
  }
}
