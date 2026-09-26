/** Domain enumerations shared by entities, services and validations. */

export enum Language {
  AR = 'ar',
  EN = 'en',
  TR = 'tr',
}

export enum UserStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}

export enum CustomerStatus {
  ACTIVE = 'active',
  BLOCKED = 'blocked',
}

export enum CashBoxStatus {
  ACTIVE = 'active',
  CLOSED = 'closed',
}

/** Accounting classification of a chart-of-accounts node. */
export enum AccountType {
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  EQUITY = 'EQUITY',
  REVENUE = 'REVENUE',
  EXPENSE = 'EXPENSE',
}

/** The side that increases an account. */
export enum EntryDirection {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

export enum TransferDirection {
  OUTGOING = 'OUTGOING',
  INCOMING = 'INCOMING',
}

export enum TransferStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  RECEIVED = 'RECEIVED',
  CANCELLED = 'CANCELLED',
}

/**
 * The only legal transitions. Anything not listed here is rejected by
 * `TransferService` with `INVALID_STATUS_TRANSITION` - the UI cannot widen it.
 */
export const TRANSFER_TRANSITIONS: Readonly<Record<TransferStatus, readonly TransferStatus[]>> =
  Object.freeze({
    [TransferStatus.PENDING]: [TransferStatus.SENT, TransferStatus.CANCELLED] as const,
    [TransferStatus.SENT]: [TransferStatus.RECEIVED, TransferStatus.CANCELLED] as const,
    [TransferStatus.RECEIVED]: [] as const,
    [TransferStatus.CANCELLED]: [] as const,
  });

export enum CommissionBearer {
  SENDER = 'SENDER',
  BENEFICIARY = 'BENEFICIARY',
}

export enum PaymentMethod {
  CASH = 'CASH',
  BANK = 'BANK',
  WALLET = 'WALLET',
  ACCOUNT = 'ACCOUNT',
}

/** BUY / SELL are always stated from the office point of view. */
export enum ExchangeType {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum ExchangeStatus {
  COMPLETED = 'COMPLETED',
  REVERSED = 'REVERSED',
}

export enum CommissionOperation {
  TRANSFER = 'TRANSFER',
  EXCHANGE = 'EXCHANGE',
}

export enum CommissionMethod {
  FIXED = 'FIXED',
  PERCENT = 'PERCENT',
  TIERED = 'TIERED',
}

export enum TransactionType {
  TRANSFER_CREATE = 'TRANSFER_CREATE',
  TRANSFER_PAYOUT = 'TRANSFER_PAYOUT',
  TRANSFER_CANCEL = 'TRANSFER_CANCEL',
  EXCHANGE = 'EXCHANGE',
  EXCHANGE_REVERSAL = 'EXCHANGE_REVERSAL',
  RECEIPT_VOUCHER = 'RECEIPT_VOUCHER',
  PAYMENT_VOUCHER = 'PAYMENT_VOUCHER',
  VOUCHER_VOID = 'VOUCHER_VOID',
  CASHBOX_TRANSFER = 'CASHBOX_TRANSFER',
  OPENING_BALANCE = 'OPENING_BALANCE',
  ADJUSTMENT = 'ADJUSTMENT',
}

export enum VoucherType {
  RECEIPT = 'RECEIPT',
  PAYMENT = 'PAYMENT',
}

/** A partner office is either trading with us or frozen. */
export enum CorrespondentStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export enum VoucherCategory {
  CUSTOMER_SETTLEMENT = 'CUSTOMER_SETTLEMENT',
  /** Cash paid to, or received from, a partner office to square its account. */
  CORRESPONDENT_SETTLEMENT = 'CORRESPONDENT_SETTLEMENT',
  EXPENSE = 'EXPENSE',
  OTHER_INCOME = 'OTHER_INCOME',
  SALARY = 'SALARY',
  RENT = 'RENT',
  UTILITY = 'UTILITY',
  OTHER = 'OTHER',
}

export enum VoucherStatus {
  POSTED = 'POSTED',
  VOIDED = 'VOIDED',
}

export enum AuditResult {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
}

/** Reporting period shortcuts accepted by the dashboard and report endpoints. */
export enum ReportPeriod {
  TODAY = 'today',
  WEEK = 'week',
  MONTH = 'month',
  YEAR = 'year',
  CUSTOM = 'custom',
}
