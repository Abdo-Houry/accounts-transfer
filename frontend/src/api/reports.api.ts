import { request } from './client';
import { cleanParams } from '@/lib/utils';
import type {
  CashBoxReportRow,
  CommissionReportRow,
  CustomerReportRow,
  DashboardSummary,
  EmployeeReportRow,
  ExchangeReportRow,
  ProfitLossRow,
  RecentActivity,
  ReportEnvelope,
  TransferReportRow,
} from '@/types/api';
import type { ReportPeriod } from '@/types/enums';

export interface ReportParams {
  period?: ReportPeriod;
  from?: string;
  to?: string;
  currencyId?: string;
  cashBoxId?: string;
  createdById?: string;
  customerId?: string;
  status?: string;
  type?: string;
}

const get = <T>(url: string, params: ReportParams) =>
  request<ReportEnvelope<T>>({ url, method: 'GET', params: cleanParams(params) });

export const dashboardApi = {
  summary: (params: ReportParams) =>
    request<DashboardSummary>({
      url: '/dashboard/summary',
      method: 'GET',
      params: cleanParams(params),
    }),

  recentActivity: (limit = 8) =>
    request<RecentActivity>({ url: '/dashboard/recent-activity', method: 'GET', params: { limit } }),
};

export const reportsApi = {
  transfers: (params: ReportParams) => get<TransferReportRow>('/reports/transfers', params),
  exchanges: (params: ReportParams) => get<ExchangeReportRow>('/reports/exchanges', params),
  commissions: (params: ReportParams) => get<CommissionReportRow>('/reports/commissions', params),
  cashBoxes: (params: ReportParams) => get<CashBoxReportRow>('/reports/cash-boxes', params),
  profitLoss: (params: ReportParams) => get<ProfitLossRow>('/reports/profit-loss', params),
  customers: (params: ReportParams) => get<CustomerReportRow>('/reports/customers', params),
  employees: (params: ReportParams) => get<EmployeeReportRow>('/reports/employees', params),
};
