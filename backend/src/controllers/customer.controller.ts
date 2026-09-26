import type { Request, Response } from 'express';
import { AppDataSource } from '../config/data-source';
import { requireContext } from '../middleware';
import { CustomerService } from '../services/customer.service';
import { ApiResponse } from '../utils/api-response';
import { describe, readerLanguage } from '../utils/describe';

export const CustomerController = {
  async list(req: Request, res: Response): Promise<Response> {
    return ApiResponse.paginated(res, await CustomerService.list(req.query));
  },

  async detail(req: Request, res: Response): Promise<Response> {
    const customer = await CustomerService.findByIdOrThrow(AppDataSource.manager, req.params.id);
    return ApiResponse.ok(res, customer, 'common.fetched');
  },

  async statement(req: Request, res: Response): Promise<Response> {
    return ApiResponse.ok(res, await CustomerService.statement(req.params.id), 'common.fetched');
  },

  /** Debit / credit / running balance on the customer's own account. */
  async accountStatement(req: Request, res: Response): Promise<Response> {
    const { currencyId, from, to } = req.query as {
      currencyId?: string;
      from?: Date;
      to?: Date;
    };
    const lines = await CustomerService.accountStatement(req.params.id, { currencyId, from, to });
    const language = readerLanguage(req);
    return ApiResponse.ok(
      res,
      lines.map((line) => ({
        ...line,
        description: describe(language, line),
        descriptionKey: undefined,
        descriptionParams: undefined,
      })),
      'common.fetched',
    );
  },

  async ledger(req: Request, res: Response): Promise<Response> {
    const { page, limit } = req.query as { page?: number; limit?: number };
    return ApiResponse.paginated(res, await CustomerService.ledger(req.params.id, page, limit));
  },

  async create(req: Request, res: Response): Promise<Response> {
    const customer = await CustomerService.create(requireContext(req), req.body);
    return ApiResponse.created(res, customer, 'customer.created', {
      name: customer.fullName,
      no: customer.customerNo,
    });
  },

  async update(req: Request, res: Response): Promise<Response> {
    const customer = await CustomerService.update(requireContext(req), req.params.id, req.body);
    return ApiResponse.ok(res, customer, 'customer.updated');
  },

  async setStatus(req: Request, res: Response): Promise<Response> {
    const customer = await CustomerService.setStatus(
      requireContext(req),
      req.params.id,
      req.body.status,
    );
    return ApiResponse.ok(res, customer, 'customer.updated');
  },
};
