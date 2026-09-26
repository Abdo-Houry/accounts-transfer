import { request, requestPage, requestWithMessage } from './client';
import { cleanParams } from '@/lib/utils';
import type {
  Account,
  AccountNode,
  BalanceSheet,
  FinancialTransaction,
  IncomeStatement,
  LedgerEntry,
  TrialBalanceRow,
} from '@/types/api';
import type { EntryDirection, TransactionType } from '@/types/enums';

export interface TransactionListParams {
  page?: number;
  limit?: number;
  type?: TransactionType;
  sourceType?: string;
  sourceId?: string;
  referenceNo?: string;
  from?: string;
  to?: string;
}

export interface EntryListParams {
  page?: number;
  limit?: number;
  accountId?: string;
  cashBoxId?: string;
  customerId?: string;
  currencyId?: string;
  direction?: EntryDirection;
  from?: string;
  to?: string;
}

export interface AdjustmentLine {
  accountId?: string;
  accountCode?: string;
  cashBoxId?: string | null;
  customerId?: string | null;
  currencyId: string;
  direction: EntryDirection;
  amount: string;
  description?: string;
}

export const ledgerApi = {
  transactions: (params: TransactionListParams) =>
    requestPage<FinancialTransaction>({
      url: '/ledger/transactions',
      method: 'GET',
      params: cleanParams(params),
    }),

  transactionDetail: (id: string) =>
    request<FinancialTransaction>({ url: `/ledger/transactions/${id}`, method: 'GET' }),

  entries: (params: EntryListParams) =>
    requestPage<LedgerEntry>({ url: '/ledger/entries', method: 'GET', params: cleanParams(params) }),

  accounts: () => request<Account[]>({ url: '/ledger/accounts', method: 'GET' }),

  /** The chart nested by parent - what the tree view renders. */
  accountTree: () => request<AccountNode[]>({ url: '/ledger/account-tree', method: 'GET' }),

  balanceSheet: (params: { asOf?: string } = {}) =>
    request<BalanceSheet>({
      url: '/ledger/balance-sheet',
      method: 'GET',
      params: cleanParams(params),
    }),

  incomeStatement: (params: { period?: string; from?: string; to?: string } = {}) =>
    request<IncomeStatement>({
      url: '/ledger/income-statement',
      method: 'GET',
      params: cleanParams(params),
    }),

  trialBalance: (params: { asOf?: string; currencyId?: string }) =>
    request<TrialBalanceRow[]>({
      url: '/ledger/trial-balance',
      method: 'GET',
      params: cleanParams(params),
    }),

  adjustment: (payload: { description: string; occurredAt?: string; lines: AdjustmentLine[] }) =>
    requestWithMessage<FinancialTransaction>({
      url: '/ledger/adjustment',
      method: 'POST',
      data: payload,
    }),
};
