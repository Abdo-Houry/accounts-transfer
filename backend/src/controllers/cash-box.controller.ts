import type { Request, Response } from 'express';
import { requireContext } from '../middleware';
import { CashBoxService } from '../services/cash-box.service';
import { AppDataSource } from '../config/data-source';
import { ApiResponse } from '../utils/api-response';
import { localiseEntry, readerLanguage } from '../utils/describe';
import { money } from '../utils/money';

export const CashBoxController = {
  async list(req: Request, res: Response): Promise<Response> {
    const includeClosed = req.query.includeClosed === 'true';
    return ApiResponse.ok(res, await CashBoxService.list(includeClosed), 'common.fetched');
  },

  async detail(req: Request, res: Response): Promise<Response> {
    const box = await CashBoxService.findByIdOrThrow(AppDataSource.manager, req.params.id);
    const balances = await CashBoxService.balances(box.id);
    return ApiResponse.ok(res, { ...box, balances }, 'common.fetched');
  },

  async balances(req: Request, res: Response): Promise<Response> {
    return ApiResponse.ok(res, await CashBoxService.balances(req.params.id), 'common.fetched');
  },

  async create(req: Request, res: Response): Promise<Response> {
    const box = await CashBoxService.create(requireContext(req), req.body);
    return ApiResponse.created(res, box, 'cashbox.created', { name: box.nameAr || box.nameEn });
  },

  async update(req: Request, res: Response): Promise<Response> {
    const box = await CashBoxService.update(requireContext(req), req.params.id, req.body);
    return ApiResponse.ok(res, box, 'cashbox.updated');
  },

  async openingBalance(req: Request, res: Response): Promise<Response> {
    const result = await CashBoxService.setOpeningBalance(
      requireContext(req),
      req.params.id,
      req.body,
    );
    return ApiResponse.created(res, result, 'cashbox.openingBalanceSet', {
      amount: money(result.amount).toTrimmed(),
      currency: result.currency.code,
      name: result.cashBox.nameAr || result.cashBox.nameEn,
    });
  },

  async transfer(req: Request, res: Response): Promise<Response> {
    const result = await CashBoxService.transferBetweenBoxes(requireContext(req), req.body);
    return ApiResponse.created(res, result, 'cashbox.transferDone', {
      amount: money(result.amount).toTrimmed(),
      currency: result.currency.code,
      from: result.from.nameAr || result.from.nameEn,
      to: result.to.nameAr || result.to.nameEn,
    });
  },

  async close(req: Request, res: Response): Promise<Response> {
    const box = await CashBoxService.close(requireContext(req), req.params.id);
    return ApiResponse.ok(res, box, 'cashbox.closed', { name: box.nameAr || box.nameEn });
  },

  async statement(req: Request, res: Response): Promise<Response> {
    const page = await CashBoxService.statement(req.params.id, req.query);
    const language = readerLanguage(req);
    return ApiResponse.paginated(
      res,
      { ...page, items: page.items.map((item) => localiseEntry(language, item)) },
      'common.fetched',
    );
  },

  async reconcile(req: Request, res: Response): Promise<Response> {
    const rows = await CashBoxService.reconcile(req.params.id);
    const mismatches = rows.filter((row) => !row.matches);

    return ApiResponse.ok(
      res,
      { rows, mismatches: mismatches.length, balanced: mismatches.length === 0 },
      mismatches.length === 0 ? 'cashbox.reconciliationOk' : 'cashbox.reconciliationMismatch',
      { count: mismatches.length },
    );
  },
};
