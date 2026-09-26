import { request, requestPage, requestWithMessage } from './client';
import { cleanParams } from '@/lib/utils';
import type { Customer, CustomerStatement, LedgerEntry, StatementLine } from '@/types/api';
import type { CustomerStatus } from '@/types/enums';

export interface CustomerPayload {
  fullName: string;
  phone: string;
  altPhone?: string | null;
  nationalId?: string | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;
  notes?: string | null;
}

export interface CustomerListParams {
  page?: number;
  limit?: number;
  q?: string;
  status?: CustomerStatus;
}

export const customersApi = {
  list: (params: CustomerListParams) =>
    requestPage<Customer>({ url: '/customers', method: 'GET', params: cleanParams(params) }),

  detail: (id: string) => request<Customer>({ url: `/customers/${id}`, method: 'GET' }),

  statement: (id: string) =>
    request<CustomerStatement>({ url: `/customers/${id}/statement`, method: 'GET' }),

  ledger: (id: string, params: { page?: number; limit?: number }) =>
    requestPage<LedgerEntry>({ url: `/customers/${id}/ledger`, method: 'GET', params }),

  create: (payload: CustomerPayload) =>
    requestWithMessage<Customer>({ url: '/customers', method: 'POST', data: payload }),

  update: (id: string, payload: Partial<CustomerPayload>) =>
    requestWithMessage<Customer>({ url: `/customers/${id}`, method: 'PATCH', data: payload }),

  setStatus: (id: string, status: CustomerStatus) =>
    requestWithMessage<Customer>({
      url: `/customers/${id}/status`,
      method: 'PATCH',
      data: { status },
    }),
  /** Debit / credit / running balance on the customer's own account. */
  accountStatement: (id: string, params: { currencyId?: string; from?: string; to?: string } = {}) =>
    request<StatementLine[]>({
      url: `/customers/${id}/account-statement`,
      method: 'GET',
      params: cleanParams(params),
    }),

};
