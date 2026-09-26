import { request, requestPage, requestWithMessage } from './client';
import { cleanParams } from '@/lib/utils';
import type {
  Correspondent,
  CorrespondentPosition,
  StatementLine,
} from '@/types/api';
import type { CorrespondentStatus } from '@/types/enums';

export interface CorrespondentListParams {
  page?: number;
  limit?: number;
  q?: string;
  status?: CorrespondentStatus;
}

export interface CorrespondentPayload {
  code?: string;
  nameAr: string;
  nameEn: string;
  nameTr: string;
  country?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  contactPerson?: string | null;
  notes?: string | null;
}

export const correspondentsApi = {
  list: (params: CorrespondentListParams) =>
    requestPage<Correspondent>({
      url: '/correspondents',
      method: 'GET',
      params: cleanParams(params),
    }),

  /** Every partner's balance per currency, in one call. */
  positions: () =>
    request<CorrespondentPosition[]>({ url: '/correspondents/positions', method: 'GET' }),

  detail: (id: string) =>
    request<CorrespondentPosition>({ url: `/correspondents/${id}`, method: 'GET' }),

  statement: (id: string, params: { currencyId?: string; from?: string; to?: string } = {}) =>
    request<StatementLine[]>({
      url: `/correspondents/${id}/statement`,
      method: 'GET',
      params: cleanParams(params),
    }),

  create: (payload: CorrespondentPayload & { code: string }) =>
    requestWithMessage<Correspondent>({ url: '/correspondents', method: 'POST', data: payload }),

  update: (id: string, payload: Partial<CorrespondentPayload>) =>
    requestWithMessage<Correspondent>({
      url: `/correspondents/${id}`,
      method: 'PATCH',
      data: payload,
    }),

  setStatus: (id: string, status: CorrespondentStatus) =>
    requestWithMessage<Correspondent>({
      url: `/correspondents/${id}/status`,
      method: 'PATCH',
      data: { status },
    }),
};
