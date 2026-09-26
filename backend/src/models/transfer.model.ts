import type {
  CommissionBearer,
  PaymentMethod,
  TransferDirection,
  TransferStatus,
} from '../types/enums';

export interface CreateTransferInput {
  /** Existing customer, or free-text sender details below. */
  senderCustomerId?: string | null;
  senderName: string;
  senderPhone: string;

  beneficiaryCustomerId?: string | null;
  beneficiaryName: string;
  beneficiaryPhone: string;
  beneficiaryCountry: string;
  beneficiaryCity: string;

  currencyId: string;
  amount: string;
  /** Omit to let the commission rules decide. */
  commissionAmount?: string | null;
  commissionBearer?: CommissionBearer;

  /** Defaults to `currencyId` (no conversion). */
  payoutCurrencyId?: string | null;
  /** Omit to use the published cross rate. */
  exchangeRate?: string | null;

  paymentMethod?: PaymentMethod;
  /**
   * The box that took the money in. Optional only because a transfer can be
   * funded by a partner office instead - exactly one of the two is required.
   */
  cashBoxId?: string | null;
  /** The partner office that collected the money abroad, if any. */
  senderCorrespondentId?: string | null;
  /** The partner office that will hand it over abroad, if any. */
  payoutCorrespondentId?: string | null;
  direction?: TransferDirection;
  notes?: string | null;
}

export type TransferQuoteInput = Pick<
  CreateTransferInput,
  'currencyId' | 'amount' | 'commissionAmount' | 'commissionBearer' | 'payoutCurrencyId' | 'exchangeRate'
>;

/** Everything the create screen needs to show before anything is written. */
export interface TransferQuote {
  amount: string;
  commissionAmount: string;
  commissionCurrencyCode: string;
  commissionBearer: CommissionBearer;
  commissionRuleName: string | null;
  exchangeRate: string;
  payoutAmount: string;
  payoutCurrencyCode: string;
  totalCollected: string;
  payInCurrencyCode: string;
  /** `false` plus a reason when the office cannot fund the payout leg today. */
  isCrossCurrency: boolean;
}

export interface UpdateTransferInput {
  senderName?: string;
  senderPhone?: string;
  beneficiaryName?: string;
  beneficiaryPhone?: string;
  beneficiaryCountry?: string;
  beneficiaryCity?: string;
  notes?: string | null;
}

export interface ReceiveTransferInput {
  /** Box that pays the beneficiary. Defaults to the box that took the money in. */
  payoutCashBoxId?: string | null;
  /**
   * Partner office that pays the beneficiary. Defaults to the one chosen when
   * the transfer was created; naming a cash box overrides it.
   */
  payoutCorrespondentId?: string | null;
  /** Recorded for the payout receipt when the beneficiary is not the registered one. */
  receivedByName?: string | null;
  notes?: string | null;
}

export interface CancelTransferInput {
  reason: string;
  /**
   * Only meaningful when the sender paid the commission. When `false` the
   * principal is returned but the office keeps the fee it already earned.
   */
  refundCommission?: boolean;
}

export interface TransferListQuery {
  page?: number;
  limit?: number;
  q?: string;
  status?: TransferStatus;
  direction?: TransferDirection;
  currencyId?: string;
  cashBoxId?: string;
  customerId?: string;
  createdById?: string;
  from?: Date;
  to?: Date;
  sortBy?: string;
  sortOrder?: string;
}

export interface TransferLookupQuery {
  transferNo?: string;
  phone?: string;
  beneficiaryName?: string;
}
