import type { Request, Response } from 'express';
import { DashboardService } from '../services/dashboard.service';
import { ApiResponse } from '../utils/api-response';
import { resolveDateRange } from '../utils/date-range';
import type { ReportPeriod } from '../types/enums';

export const DashboardController = {
  async summary(req: Request, res: Response): Promise<Response> {
    const { period, from, to } = req.query as { period?: ReportPeriod; from?: Date; to?: Date };
    const range = resolveDateRange(period, from?.toISOString(), to?.toISOString());

    return ApiResponse.ok(res, await DashboardService.summary(range), 'dashboard.loaded');
  },

  async recentActivity(req: Request, res: Response): Promise<Response> {
    const { limit } = req.query as { limit?: number };
    return ApiResponse.ok(res, await DashboardService.recentActivity(limit), 'common.fetched');
  },
};
