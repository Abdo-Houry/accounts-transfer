import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { ACCOUNT_CODES, cashAccountCode, correspondentAccountCode } from '../config/accounts';
import { Voucher } from '../entities/voucher.entity';
import {
  EntryDirection,
  TransactionType,
  VoucherCategory,
  VoucherStatus,
  VoucherType,
} from '../types/enums';
import type { Paginated, RequestContext } from '../types/common';
import { ApiError } from '../utils/api-error';
import { money } from '../utils/money';
import { normalizePagination, paginate, safeSort, safeSortOrder } from '../utils/pagination';
import { nextDocumentNumber } from '../utils/sequence';
import { AuditService, AUDIT_ACTIONS } from './audit.service';
import { CashBoxService } from './cash-box.service';
import { CurrencyService } from './currency.service';
import { CorrespondentService } from './correspondent.service';
import { CustomerService } from './customer.service';
import { LedgerService } from './ledger.service';

export interface CreateVoucherInput {
  amount: string;
  currencyId: string;
  cashBoxId: string;
  customerId?: string | null;
  /** Required when the category is CORRESPONDENT_SETTLEMENT. */
  correspondentId?: string | null;
  counterpartyName?: string | null;
  category?: VoucherCategory;
  reason: string;
  referenceType?: string | null;
  referenceId?: string | null;
  notes?: string | null;
  occurredAt?: Date;
}

export interface VoucherListQuery {
  page?: number;
  limit?: number;
  q?: string;
  type?: VoucherType;
  status?: VoucherStatus;
  category?: VoucherCategory;
  currencyId?: string;
  cashBoxId?: string;
  customerId?: string;
  createdById?: string;
  from?: Date;
  to?: Date;
  sortBy?: string;
  sortOrder?: string;
}

const SORTABLE = ['createdAt', 'amount', 'voucherNo'] as const;

export class VoucherService {
  /**
   * Receipt voucher - money coming in.
   *   DR cash(box) / CR customer payable | other income
   *
   * The credit side depends on why the money arrived: settling a customer
   * balance creates a liability towards them, anything else is income.
   */
  static async createReceipt(
    context: RequestContext,
    input: CreateVoucherInput,
  ): Promise<Voucher> {
    return VoucherService.createVoucher(context, VoucherType.RECEIPT, input);
  }

  /**
   * Payment voucher - money going out.
   *   DR customer receivable | operating expense / CR cash(box)
   */
  static async createPayment(
    context: RequestContext,
    input: CreateVoucherInput,
  ): Promise<Voucher> {
    return VoucherService.createVoucher(context, VoucherType.PAYMENT, input);
  }

  private static async createVoucher(
    context: RequestContext,
    type: VoucherType,
    input: CreateVoucherInput,
  ): Promise<Voucher> {
    return AppDataSource.transaction(async (manager) => {
      const cashBox = await CashBoxService.findByIdOrThrow(manager, input.cashBoxId, true);
      const currency = await CurrencyService.requireActive(manager, input.currencyId);
      const amount = money(input.amount);
      if (!amount.isPositive()) throw ApiError.badRequest('voucher.amountPositive');

      if (input.customerId) await CustomerService.requireActive(manager, input.customerId);

      const category = input.category ?? VoucherCategory.OTHER;
      const isReceipt = type === VoucherType.RECEIPT;
      const prefix = isReceipt ? 'RCV' : 'PAY';

      if (category === VoucherCategory.CORRESPONDENT_SETTLEMENT && !input.correspondentId) {
        throw ApiError.badRequest('correspondent.settlementNeedsCorrespondent');
      }
      const correspondent = input.correspondentId
        ? await CorrespondentService.requireActive(manager, input.correspondentId)
        : null;

      const voucher = manager.create(Voucher, {
        voucherNo: await nextDocumentNumber(manager, 'voucher', prefix, input.occurredAt),
        type,
        amount: CurrencyService.roundFor(currency, amount).toString(),
        currencyId: currency.id,
        cashBoxId: cashBox.id,
        customerId: input.customerId ?? null,
        correspondentId: correspondent?.id ?? null,
        counterpartyName: input.counterpartyName ?? null,
        category,
        reason: input.reason,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        status: VoucherStatus.POSTED,
        createdById: context.userId,
        notes: input.notes ?? null,
      });
      await manager.save(Voucher, voucher);

      const counterAccount = VoucherService.counterAccount(
        type,
        category,
        voucher.customerId,
        correspondent?.code ?? null,
      );
      const cashAccount = cashAccountCode(cashBox.code);

      const transaction = await LedgerService.post(manager, context, {
        type: isReceipt ? TransactionType.RECEIPT_VOUCHER : TransactionType.PAYMENT_VOUCHER,
        sourceType: 'voucher',
        sourceId: voucher.id,
        description: `${voucher.voucherNo}: ${input.reason}`,
        descriptionKey: 'desc.voucherLine',
        descriptionParams: { no: voucher.voucherNo, reason: input.reason },
        occurredAt: input.occurredAt ?? new Date(),
        lines: isReceipt
          ? [
              {
                accountCode: cashAccount,
                cashBoxId: cashBox.id,
                customerId: voucher.customerId,
                currencyId: currency.id,
                direction: EntryDirection.DEBIT,
                amount: voucher.amount,
              },
              {
                accountCode: counterAccount,
                customerId: voucher.customerId,
                correspondentId: voucher.correspondentId,
                currencyId: currency.id,
                direction: EntryDirection.CREDIT,
                amount: voucher.amount,
              },
            ]
          : [
              {
                accountCode: counterAccount,
                customerId: voucher.customerId,
                correspondentId: voucher.correspondentId,
                currencyId: currency.id,
                direction: EntryDirection.DEBIT,
                amount: voucher.amount,
              },
              {
                accountCode: cashAccount,
                cashBoxId: cashBox.id,
                customerId: voucher.customerId,
                currencyId: currency.id,
                direction: EntryDirection.CREDIT,
                amount: voucher.amount,
              },
            ],
      });

      voucher.financialTransactionId = transaction.id;
      await manager.save(Voucher, voucher);

      await AuditService.recordInTransaction(manager, AuditService.actorFromContext(context), {
        action: isReceipt ? AUDIT_ACTIONS.VOUCHER_RECEIPT : AUDIT_ACTIONS.VOUCHER_PAYMENT,
        entityType: 'voucher',
        entityId: voucher.id,
        after: {
          voucherNo: voucher.voucherNo,
          amount: voucher.amount,
          currency: currency.code,
          cashBox: cashBox.code,
          category,
        },
        description: `${voucher.voucherNo} posted for ${amount.toTrimmed()} ${currency.code}`,
        descriptionKey: 'desc.voucherPosted',
        descriptionParams: { no: voucher.voucherNo, amount: amount.toTrimmed(), currency: currency.code },
      });

      return VoucherService.findByIdOrThrow(manager, voucher.id);
    });
  }

  /** Which non-cash account the voucher hits. */
  private static counterAccount(
    type: VoucherType,
    category: VoucherCategory,
    customerId: string | null,
    correspondentCode: string | null,
  ): string {
    // Squaring a partner's account is neither income nor expense: it moves the
    // balance on their current account, which is why it is checked first.
    if (correspondentCode && category === VoucherCategory.CORRESPONDENT_SETTLEMENT) {
      return correspondentAccountCode(correspondentCode);
    }

    const settlesCustomer = customerId !== null && category === VoucherCategory.CUSTOMER_SETTLEMENT;

    if (type === VoucherType.RECEIPT) {
      return settlesCustomer ? ACCOUNT_CODES.CUSTOMER_PAYABLE : ACCOUNT_CODES.OTHER_INCOME;
    }
    return settlesCustomer ? ACCOUNT_CODES.CUSTOMER_RECEIVABLE : ACCOUNT_CODES.OPERATING_EXPENSE;
  }

  /** Cancels a posted voucher with a reversing entry; the row itself stays. */
  static async void(context: RequestContext, id: string, reason: string): Promise<Voucher> {
    return AppDataSource.transaction(async (manager) => {
      const voucher = await manager
        .getRepository(Voucher)
        .createQueryBuilder('voucher')
        .setLock('pessimistic_write')
        .where('voucher.id = :id', { id })
        .getOne();

      if (!voucher) throw ApiError.notFound('voucher.notFound');
      if (voucher.status === VoucherStatus.VOIDED) {
        throw ApiError.conflict('voucher.alreadyVoided', { no: voucher.voucherNo });
      }
      if (!voucher.financialTransactionId) throw ApiError.internal();

      const reversal = await LedgerService.reverse(
        manager,
        context,
        voucher.financialTransactionId,
        TransactionType.VOUCHER_VOID,
        `Void of voucher ${voucher.voucherNo}: ${reason}`,
      );

      voucher.status = VoucherStatus.VOIDED;
      voucher.voidTransactionId = reversal.id;
      voucher.voidedById = context.userId;
      voucher.voidedAt = new Date();
      voucher.notes = [voucher.notes, `Voided: ${reason}`].filter(Boolean).join('\n');
      await manager.save(Voucher, voucher);

      await AuditService.recordInTransaction(manager, AuditService.actorFromContext(context), {
        action: AUDIT_ACTIONS.VOUCHER_VOIDED,
        entityType: 'voucher',
        entityId: voucher.id,
        after: { status: VoucherStatus.VOIDED, reason },
        description: `Voucher ${voucher.voucherNo} voided`,
        descriptionKey: 'audit.desc.voucherVoided',
        descriptionParams: { no: voucher.voucherNo },
      });

      return VoucherService.findByIdOrThrow(manager, voucher.id);
    });
  }

  // ================================================================ reads

  static async list(query: VoucherListQuery): Promise<Paginated<Voucher>> {
    const { page, limit, skip, take } = normalizePagination(query);
    const sortBy = safeSort(query.sortBy, SORTABLE, 'createdAt');
    const sortOrder = safeSortOrder(query.sortOrder);

    const builder = AppDataSource.getRepository(Voucher)
      .createQueryBuilder('voucher')
      .leftJoinAndSelect('voucher.currency', 'currency')
      .leftJoinAndSelect('voucher.cashBox', 'cashBox')
      .leftJoinAndSelect('voucher.customer', 'customer')
      .leftJoinAndSelect('voucher.createdBy', 'createdBy')
      .orderBy(`voucher.${sortBy}`, sortOrder)
      .skip(skip)
      .take(take);

    if (query.type) builder.andWhere('voucher.type = :type', { type: query.type });
    if (query.status) builder.andWhere('voucher.status = :status', { status: query.status });
    if (query.category) builder.andWhere('voucher.category = :category', { category: query.category });
    if (query.currencyId) builder.andWhere('voucher.currency_id = :currencyId', { currencyId: query.currencyId });
    if (query.cashBoxId) builder.andWhere('voucher.cash_box_id = :cashBoxId', { cashBoxId: query.cashBoxId });
    if (query.customerId) builder.andWhere('voucher.customer_id = :customerId', { customerId: query.customerId });
    if (query.createdById) builder.andWhere('voucher.created_by = :createdById', { createdById: query.createdById });
    if (query.from) builder.andWhere('voucher.created_at >= :from', { from: query.from });
    if (query.to) builder.andWhere('voucher.created_at <= :to', { to: query.to });
    if (query.q) {
      const term = `%${query.q.trim()}%`;
      builder.andWhere(
        '(voucher.voucher_no ILIKE :term OR voucher.reason ILIKE :term OR voucher.counterparty_name ILIKE :term)',
        { term },
      );
    }

    const [items, total] = await builder.getManyAndCount();
    return paginate(items, page, limit, total);
  }

  static async findByIdOrThrow(manager: EntityManager, id: string): Promise<Voucher> {
    const voucher = await manager.getRepository(Voucher).findOne({
      where: { id },
      relations: { currency: true, cashBox: true, customer: true, createdBy: true },
    });
    if (!voucher) throw ApiError.notFound('voucher.notFound');
    return voucher;
  }
}
