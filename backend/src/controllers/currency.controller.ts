import type { Request, Response } from 'express';
import { requireContext } from '../middleware';
import { CurrencyService } from '../services/currency.service';
import { ApiResponse } from '../utils/api-response';
import { money } from '../utils/money';

export const CurrencyController = {
  async list(req: Request, res: Response): Promise<Response> {
    const { includeInactive } = req.query as { includeInactive?: boolean };
    return ApiResponse.ok(res, await CurrencyService.list(Boolean(includeInactive)), 'common.fetched');
  },

  async create(req: Request, res: Response): Promise<Response> {
    const currency = await CurrencyService.create(requireContext(req), req.body);
    return ApiResponse.created(res, currency, 'currency.created', { code: currency.code });
  },

  async update(req: Request, res: Response): Promise<Response> {
    const currency = await CurrencyService.update(requireContext(req), req.params.id, req.body);
    return ApiResponse.ok(res, currency, 'currency.updated');
  },

  async rateBoard(_req: Request, res: Response): Promise<Response> {
    return ApiResponse.ok(res, await CurrencyService.rateBoard(), 'common.fetched');
  },

  async rateHistory(req: Request, res: Response): Promise<Response> {
    const { currencyId, from, to, limit } = req.query as {
      currencyId?: string;
      from?: Date;
      to?: Date;
      limit?: number;
    };
    return ApiResponse.ok(
      res,
      await CurrencyService.rateHistory(currencyId, from, to, limit),
      'common.fetched',
    );
  },

  async setRate(req: Request, res: Response): Promise<Response> {
    const rate = await CurrencyService.setRate(requireContext(req), req.body);
    return ApiResponse.created(res, rate, 'rate.updated', {
      code: rate.currency?.code ?? '',
      buy: money(rate.buyRate).toTrimmed(),
      sell: money(rate.sellRate).toTrimmed(),
    });
  },

  async setRatesBulk(req: Request, res: Response): Promise<Response> {
    const rates = await CurrencyService.setRatesBulk(requireContext(req), req.body.rates);
    return ApiResponse.created(res, rates, 'common.updated');
  },
};
