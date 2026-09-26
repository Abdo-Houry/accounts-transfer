import type { Request, Response } from 'express';
import { requireContext } from '../middleware';
import { CommissionService } from '../services/commission.service';
import { ApiResponse } from '../utils/api-response';

export const CommissionController = {
  async list(req: Request, res: Response): Promise<Response> {
    const { operation } = req.query as { operation?: never };
    return ApiResponse.ok(res, await CommissionService.list(operation), 'common.fetched');
  },

  async create(req: Request, res: Response): Promise<Response> {
    const rule = await CommissionService.create(requireContext(req), req.body);
    return ApiResponse.created(res, rule, 'commission.created', { name: rule.name });
  },

  async update(req: Request, res: Response): Promise<Response> {
    const rule = await CommissionService.update(requireContext(req), req.params.id, req.body);
    return ApiResponse.ok(res, rule, 'commission.updated');
  },

  async remove(req: Request, res: Response): Promise<Response> {
    await CommissionService.remove(requireContext(req), req.params.id);
    return ApiResponse.ok(res, null, 'commission.deleted');
  },
};
