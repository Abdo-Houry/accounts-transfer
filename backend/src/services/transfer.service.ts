import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { ACCOUNT_CODES, cashAccountCode, correspondentAccountCode } from '../config/accounts';
import { Currency } from '../entities/currency.entity';
import { Transfer } from '../entities/transfer.entity';
import { TransferStatusHistory } from '../entities/transfer-status-history.entity';
import {
  CommissionBearer,
  CommissionOperation,
  EntryDirection,
  PaymentMethod,
  TransactionType,
  TransferDirection,
  TransferStatus,
  TRANSFER_TRANSITIONS,
} from '../types/enums';
import type { Paginated, RequestContext } from '../types/common';
import type {
  CancelTransferInput,
  CreateTransferInput,
  ReceiveTransferInput,
  TransferListQuery,
  TransferLookupQuery,
  TransferQuote,
  TransferQuoteInput,
  UpdateTransferInput,
} from '../models/transfer.model';
import type { PostingLine } from '../models/ledger.model';
import { ApiError } from '../utils/api-error';
import { Money, money } from '../utils/money';
import { normalizePagination, paginate, safeSort, safeSortOrder } from '../utils/pagination';
import { nextDocumentNumber } from '../utils/sequence';
import { AuditService, AUDIT_ACTIONS } from './audit.service';
import { CashBoxService } from './cash-box.service';
import { CorrespondentService } from './correspondent.service';
import { CommissionService } from './commission.service';
import { CurrencyService } from './currency.service';
import { LedgerService } from './ledger.service';
import { CustomerService } from './customer.service';

const SORTABLE = ['createdAt', 'amount', 'transferNo', 'status'] as const;

/** Internal shape produced by pricing, reused by both `quote` and `create`. */
interface PricedTransfer {
  payInCurrency: Currency;
  payoutCurrency: Currency;
  commissionCurrency: Currency;
  amount: Money;
  commission: Money;
  commissionBearer: CommissionBearer;
  commissionRuleName: string | null;
  exchangeRate: Money;
  payoutAmount: Money;
  totalCollected: Money;
  isCrossCurrency: boolean;
}

/**
 * Where a transfer's money comes from, or goes to.
 *
 * A deal is funded either over this office's own counter or by a partner
 * office that collected it abroad, and it is paid out the same two ways. Both
 * ends resolve to one account code plus the dimension that makes the leg show
 * up on the right statement, so the posting code below does not have to branch
 * on the channel more than once.
 */
interface MoneyChannel {
  accountCode: string;
  cashBoxId: string | null;
  correspondentId: string | null;
  /** Display name used in the journal line. */
  name: string;
}

export class TransferService {
  // ============================================================== pricing

  /**
   * Works out every figure of a transfer without touching the database state.
   *
   * Who pays the fee changes both sides of the deal:
   *  - SENDER      fee is added to what is collected, in the pay-in currency.
   *  - BENEFICIARY fee is deducted from the payout, in the payout currency.
   */
  private static async price(
    manager: EntityManager,
    input: TransferQuoteInput,
  ): Promise<PricedTransfer> {
    const payInCurrency = await CurrencyService.requireActive(manager, input.currencyId);
    const payoutCurrency = input.payoutCurrencyId
      ? await CurrencyService.requireActive(manager, input.payoutCurrencyId)
      : payInCurrency;

    const amount = money(input.amount);
    if (!amount.isPositive()) throw ApiError.badRequest('transfer.amountPositive');

    const isCrossCurrency = payInCurrency.id !== payoutCurrency.id;

    let exchangeRate = money('1');
    if (isCrossCurrency) {
      if (input.exchangeRate) {
        exchangeRate = money(input.exchangeRate);
        if (!exchangeRate.isPositive()) throw ApiError.badRequest('rate.invalid');
      } else {
        const cross = await CurrencyService.resolveCrossRate(manager, payInCurrency, payoutCurrency);
        exchangeRate = money(cross.rate);
      }
    }

    const commissionBearer = input.commissionBearer ?? CommissionBearer.SENDER;
    const commissionCurrency =
      commissionBearer === CommissionBearer.SENDER ? payInCurrency : payoutCurrency;

    const grossPayout = CurrencyService.roundFor(payoutCurrency, amount.mul(exchangeRate));

    let commission: Money;
    let commissionRuleName: string | null = null;

    if (input.commissionAmount !== undefined && input.commissionAmount !== null) {
      commission = money(input.commissionAmount);
      if (commission.isNegative()) throw ApiError.badRequest('error.validation');
    } else {
      // The rule is priced on the amount expressed in the fee currency.
      const basis = commissionBearer === CommissionBearer.SENDER ? amount : grossPayout;
      const resolved = await CommissionService.resolve(
        manager,
        CommissionOperation.TRANSFER,
        commissionCurrency.id,
        basis,
      );
      commission = money(resolved.amount);
      commissionRuleName = resolved.ruleName;
    }

    commission = CurrencyService.roundFor(commissionCurrency, commission);

    let payoutAmount: Money;
    let totalCollected: Money;

    if (commissionBearer === CommissionBearer.SENDER) {
      payoutAmount = grossPayout;
      totalCollected = CurrencyService.roundFor(payInCurrency, amount.add(commission));
    } else {
      if (commission.gte(grossPayout)) {
        throw ApiError.badRequest('transfer.commissionExceedsAmount', {
          commission: commission.toTrimmed(),
          amount: grossPayout.toTrimmed(),
        });
      }
      payoutAmount = CurrencyService.roundFor(payoutCurrency, grossPayout.sub(commission));
      totalCollected = CurrencyService.roundFor(payInCurrency, amount);
    }

    return {
      payInCurrency,
      payoutCurrency,
      commissionCurrency,
      amount: CurrencyService.roundFor(payInCurrency, amount),
      commission,
      commissionBearer,
      commissionRuleName,
      exchangeRate,
      payoutAmount,
      totalCollected,
      isCrossCurrency,
    };
  }

  static async quote(input: TransferQuoteInput): Promise<TransferQuote> {
    const priced = await TransferService.price(AppDataSource.manager, input);
    return {
      amount: priced.amount.toString(),
      commissionAmount: priced.commission.toString(),
      commissionCurrencyCode: priced.commissionCurrency.code,
      commissionBearer: priced.commissionBearer,
      commissionRuleName: priced.commissionRuleName,
      exchangeRate: priced.exchangeRate.toString(),
      payoutAmount: priced.payoutAmount.toString(),
      payoutCurrencyCode: priced.payoutCurrency.code,
      totalCollected: priced.totalCollected.toString(),
      payInCurrencyCode: priced.payInCurrency.code,
      isCrossCurrency: priced.isCrossCurrency,
    };
  }

  // =============================================================== create

  /**
   * Collects the money and records what the office now owes the beneficiary.
   *
   * Ledger (see docs/01-architecture.md section 6.1 / 6.2):
   *   pay-in book  DR cash(total collected)  CR clearing/payable  CR commission
   *   payout book  DR clearing               CR transfers payable
   *
   * Everything below runs in one database transaction, so a failure at any step
   * leaves neither a transfer row nor a cash movement behind.
   */
  static async create(context: RequestContext, input: CreateTransferInput): Promise<Transfer> {
    return AppDataSource.transaction(async (manager) => {
      // Exactly one funding channel: this office's counter, or a partner that
      // already collected the money abroad.
      if (!input.cashBoxId && !input.senderCorrespondentId) {
        throw ApiError.badRequest('transfer.needsCashBoxOrCorrespondent');
      }
      const senderCorrespondent = input.senderCorrespondentId
        ? await CorrespondentService.requireActive(manager, input.senderCorrespondentId)
        : null;
      const cashBox =
        !senderCorrespondent && input.cashBoxId
          ? await CashBoxService.findByIdOrThrow(manager, input.cashBoxId, true)
          : null;
      const funding: MoneyChannel = senderCorrespondent
        ? {
            accountCode: correspondentAccountCode(senderCorrespondent.code),
            cashBoxId: null,
            correspondentId: senderCorrespondent.id,
            name: senderCorrespondent.nameAr || senderCorrespondent.nameEn,
          }
        : {
            accountCode: cashAccountCode(cashBox!.code),
            cashBoxId: cashBox!.id,
            correspondentId: null,
            name: cashBox!.code,
          };

      const payoutCorrespondent = input.payoutCorrespondentId
        ? await CorrespondentService.requireActive(manager, input.payoutCorrespondentId)
        : null;

      const priced = await TransferService.price(manager, input);

      if (input.senderCustomerId) await CustomerService.requireActive(manager, input.senderCustomerId);
      if (input.beneficiaryCustomerId) {
        await CustomerService.requireActive(manager, input.beneficiaryCustomerId);
      }

      const transfer = manager.create(Transfer, {
        transferNo: await nextDocumentNumber(manager, 'transfer', 'TRF'),
        direction: input.direction ?? TransferDirection.OUTGOING,
        status: TransferStatus.PENDING,

        senderCustomerId: input.senderCustomerId ?? null,
        senderName: input.senderName.trim(),
        senderPhone: input.senderPhone.trim(),
        beneficiaryCustomerId: input.beneficiaryCustomerId ?? null,
        beneficiaryName: input.beneficiaryName.trim(),
        beneficiaryPhone: input.beneficiaryPhone.trim(),
        beneficiaryCountry: input.beneficiaryCountry.trim(),
        beneficiaryCity: input.beneficiaryCity.trim(),

        currencyId: priced.payInCurrency.id,
        amount: priced.amount.toString(),
        commissionAmount: priced.commission.toString(),
        commissionCurrencyId: priced.commissionCurrency.id,
        commissionBearer: priced.commissionBearer,
        payoutCurrencyId: priced.payoutCurrency.id,
        exchangeRate: priced.exchangeRate.toString(),
        payoutAmount: priced.payoutAmount.toString(),
        totalCollected: priced.totalCollected.toString(),
        paymentMethod: input.paymentMethod ?? PaymentMethod.CASH,

        cashBoxId: cashBox?.id ?? null,
        payoutCashBoxId: null,
        senderCorrespondentId: senderCorrespondent?.id ?? null,
        payoutCorrespondentId: payoutCorrespondent?.id ?? null,
        createdById: context.userId,
        notes: input.notes ?? null,
      });
      await manager.save(Transfer, transfer);

      const transaction = await LedgerService.post(manager, context, {
        type: TransactionType.TRANSFER_CREATE,
        sourceType: 'transfer',
        sourceId: transfer.id,
        description: `Transfer ${transfer.transferNo} collected from ${transfer.senderName}`,
        descriptionKey: 'desc.transferCollected',
        descriptionParams: { no: transfer.transferNo, name: transfer.senderName },
        lines: TransferService.creationLines(transfer, priced, funding),
      });

      transfer.createTransactionId = transaction.id;
      await manager.save(Transfer, transfer);

      await TransferService.recordStatus(
        manager,
        context,
        transfer,
        null,
        TransferStatus.PENDING,
        'Transfer created',
      );

      await AuditService.recordInTransaction(manager, AuditService.actorFromContext(context), {
        action: AUDIT_ACTIONS.TRANSFER_CREATED,
        entityType: 'transfer',
        entityId: transfer.id,
        after: {
          transferNo: transfer.transferNo,
          amount: transfer.amount,
          currency: priced.payInCurrency.code,
          payoutAmount: transfer.payoutAmount,
          payoutCurrency: priced.payoutCurrency.code,
          commission: transfer.commissionAmount,
          fundedBy: funding.name,
        },
        description: `Transfer ${transfer.transferNo} created`,
        descriptionKey: 'audit.desc.transferCreated',
        descriptionParams: { no: transfer.transferNo },
      });

      return TransferService.findByIdOrThrow(manager, transfer.id);
    });
  }

  /** Builds the journal lines for the collection leg. */
  private static creationLines(
    transfer: Transfer,
    priced: PricedTransfer,
    funding: MoneyChannel,
  ): PostingLine[] {
    const lines: PostingLine[] = [];
    const payInId = priced.payInCurrency.id;
    const payoutId = priced.payoutCurrency.id;
    const viaCorrespondent = funding.correspondentId !== null;

    // The funding leg. Over the counter this is cash entering a box; through a
    // partner it is their current account being debited, because they are now
    // holding that money on this office's behalf and no cash has moved here.
    lines.push({
      accountCode: funding.accountCode,
      cashBoxId: funding.cashBoxId,
      correspondentId: funding.correspondentId,
      customerId: transfer.senderCustomerId,
      currencyId: payInId,
      direction: EntryDirection.DEBIT,
      amount: priced.totalCollected.toString(),
      description: viaCorrespondent
        ? `Transfer ${transfer.transferNo} funded by correspondent ${funding.name}`
        : `Cash in for transfer ${transfer.transferNo}`,
      descriptionKey: viaCorrespondent ? 'desc.correspondentFunded' : 'desc.cashInTransfer',
      descriptionParams: viaCorrespondent
        ? { no: transfer.transferNo, name: funding.name }
        : { no: transfer.transferNo },
    });

    if (!priced.isCrossCurrency) {
      // Single-currency deal: the obligation and the fee come straight out of
      // what was collected, no clearing account needed.
      lines.push({
        accountCode: ACCOUNT_CODES.TRANSFERS_PAYABLE,
        customerId: transfer.beneficiaryCustomerId,
        currencyId: payoutId,
        direction: EntryDirection.CREDIT,
        amount: priced.payoutAmount.toString(),
        description: `Payable to ${transfer.beneficiaryName}`,
        descriptionKey: 'desc.payableTo',
        descriptionParams: { name: transfer.beneficiaryName },
      });
      if (priced.commission.isPositive()) {
        lines.push({
          accountCode: ACCOUNT_CODES.COMMISSION_INCOME,
          currencyId: priced.commissionCurrency.id,
          direction: EntryDirection.CREDIT,
          amount: priced.commission.toString(),
          description: `Commission on ${transfer.transferNo}`,
          descriptionKey: 'desc.commissionOn',
          descriptionParams: { no: transfer.transferNo },
        });
      }
      return lines;
    }

    // Cross-currency: each currency book balances on its own through the FX
    // position account (docs/01-architecture.md section 5).
    const senderPaysFee = priced.commissionBearer === CommissionBearer.SENDER;
    const clearedIn = senderPaysFee
      ? priced.totalCollected.sub(priced.commission)
      : priced.totalCollected;

    lines.push({
      accountCode: ACCOUNT_CODES.FX_POSITION,
      currencyId: payInId,
      direction: EntryDirection.CREDIT,
      amount: clearedIn.toString(),
      description: `FX out for transfer ${transfer.transferNo}`,
      descriptionKey: 'desc.fxOutTransfer',
      descriptionParams: { no: transfer.transferNo },
    });

    if (senderPaysFee && priced.commission.isPositive()) {
      lines.push({
        accountCode: ACCOUNT_CODES.COMMISSION_INCOME,
        currencyId: priced.commissionCurrency.id,
        direction: EntryDirection.CREDIT,
        amount: priced.commission.toString(),
        description: `Commission on ${transfer.transferNo}`,
        descriptionKey: 'desc.commissionOn',
        descriptionParams: { no: transfer.transferNo },
      });
    }

    const grossPayout = senderPaysFee
      ? priced.payoutAmount
      : priced.payoutAmount.add(priced.commission);

    lines.push({
      accountCode: ACCOUNT_CODES.FX_POSITION,
      currencyId: payoutId,
      direction: EntryDirection.DEBIT,
      amount: grossPayout.toString(),
      description: `FX in for transfer ${transfer.transferNo}`,
      descriptionKey: 'desc.fxInTransfer',
      descriptionParams: { no: transfer.transferNo },
    });

    lines.push({
      accountCode: ACCOUNT_CODES.TRANSFERS_PAYABLE,
      customerId: transfer.beneficiaryCustomerId,
      currencyId: payoutId,
      direction: EntryDirection.CREDIT,
      amount: priced.payoutAmount.toString(),
      description: `Payable to ${transfer.beneficiaryName}`,
      descriptionKey: 'desc.payableTo',
      descriptionParams: { name: transfer.beneficiaryName },
    });

    if (!senderPaysFee && priced.commission.isPositive()) {
      lines.push({
        accountCode: ACCOUNT_CODES.COMMISSION_INCOME,
        currencyId: priced.commissionCurrency.id,
        direction: EntryDirection.CREDIT,
        amount: priced.commission.toString(),
        description: `Commission on ${transfer.transferNo}`,
        descriptionKey: 'desc.commissionOn',
        descriptionParams: { no: transfer.transferNo },
      });
    }

    return lines;
  }

  // ======================================================== state changes

  /** Dispatches the transfer to its destination. No money moves. */
  static async send(context: RequestContext, id: string, reason?: string): Promise<Transfer> {
    return AppDataSource.transaction(async (manager) => {
      const transfer = await TransferService.lockTransfer(manager, id);
      TransferService.assertTransition(transfer, TransferStatus.SENT);

      transfer.status = TransferStatus.SENT;
      transfer.sentAt = new Date();
      transfer.sentById = context.userId;
      await manager.save(Transfer, transfer);

      await TransferService.recordStatus(
        manager,
        context,
        transfer,
        TransferStatus.PENDING,
        TransferStatus.SENT,
        reason,
      );

      await AuditService.recordInTransaction(manager, AuditService.actorFromContext(context), {
        action: AUDIT_ACTIONS.TRANSFER_SENT,
        entityType: 'transfer',
        entityId: transfer.id,
        after: { status: TransferStatus.SENT },
        description: `Transfer ${transfer.transferNo} sent`,
        descriptionKey: 'audit.desc.transferSent',
        descriptionParams: { no: transfer.transferNo },
      });

      return TransferService.findByIdOrThrow(manager, transfer.id);
    });
  }

  /**
   * Pays the beneficiary and clears the liability.
   *   DR transfers payable / CR cash(payout box), in the payout currency.
   *
   * Double payout is impossible: the row is locked `FOR UPDATE` and the status
   * machine only allows SENT -> RECEIVED.
   */
  static async receive(
    context: RequestContext,
    id: string,
    input: ReceiveTransferInput,
  ): Promise<Transfer> {
    return AppDataSource.transaction(async (manager) => {
      const transfer = await TransferService.lockTransfer(manager, id);

      if (transfer.status === TransferStatus.RECEIVED) {
        throw ApiError.alreadyReceived({
          no: transfer.transferNo,
          date: transfer.receivedAt?.toISOString().slice(0, 16).replace('T', ' ') ?? '-',
        });
      }
      if (transfer.status === TransferStatus.CANCELLED) {
        throw ApiError.conflict('transfer.alreadyCancelled', { no: transfer.transferNo });
      }
      if (transfer.status !== TransferStatus.SENT) {
        throw ApiError.conflict('transfer.notPayable', {
          no: transfer.transferNo,
          status: transfer.status,
        });
      }

      // The payout channel: a box of ours, or the partner who hands the money
      // over abroad. A transfer routed to a correspondent at creation keeps
      // that route unless the caller overrides it with a box.
      const payoutCorrespondentId = input.payoutCashBoxId
        ? null
        : (input.payoutCorrespondentId ?? transfer.payoutCorrespondentId);

      const payoutCorrespondent = payoutCorrespondentId
        ? await CorrespondentService.requireActive(manager, payoutCorrespondentId)
        : null;

      const fallbackBoxId = input.payoutCashBoxId ?? transfer.cashBoxId;
      if (!payoutCorrespondent && !fallbackBoxId) {
        throw ApiError.badRequest('transfer.payoutNeedsChannel');
      }

      const payoutBox = payoutCorrespondent
        ? null
        : await CashBoxService.findByIdOrThrow(manager, fallbackBoxId!, true);

      const payoutChannel: MoneyChannel = payoutCorrespondent
        ? {
            accountCode: correspondentAccountCode(payoutCorrespondent.code),
            cashBoxId: null,
            correspondentId: payoutCorrespondent.id,
            name: payoutCorrespondent.nameAr || payoutCorrespondent.nameEn,
          }
        : {
            accountCode: cashAccountCode(payoutBox!.code),
            cashBoxId: payoutBox!.id,
            correspondentId: null,
            name: payoutBox!.code,
          };

      const transaction = await LedgerService.post(manager, context, {
        type: TransactionType.TRANSFER_PAYOUT,
        sourceType: 'transfer',
        sourceId: transfer.id,
        description: `Transfer ${transfer.transferNo} paid to ${transfer.beneficiaryName}`,
        descriptionKey: 'desc.transferPaid',
        descriptionParams: { no: transfer.transferNo, name: transfer.beneficiaryName },
        lines: [
          {
            accountCode: ACCOUNT_CODES.TRANSFERS_PAYABLE,
            customerId: transfer.beneficiaryCustomerId,
            currencyId: transfer.payoutCurrencyId,
            direction: EntryDirection.DEBIT,
            amount: transfer.payoutAmount,
            description: `Settle payable for ${transfer.transferNo}`,
            descriptionKey: 'desc.settlePayable',
            descriptionParams: { no: transfer.transferNo },
          },
          {
            accountCode: payoutChannel.accountCode,
            cashBoxId: payoutChannel.cashBoxId,
            correspondentId: payoutChannel.correspondentId,
            customerId: transfer.beneficiaryCustomerId,
            currencyId: transfer.payoutCurrencyId,
            direction: EntryDirection.CREDIT,
            amount: transfer.payoutAmount,
            description: payoutCorrespondent
              ? `Transfer ${transfer.transferNo} paid out through correspondent ${payoutChannel.name}`
              : `Cash out to ${transfer.beneficiaryName}`,
            descriptionKey: payoutCorrespondent
              ? 'desc.correspondentPayout'
              : 'desc.cashOutTo',
            descriptionParams: payoutCorrespondent
              ? { no: transfer.transferNo, name: payoutChannel.name }
              : { name: transfer.beneficiaryName },
          },
        ],
      });

      const previousStatus = transfer.status;
      transfer.status = TransferStatus.RECEIVED;
      transfer.receivedAt = new Date();
      transfer.receivedById = context.userId;
      transfer.payoutCashBoxId = payoutBox?.id ?? null;
      transfer.payoutCorrespondentId = payoutCorrespondent?.id ?? null;
      transfer.payoutTransactionId = transaction.id;
      if (input.notes) transfer.notes = [transfer.notes, input.notes].filter(Boolean).join('\n');
      await manager.save(Transfer, transfer);

      await TransferService.recordStatus(
        manager,
        context,
        transfer,
        previousStatus,
        TransferStatus.RECEIVED,
        input.receivedByName ? `Paid to ${input.receivedByName}` : undefined,
      );

      await AuditService.recordInTransaction(manager, AuditService.actorFromContext(context), {
        action: AUDIT_ACTIONS.TRANSFER_RECEIVED,
        entityType: 'transfer',
        entityId: transfer.id,
        after: {
          status: TransferStatus.RECEIVED,
          paidThrough: payoutChannel.name,
          payoutAmount: transfer.payoutAmount,
        },
        description: `Transfer ${transfer.transferNo} paid out`,
        descriptionKey: 'audit.desc.transferPaidOut',
        descriptionParams: { no: transfer.transferNo },
      });

      return TransferService.findByIdOrThrow(manager, transfer.id);
    });
  }

  /**
   * Cancels an unpaid transfer and returns the money.
   *
   * A paid transfer is never cancelled - the books would stop reflecting the
   * cash that actually left the drawer. The operator is told to use a payment
   * voucher or an adjustment instead.
   */
  static async cancel(
    context: RequestContext,
    id: string,
    input: CancelTransferInput,
  ): Promise<Transfer> {
    return AppDataSource.transaction(async (manager) => {
      const transfer = await TransferService.lockTransfer(manager, id);

      if (transfer.status === TransferStatus.RECEIVED) {
        throw ApiError.conflict('transfer.cannotCancelReceived', { no: transfer.transferNo });
      }
      if (transfer.status === TransferStatus.CANCELLED) {
        throw ApiError.conflict('transfer.alreadyCancelled', { no: transfer.transferNo });
      }
      TransferService.assertTransition(transfer, TransferStatus.CANCELLED);
      if (!transfer.createTransactionId) throw ApiError.internal();

      const keepsCommission =
        input.refundCommission === false &&
        transfer.commissionBearer === CommissionBearer.SENDER &&
        money(transfer.commissionAmount).isPositive();

      const transaction = keepsCommission
        ? await LedgerService.post(manager, context, {
            type: TransactionType.TRANSFER_CANCEL,
            sourceType: 'transfer',
            sourceId: transfer.id,
            description: `Transfer ${transfer.transferNo} cancelled (fee retained)`,
            descriptionKey: 'desc.transferCancelledFee',
            descriptionParams: { no: transfer.transferNo },
            reversesTransactionId: transfer.createTransactionId,
            lines: await TransferService.cancellationLines(manager, transfer),
          })
        : await LedgerService.reverse(
            manager,
            context,
            transfer.createTransactionId,
            TransactionType.TRANSFER_CANCEL,
            `Transfer ${transfer.transferNo} cancelled`,
          );

      const previousStatus = transfer.status;
      transfer.status = TransferStatus.CANCELLED;
      transfer.cancelledAt = new Date();
      transfer.cancelledById = context.userId;
      transfer.cancelReason = input.reason;
      transfer.cancelTransactionId = transaction.id;
      await manager.save(Transfer, transfer);

      await TransferService.recordStatus(
        manager,
        context,
        transfer,
        previousStatus,
        TransferStatus.CANCELLED,
        input.reason,
      );

      await AuditService.recordInTransaction(manager, AuditService.actorFromContext(context), {
        action: AUDIT_ACTIONS.TRANSFER_CANCELLED,
        entityType: 'transfer',
        entityId: transfer.id,
        before: { status: previousStatus },
        after: { status: TransferStatus.CANCELLED, reason: input.reason, keepsCommission },
        description: `Transfer ${transfer.transferNo} cancelled`,
        descriptionKey: 'desc.transferCancelled',
        descriptionParams: { no: transfer.transferNo },
      });

      return TransferService.findByIdOrThrow(manager, transfer.id);
    });
  }

  /**
   * Refund lines when the office keeps the fee: the principal goes back to the
   * sender, the commission stays booked as income.
   */
  private static async cancellationLines(
    manager: EntityManager,
    transfer: Transfer,
  ): Promise<PostingLine[]> {
    // The refund retraces the funding leg: money that came over the counter
    // goes back out of that box, money a partner collected goes back to their
    // account - crediting a cash box we never received into would invent cash.
    const senderCorrespondent = transfer.senderCorrespondentId
      ? await CorrespondentService.findByIdOrThrow(manager, transfer.senderCorrespondentId)
      : null;
    const cashBox = senderCorrespondent
      ? null
      : await CashBoxService.findByIdOrThrow(manager, transfer.cashBoxId!);
    const refundChannel: MoneyChannel = senderCorrespondent
      ? {
          accountCode: correspondentAccountCode(senderCorrespondent.code),
          cashBoxId: null,
          correspondentId: senderCorrespondent.id,
          name: senderCorrespondent.nameAr || senderCorrespondent.nameEn,
        }
      : {
          accountCode: cashAccountCode(cashBox!.code),
          cashBoxId: cashBox!.id,
          correspondentId: null,
          name: cashBox!.code,
        };
    const cashAccount = refundChannel.accountCode;
    const principal = money(transfer.amount);
    const crossCurrency = transfer.currencyId !== transfer.payoutCurrencyId;

    if (!crossCurrency) {
      return [
        {
          accountCode: ACCOUNT_CODES.TRANSFERS_PAYABLE,
          customerId: transfer.beneficiaryCustomerId,
          currencyId: transfer.payoutCurrencyId,
          direction: EntryDirection.DEBIT,
          amount: transfer.payoutAmount,
          description: `Cancel payable for ${transfer.transferNo}`,
          descriptionKey: 'desc.cancelPayable',
          descriptionParams: { no: transfer.transferNo },
        },
        {
          accountCode: cashAccount,
          cashBoxId: refundChannel.cashBoxId,
          correspondentId: refundChannel.correspondentId,
          customerId: transfer.senderCustomerId,
          currencyId: transfer.currencyId,
          direction: EntryDirection.CREDIT,
          amount: transfer.payoutAmount,
          description: `Refund to ${transfer.senderName}`,
          descriptionKey: 'desc.refundTo',
          descriptionParams: { name: transfer.senderName },
        },
      ];
    }

    return [
      {
        accountCode: ACCOUNT_CODES.TRANSFERS_PAYABLE,
        customerId: transfer.beneficiaryCustomerId,
        currencyId: transfer.payoutCurrencyId,
        direction: EntryDirection.DEBIT,
        amount: transfer.payoutAmount,
        description: `Cancel payable for ${transfer.transferNo}`,
        descriptionKey: 'desc.cancelPayable',
        descriptionParams: { no: transfer.transferNo },
      },
      {
        accountCode: ACCOUNT_CODES.FX_POSITION,
        currencyId: transfer.payoutCurrencyId,
        direction: EntryDirection.CREDIT,
        amount: transfer.payoutAmount,
        description: `FX unwind for ${transfer.transferNo}`,
        descriptionKey: 'desc.fxUnwind',
        descriptionParams: { no: transfer.transferNo },
      },
      {
        accountCode: ACCOUNT_CODES.FX_POSITION,
        currencyId: transfer.currencyId,
        direction: EntryDirection.DEBIT,
        amount: principal.toString(),
        description: `FX unwind for ${transfer.transferNo}`,
        descriptionKey: 'desc.fxUnwind',
        descriptionParams: { no: transfer.transferNo },
      },
      {
        accountCode: cashAccount,
        cashBoxId: refundChannel.cashBoxId,
        correspondentId: refundChannel.correspondentId,
        customerId: transfer.senderCustomerId,
        currencyId: transfer.currencyId,
        direction: EntryDirection.CREDIT,
        amount: principal.toString(),
        description: `Refund to ${transfer.senderName}`,
        descriptionKey: 'desc.refundTo',
        descriptionParams: { name: transfer.senderName },
      },
    ];
  }

  /** Non-financial corrections, allowed only while the transfer is pending. */
  static async update(
    context: RequestContext,
    id: string,
    input: UpdateTransferInput,
  ): Promise<Transfer> {
    return AppDataSource.transaction(async (manager) => {
      const transfer = await TransferService.lockTransfer(manager, id);
      if (transfer.status !== TransferStatus.PENDING) {
        throw ApiError.conflict('transfer.onlyPendingEditable');
      }

      const before = { ...transfer };
      Object.assign(transfer, {
        senderName: input.senderName?.trim() ?? transfer.senderName,
        senderPhone: input.senderPhone?.trim() ?? transfer.senderPhone,
        beneficiaryName: input.beneficiaryName?.trim() ?? transfer.beneficiaryName,
        beneficiaryPhone: input.beneficiaryPhone?.trim() ?? transfer.beneficiaryPhone,
        beneficiaryCountry: input.beneficiaryCountry?.trim() ?? transfer.beneficiaryCountry,
        beneficiaryCity: input.beneficiaryCity?.trim() ?? transfer.beneficiaryCity,
        notes: input.notes !== undefined ? input.notes : transfer.notes,
      });
      await manager.save(Transfer, transfer);

      await AuditService.recordInTransaction(manager, AuditService.actorFromContext(context), {
        action: AUDIT_ACTIONS.TRANSFER_UPDATED,
        entityType: 'transfer',
        entityId: transfer.id,
        before,
        after: { ...transfer },
        description: `Transfer ${transfer.transferNo} details updated`,
        descriptionKey: 'audit.desc.transferUpdated',
        descriptionParams: { no: transfer.transferNo },
      });

      return TransferService.findByIdOrThrow(manager, transfer.id);
    });
  }

  // ================================================================ reads

  static async list(query: TransferListQuery): Promise<Paginated<Transfer>> {
    const { page, limit, skip, take } = normalizePagination(query);
    const sortBy = safeSort(query.sortBy, SORTABLE, 'createdAt');
    const sortOrder = safeSortOrder(query.sortOrder);

    const builder = TransferService.baseQuery()
      .orderBy(`transfer.${sortBy}`, sortOrder)
      .skip(skip)
      .take(take);

    if (query.status) builder.andWhere('transfer.status = :status', { status: query.status });
    if (query.direction) builder.andWhere('transfer.direction = :direction', { direction: query.direction });
    if (query.currencyId) builder.andWhere('transfer.currency_id = :currencyId', { currencyId: query.currencyId });
    if (query.cashBoxId) {
      builder.andWhere('(transfer.cash_box_id = :cashBoxId OR transfer.payout_cash_box_id = :cashBoxId)', {
        cashBoxId: query.cashBoxId,
      });
    }
    if (query.customerId) {
      builder.andWhere(
        '(transfer.sender_customer_id = :customerId OR transfer.beneficiary_customer_id = :customerId)',
        { customerId: query.customerId },
      );
    }
    if (query.createdById) builder.andWhere('transfer.created_by = :createdById', { createdById: query.createdById });
    if (query.from) builder.andWhere('transfer.created_at >= :from', { from: query.from });
    if (query.to) builder.andWhere('transfer.created_at <= :to', { to: query.to });
    if (query.q) {
      const term = `%${query.q.trim()}%`;
      builder.andWhere(
        '(transfer.transfer_no ILIKE :term OR transfer.sender_name ILIKE :term OR transfer.beneficiary_name ILIKE :term OR transfer.sender_phone ILIKE :term OR transfer.beneficiary_phone ILIKE :term)',
        { term },
      );
    }

    const [items, total] = await builder.getManyAndCount();
    return paginate(items, page, limit, total);
  }

  /**
   * Payout desk search. Only returns transfers that could still be collected,
   * so a cashier never sees a cancelled or already-paid one as a candidate.
   */
  static async lookup(query: TransferLookupQuery): Promise<Transfer[]> {
    if (!query.transferNo && !query.phone && !query.beneficiaryName) {
      throw ApiError.badRequest('error.badRequest');
    }

    const builder = TransferService.baseQuery()
      .andWhere('transfer.status IN (:...statuses)', {
        statuses: [TransferStatus.PENDING, TransferStatus.SENT],
      })
      .orderBy('transfer.created_at', 'DESC')
      .limit(25);

    if (query.transferNo) {
      builder.andWhere('UPPER(transfer.transfer_no) = UPPER(:transferNo)', {
        transferNo: query.transferNo.trim(),
      });
    }
    if (query.phone) {
      builder.andWhere('(transfer.beneficiary_phone ILIKE :phone OR transfer.sender_phone ILIKE :phone)', {
        phone: `%${query.phone.trim()}%`,
      });
    }
    if (query.beneficiaryName) {
      builder.andWhere('transfer.beneficiary_name ILIKE :name', {
        name: `%${query.beneficiaryName.trim()}%`,
      });
    }

    const results = await builder.getMany();
    if (results.length === 0) throw ApiError.notFound('transfer.notFound');
    return results;
  }

  static async findByIdOrThrow(manager: EntityManager, id: string): Promise<Transfer> {
    const transfer = await manager
      .getRepository(Transfer)
      .createQueryBuilder('transfer')
      .leftJoinAndSelect('transfer.currency', 'currency')
      .leftJoinAndSelect('transfer.payoutCurrency', 'payoutCurrency')
      .leftJoinAndSelect('transfer.commissionCurrency', 'commissionCurrency')
      .leftJoinAndSelect('transfer.cashBox', 'cashBox')
      .leftJoinAndSelect('transfer.payoutCashBox', 'payoutCashBox')
      .leftJoinAndSelect('transfer.senderCustomer', 'senderCustomer')
      .leftJoinAndSelect('transfer.beneficiaryCustomer', 'beneficiaryCustomer')
      .leftJoinAndSelect('transfer.createdBy', 'createdBy')
      .where('transfer.id = :id', { id })
      .getOne();

    if (!transfer) throw ApiError.notFound('transfer.notFound');
    return transfer;
  }

  static async history(transferId: string): Promise<TransferStatusHistory[]> {
    return AppDataSource.getRepository(TransferStatusHistory).find({
      where: { transferId },
      relations: { changedBy: true },
      order: { createdAt: 'ASC' },
    });
  }

  private static baseQuery() {
    return AppDataSource.getRepository(Transfer)
      .createQueryBuilder('transfer')
      .leftJoinAndSelect('transfer.currency', 'currency')
      .leftJoinAndSelect('transfer.payoutCurrency', 'payoutCurrency')
      .leftJoinAndSelect('transfer.cashBox', 'cashBox')
      .leftJoinAndSelect('transfer.createdBy', 'createdBy');
  }

  // ============================================================ internals

  /**
   * Loads the row with a write lock. This is what makes concurrent payout
   * attempts on the same transfer serialise instead of both succeeding.
   */
  private static async lockTransfer(manager: EntityManager, id: string): Promise<Transfer> {
    const transfer = await manager
      .getRepository(Transfer)
      .createQueryBuilder('transfer')
      .setLock('pessimistic_write')
      .where('transfer.id = :id', { id })
      .getOne();

    if (!transfer) throw ApiError.notFound('transfer.notFound');
    return transfer;
  }

  private static assertTransition(transfer: Transfer, next: TransferStatus): void {
    const allowed = TRANSFER_TRANSITIONS[transfer.status];
    if (!allowed.includes(next)) {
      throw ApiError.invalidTransition({ from: transfer.status, to: next });
    }
  }

  private static async recordStatus(
    manager: EntityManager,
    context: RequestContext,
    transfer: Transfer,
    from: TransferStatus | null,
    to: TransferStatus,
    reason?: string,
  ): Promise<void> {
    const history = manager.create(TransferStatusHistory, {
      transferId: transfer.id,
      fromStatus: from,
      toStatus: to,
      changedById: context.userId,
      reason: reason ?? null,
    });
    await manager.save(TransferStatusHistory, history);
  }
}
