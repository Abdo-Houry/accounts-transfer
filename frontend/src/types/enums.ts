/** Mirrors backend `src/types/enums.ts`. Values must stay identical. */

export const Language = { AR: 'ar', EN: 'en', TR: 'tr' } as const;
export type Language = (typeof Language)[keyof typeof Language];

export const UserStatus = { ACTIVE: 'active', SUSPENDED: 'suspended' } as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const CustomerStatus = { ACTIVE: 'active', BLOCKED: 'blocked' } as const;
export type CustomerStatus = (typeof CustomerStatus)[keyof typeof CustomerStatus];

export const CashBoxStatus = { ACTIVE: 'active', CLOSED: 'closed' } as const;
export type CashBoxStatus = (typeof CashBoxStatus)[keyof typeof CashBoxStatus];

export const AccountType = {
  ASSET: 'ASSET',
  LIABILITY: 'LIABILITY',
  EQUITY: 'EQUITY',
  REVENUE: 'REVENUE',
  EXPENSE: 'EXPENSE',
} as const;
export type AccountType = (typeof AccountType)[keyof typeof AccountType];

export const EntryDirection = { DEBIT: 'DEBIT', CREDIT: 'CREDIT' } as const;
export type EntryDirection = (typeof EntryDirection)[keyof typeof EntryDirection];

export const TransferDirection = { OUTGOING: 'OUTGOING', INCOMING: 'INCOMING' } as const;
export type TransferDirection = (typeof TransferDirection)[keyof typeof TransferDirection];

export const TransferStatus = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  RECEIVED: 'RECEIVED',
  CANCELLED: 'CANCELLED',
} as const;
export type TransferStatus = (typeof TransferStatus)[keyof typeof TransferStatus];

export const CommissionBearer = { SENDER: 'SENDER', BENEFICIARY: 'BENEFICIARY' } as const;
export type CommissionBearer = (typeof CommissionBearer)[keyof typeof CommissionBearer];

export const PaymentMethod = {
  CASH: 'CASH',
  BANK: 'BANK',
  WALLET: 'WALLET',
  ACCOUNT: 'ACCOUNT',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const ExchangeType = { BUY: 'BUY', SELL: 'SELL' } as const;
export type ExchangeType = (typeof ExchangeType)[keyof typeof ExchangeType];

export const ExchangeStatus = { COMPLETED: 'COMPLETED', REVERSED: 'REVERSED' } as const;
export type ExchangeStatus = (typeof ExchangeStatus)[keyof typeof ExchangeStatus];

export const CommissionOperation = { TRANSFER: 'TRANSFER', EXCHANGE: 'EXCHANGE' } as const;
export type CommissionOperation = (typeof CommissionOperation)[keyof typeof CommissionOperation];

export const CommissionMethod = {
  FIXED: 'FIXED',
  PERCENT: 'PERCENT',
  TIERED: 'TIERED',
} as const;
export type CommissionMethod = (typeof CommissionMethod)[keyof typeof CommissionMethod];

export const TransactionType = {
  TRANSFER_CREATE: 'TRANSFER_CREATE',
  TRANSFER_PAYOUT: 'TRANSFER_PAYOUT',
  TRANSFER_CANCEL: 'TRANSFER_CANCEL',
  EXCHANGE: 'EXCHANGE',
  EXCHANGE_REVERSAL: 'EXCHANGE_REVERSAL',
  RECEIPT_VOUCHER: 'RECEIPT_VOUCHER',
  PAYMENT_VOUCHER: 'PAYMENT_VOUCHER',
  VOUCHER_VOID: 'VOUCHER_VOID',
  CASHBOX_TRANSFER: 'CASHBOX_TRANSFER',
  OPENING_BALANCE: 'OPENING_BALANCE',
  ADJUSTMENT: 'ADJUSTMENT',
} as const;
export type TransactionType = (typeof TransactionType)[keyof typeof TransactionType];

export const VoucherType = { RECEIPT: 'RECEIPT', PAYMENT: 'PAYMENT' } as const;
export type VoucherType = (typeof VoucherType)[keyof typeof VoucherType];

export const CorrespondentStatus = { ACTIVE: 'ACTIVE', SUSPENDED: 'SUSPENDED' } as const;
export type CorrespondentStatus = (typeof CorrespondentStatus)[keyof typeof CorrespondentStatus];

export const VoucherCategory = {
  CUSTOMER_SETTLEMENT: 'CUSTOMER_SETTLEMENT',
  CORRESPONDENT_SETTLEMENT: 'CORRESPONDENT_SETTLEMENT',
  EXPENSE: 'EXPENSE',
  OTHER_INCOME: 'OTHER_INCOME',
  SALARY: 'SALARY',
  RENT: 'RENT',
  UTILITY: 'UTILITY',
  OTHER: 'OTHER',
} as const;
export type VoucherCategory = (typeof VoucherCategory)[keyof typeof VoucherCategory];

export const VoucherStatus = { POSTED: 'POSTED', VOIDED: 'VOIDED' } as const;
export type VoucherStatus = (typeof VoucherStatus)[keyof typeof VoucherStatus];

export const AuditResult = { SUCCESS: 'SUCCESS', FAILURE: 'FAILURE' } as const;
export type AuditResult = (typeof AuditResult)[keyof typeof AuditResult];

export const ReportPeriod = {
  TODAY: 'today',
  WEEK: 'week',
  MONTH: 'month',
  YEAR: 'year',
  CUSTOM: 'custom',
} as const;
export type ReportPeriod = (typeof ReportPeriod)[keyof typeof ReportPeriod];

/** Same lifecycle the backend enforces; used to enable or hide actions. */
export const TRANSFER_TRANSITIONS: Record<TransferStatus, TransferStatus[]> = {
  PENDING: ['SENT', 'CANCELLED'],
  SENT: ['RECEIVED', 'CANCELLED'],
  RECEIVED: [],
  CANCELLED: [],
};
