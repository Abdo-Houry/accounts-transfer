import type { Request, Response } from 'express';
import { AppDataSource } from '../config/data-source';
import { requireContext } from '../middleware';
import { ExchangeService } from '../services/exchange.service';
import { ApiResponse } from '../utils/api-response';
import { money } from '../utils/money';

export const ExchangeController = {
  async list(req: Request, res: Response): Promise<Response> {
    return ApiResponse.paginated(res, await ExchangeService.list(req.query));
  },

  async detail(req: Request, res: Response): Promise<Response> {
    const exchange = await ExchangeService.findByIdOrThrow(AppDataSource.manager, req.params.id);
    return ApiResponse.ok(res, exchange, 'common.fetched');
  },

  async quote(req: Request, res: Response): Promise<Response> {
    return ApiResponse.ok(res, await ExchangeService.quote(req.body), 'exchange.quoteReady');
  },

  async create(req: Request, res: Response): Promise<Response> {
    const exchange = await ExchangeService.create(requireContext(req), req.body);
    return ApiResponse.created(res, exchange, 'exchange.created', {
      no: exchange.exchangeNo,
      fromAmount: money(exchange.fromAmount).toTrimmed(),
      fromCurrency: exchange.fromCurrency?.code ?? '',
      toAmount: money(exchange.toAmount).toTrimmed(),
      toCurrency: exchange.toCurrency?.code ?? '',
    });
  },

  async reverse(req: Request, res: Response): Promise<Response> {
    const exchange = await ExchangeService.reverse(
      requireContext(req),
      req.params.id,
      req.body.reason,
    );
    return ApiResponse.ok(res, exchange, 'exchange.reversed', { no: exchange.exchangeNo });
  },
};
