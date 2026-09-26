import type {
  AccountType,
  CashBoxStatus,
  CommissionBearer,
  CommissionMethod,
  CommissionOperation,
  CorrespondentStatus,
  CustomerStatus,
  EntryDirection,
  ExchangeStatus,
  ExchangeType,
  Language,
  PaymentMethod,
  TransactionType,
  TransferDirection,
  TransferStatus,
  UserStatus,
  VoucherCategory,
  VoucherStatus,
  VoucherType,
  AuditResult,
} from './enums';

// ---------------------------------------------------------------- envelope

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
  meta?: PaginationMeta;
}

export interface FieldIssue {
  path: string;
  message: string;
  code?: string;
}

export interface ApiFailure {
  success: false;
  code: string;
  message: string;
  details?: FieldIssue[] | Record<string, unknown>;
  requestId?: string;
}

export interface PageResult<T> {
  items: T[];
  meta: PaginationMeta;
}

/** Amounts are always strings - see the money note in the backend architecture. */
export type Decimal = string;

// ------------------------------------------------------------------ domain

export interface Permission {
  id: string;
  code: string;
  module: string;
  description: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions?: Permission[];
}

export interface CurrentUser {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  language: Language;
  status: UserStatus;
  role: { id: string; name: string; description: string };
  permissions: string[];
  defaultCashBoxId: string | null;
  lastLoginAt: string | null;
}

export interface User {
  id: string;
  username: string;
  email: string | null;
  fullName: string;
  phone: string | null;
  roleId: string;
  role?: Role;
  defaultCashBoxId: string | null;
  defaultCashBox?: CashBox | null;
  language: Language;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Currency {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  nameTr: string;
  symbol: string;
  decimalPlaces: number;
  isBase: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface ExchangeRate {
  id: string;
  currencyId: string;
  currency?: Currency;
  buyRate: Decimal;
  sellRate: Decimal;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  previousRateId: string | null;
  createdBy?: User;
  note: string;
  createdAt: string;
}

export interface RateBoardRow {
  currency: Currency;
  rate: ExchangeRate | null;
}

export interface CashBox {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  nameTr: string;
  branch: string | null;
  status: CashBoxStatus;
  allowsNegative: boolean;
  description: string;
  closedAt: string | null;
  createdAt: string;
  balances?: CashBoxBalance[];
}

export interface CashBoxBalance {
  id: string;
  cashBoxId: string;
  cashBox?: CashBox;
  currencyId: string;
  currency: Currency;
  balance: Decimal;
  version: number;
  updatedAt: string;
}

export interface ReconciliationRow {
  currencyId: string;
  currencyCode: string;
  recordedBalance: Decimal;
  ledgerBalance: Decimal;
  difference: Decimal;
  matches: boolean;
}

export interface ReconciliationResult {
  rows: ReconciliationRow[];
  mismatches: number;
  balanced: boolean;
}

export interface Customer {
  id: string;
  customerNo: string;
  fullName: string;
  phone: string;
  altPhone: string | null;
  nationalId: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
  notes: string | null;
  status: CustomerStatus;
  createdAt: string;
}

export interface Account {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  nameTr: string;
  type: AccountType;
  normalBalance: EntryDirection;
  parentId: string | null;
  cashBoxId: string | null;
  isSystem: boolean;
  isActive: boolean;
}

export interface Transfer {
  id: string;
  transferNo: string;
  direction: TransferDirection;
  status: TransferStatus;

  senderCustomerId: string | null;
  senderCustomer?: Customer | null;
  senderName: string;
  senderPhone: string;

  beneficiaryCustomerId: string | null;
  beneficiaryCustomer?: Customer | null;
  beneficiaryName: string;
  beneficiaryPhone: string;
  beneficiaryCountry: string;
  beneficiaryCity: string;

  currencyId: string;
  currency?: Currency;
  amount: Decimal;
  commissionAmount: Decimal;
  commissionCurrencyId: string;
  commissionCurrency?: Currency;
  commissionBearer: CommissionBearer;
  payoutCurrencyId: string;
  payoutCurrency?: Currency;
  exchangeRate: Decimal;
  payoutAmount: Decimal;
  totalCollected: Decimal;
  paymentMethod: PaymentMethod;

  cashBoxId: string;
  cashBox?: CashBox;
  payoutCashBoxId: string | null;
  payoutCashBox?: CashBox | null;

  createdBy?: User;
  sentAt: string | null;
  receivedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransferQuote {
  amount: Decimal;
  commissionAmount: Decimal;
  commissionCurrencyCode: string;
  commissionBearer: CommissionBearer;
  commissionRuleName: string | null;
  exchangeRate: Decimal;
  payoutAmount: Decimal;
  payoutCurrencyCode: string;
  totalCollected: Decimal;
  payInCurrencyCode: string;
  isCrossCurrency: boolean;
}

export interface TransferStatusHistory {
  id: string;
  transferId: string;
  fromStatus: TransferStatus | null;
  toStatus: TransferStatus;
  changedBy?: User;
  reason: string | null;
  createdAt: string;
}

export interface TransferReceipt {
  transfer: Transfer;
  qrCode: string | null;
}

export interface CurrencyExchange {
  id: string;
  exchangeNo: string;
  type: ExchangeType;
  customerId: string | null;
  customer?: Customer | null;
  customerName: string | null;
  customerPhone: string | null;
  fromCurrencyId: string;
  fromCurrency?: Currency;
  fromAmount: Decimal;
  toCurrencyId: string;
  toCurrency?: Currency;
  toAmount: Decimal;
  rate: Decimal;
  commissionAmount: Decimal;
  cashBoxId: string;
  cashBox?: CashBox;
  status: ExchangeStatus;
  createdBy?: User;
  reversedAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface ExchangeQuote {
  type: ExchangeType;
  fromCurrencyCode: string;
  fromAmount: Decimal;
  toCurrencyCode: string;
  grossToAmount: Decimal;
  commissionAmount: Decimal;
  toAmount: Decimal;
  rate: Decimal;
  buyRateUsed: Decimal;
  sellRateUsed: Decimal;
}

export interface Voucher {
  id: string;
  voucherNo: string;
  type: VoucherType;
  amount: Decimal;
  currencyId: string;
  currency?: Currency;
  cashBoxId: string;
  cashBox?: CashBox;
  customerId: string | null;
  customer?: Customer | null;
  counterpartyName: string | null;
  category: VoucherCategory;
  reason: string;
  status: VoucherStatus;
  createdBy?: User;
  voidedAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CommissionRule {
  id: string;
  name: string;
  operation: CommissionOperation;
  currencyId: string | null;
  currency?: Currency | null;
  method: CommissionMethod;
  fixedAmount: Decimal | null;
  percent: Decimal | null;
  minAmount: Decimal | null;
  maxAmount: Decimal | null;
  fromAmount: Decimal | null;
  toAmount: Decimal | null;
  priority: number;
  isActive: boolean;
}

export interface FinancialTransaction {
  id: string;
  referenceNo: string;
  type: TransactionType;
  sourceType: string;
  sourceId: string | null;
  description: string;
  occurredAt: string;
  reversesTransactionId: string | null;
  isReversed: boolean;
  createdBy?: User;
  createdAt: string;
  entries?: LedgerEntry[];
}

export interface LedgerEntry {
  id: string;
  transactionId: string;
  transaction?: FinancialTransaction;
  lineNo: number;
  accountId: string;
  account?: Account;
  cashBoxId: string | null;
  cashBox?: CashBox | null;
  customerId: string | null;
  customer?: Customer | null;
  currencyId: string;
  currency: Currency;
  direction: EntryDirection;
  amount: Decimal;
  baseAmount: Decimal;
  baseRate: Decimal;
  description: string;
  createdAt: string;
}

export interface TrialBalanceRow {
  accountId: string;
  accountCode: string;
  accountNameAr: string;
  accountNameEn: string;
  accountNameTr: string;
  currencyId: string;
  currencyCode: string;
  debit: Decimal;
  credit: Decimal;
  balance: Decimal;
}

export interface AuditLog {
  id: string;
  userId: string | null;
  user?: User | null;
  username: string;
  /** Stable, searchable identifier, e.g. `transfer.receive`. */
  action: string;
  /** The same action rendered in the caller's language. */
  actionLabel: string;
  entityType: string | null;
  /** The entity type rendered in the caller's language. */
  entityLabel: string | null;
  entityId: string | null;
  result: AuditResult;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  description: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
}

export interface Correspondent {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  nameTr: string;
  country: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  contactPerson: string | null;
  notes: string | null;
  status: CorrespondentStatus;
  accountId: string;
  account?: Account;
  createdAt: string;
}

/** One currency's standing with a partner office. */
export interface CorrespondentPositionRow {
  currencyId: string;
  currencyCode: string;
  decimalPlaces: number;
  debit: Decimal;
  credit: Decimal;
  /** Positive: they hold funds for us. Negative: we owe them. */
  balance: Decimal;
}

export interface CorrespondentPosition {
  correspondent: Correspondent;
  rows: CorrespondentPositionRow[];
}

/** A statement row: one movement plus the balance it left behind. */
export interface StatementLine {
  entryId: string;
  occurredAt: string;
  referenceNo: string;
  description: string;
  currencyId: string;
  currencyCode: string;
  decimalPlaces: number;
  debit: Decimal;
  credit: Decimal;
  balance: Decimal;
}

/** The chart of accounts, nested by parent. */
export interface AccountNode {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  nameTr: string;
  type: AccountType;
  normalBalance: EntryDirection;
  isActive: boolean;
  children: AccountNode[];
}

export interface StatementSectionRow {
  accountCode: string;
  accountNameAr: string;
  accountNameEn: string;
  accountNameTr: string;
  /** currency code -> signed amount in the account's natural direction. */
  amounts: Record<string, Decimal>;
}

export interface StatementSection {
  key: string;
  rows: StatementSectionRow[];
  totals: Record<string, Decimal>;
}

export interface BalanceSheet {
  asOf: string;
  currencies: string[];
  assets: StatementSection;
  liabilities: StatementSection;
  equity: StatementSection;
  retainedResult: Record<string, Decimal>;
  totalAssets: Record<string, Decimal>;
  totalLiabilitiesAndEquity: Record<string, Decimal>;
  /** Per currency: whether assets equal liabilities plus equity. */
  balanced: Record<string, boolean>;
}

export interface IncomeStatement {
  from: string;
  to: string;
  currencies: string[];
  revenue: StatementSection;
  expenses: StatementSection;
  netResult: Record<string, Decimal>;
}

export interface CustomerStatement {
  customer: Customer;
  transfersSent: Transfer[];
  transfersReceived: Transfer[];
  exchanges: CurrencyExchange[];
  vouchers: Voucher[];
  /**
   * Movement on the customer control accounts (1100 / 2100) per currency.
   * `net` is positive when the office owes the customer.
   */
  balances: Array<{
    currencyId: string;
    currencyCode: string;
    decimalPlaces: number;
    debit: Decimal;
    credit: Decimal;
    net: Decimal;
  }>;
}

// -------------------------------------------------------------- dashboard

export interface CurrencyTotal {
  currencyId: string;
  currencyCode: string;
  amount: Decimal;
  count: number;
}

export interface CashBoxBalanceSummary {
  cashBoxId: string;
  cashBoxCode: string;
  cashBoxNameAr: string;
  cashBoxNameEn: string;
  cashBoxNameTr: string;
  currencyId: string;
  currencyCode: string;
  balance: Decimal;
}

export interface DailyPoint {
  date: string;
  transfers: number;
  exchanges: number;
}

export interface DashboardSummary {
  range: { from: string; to: string };
  transfers: {
    total: number;
    pending: number;
    sent: number;
    received: number;
    cancelled: number;
    volumeByCurrency: CurrencyTotal[];
  };
  exchanges: { total: number; volumeByCurrency: CurrencyTotal[] };
  commissions: CurrencyTotal[];
  vouchers: { receiptsByCurrency: CurrencyTotal[]; paymentsByCurrency: CurrencyTotal[] };
  cashBoxBalances: CashBoxBalanceSummary[];
  currencyTotals: CurrencyTotal[];
  topCurrencies: CurrencyTotal[];
  trend: DailyPoint[];
}

export interface RecentActivity {
  transfers: Transfer[];
  exchanges: CurrencyExchange[];
  vouchers: Voucher[];
}

// ----------------------------------------------------------------- reports

export interface ReportEnvelope<T> {
  range: { from: string; to: string };
  rows: T[];
}

export interface TransferReportRow {
  currencyCode: string;
  status: string;
  count: number;
  amount: Decimal;
  commission: Decimal;
  payoutAmount: Decimal;
}

export interface ExchangeReportRow {
  type: string;
  fromCurrency: string;
  toCurrency: string;
  count: number;
  fromAmount: Decimal;
  toAmount: Decimal;
  commission: Decimal;
}

export interface CommissionReportRow {
  currencyCode: string;
  source: string;
  count: number;
  amount: Decimal;
}

export interface CashBoxReportRow {
  cashBoxCode: string;
  cashBoxNameAr: string;
  cashBoxNameEn: string;
  cashBoxNameTr: string;
  currencyCode: string;
  openingBalance: Decimal;
  inflow: Decimal;
  outflow: Decimal;
  closingBalance: Decimal;
}

export interface ProfitLossRow {
  accountCode: string;
  accountNameAr: string;
  accountNameEn: string;
  accountNameTr: string;
  type: AccountType;
  currencyCode: string;
  amount: Decimal;
}

export interface EmployeeReportRow {
  userId: string;
  username: string;
  fullName: string;
  transfersCreated: number;
  transfersPaid: number;
  exchanges: number;
  vouchers: number;
}

export interface CustomerReportRow {
  customerId: string;
  customerNo: string;
  fullName: string;
  phone: string;
  transfers: number;
  exchanges: number;
  currencyCode: string | null;
  volume: Decimal;
}
