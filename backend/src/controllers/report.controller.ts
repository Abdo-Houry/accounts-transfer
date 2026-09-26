import type { Request, Response } from 'express';
import { ReportService, type ReportFilters } from '../services/report.service';
import { ApiResponse } from '../utils/api-response';
import { resolveDateRange } from '../utils/date-range';
import type { ReportPeriod } from '../types/enums';

function filtersFrom(req: Request): ReportFilters {
  const query = req.query as {
    period?: ReportPeriod;
    from?: Date;
    to?: Date;
    currencyId?: string;
    cashBoxId?: string;
    createdById?: string;
    customerId?: string;
    status?: string;
    type?: string;
  };

  const range = resolveDateRange(query.period, query.from?.toISOString(), query.to?.toISOString());

  return {
    ...range,
    currencyId: query.currencyId,
    cashBoxId: query.cashBoxId,
    createdById: query.createdById,
    customerId: query.customerId,
    status: query.status,
    type: query.type,
  };
}

export const ReportController = {
  async transfers(req: Request, res: Response): Promise<Response> {
    const filters = filtersFrom(req);
    return ApiResponse.ok(
      res,
      { range: filters, rows: await ReportService.transfers(filters) },
      'report.generated',
    );
  },

  async exchanges(req: Request, res: Response): Promise<Response> {
    const filters = filtersFrom(req);
    return ApiResponse.ok(
      res,
      { range: filters, rows: await ReportService.exchanges(filters) },
      'report.generated',
    );
  },

  async commissions(req: Request, res: Response): Promise<Response> {
    const filters = filtersFrom(req);
    return ApiResponse.ok(
      res,
      { range: filters, rows: await ReportService.commissions(filters) },
      'report.generated',
    );
  },

  async cashBoxes(req: Request, res: Response): Promise<Response> {
    const filters = filtersFrom(req);
    return ApiResponse.ok(
      res,
      { range: filters, rows: await ReportService.cashBoxes(filters) },
      'report.generated',
    );
  },

  async profitLoss(req: Request, res: Response): Promise<Response> {
    const filters = filtersFrom(req);
    return ApiResponse.ok(
      res,
      { range: filters, rows: await ReportService.profitLoss(filters) },
      'report.generated',
    );
  },

  async employees(req: Request, res: Response): Promise<Response> {
    const filters = filtersFrom(req);
    return ApiResponse.ok(
      res,
      { range: filters, rows: await ReportService.employees(filters) },
      'report.generated',
    );
  },

  async customers(req: Request, res: Response): Promise<Response> {
    const filters = filtersFrom(req);
    return ApiResponse.ok(
      res,
      { range: filters, rows: await ReportService.customers(filters) },
      'report.generated',
    );
  },
};
