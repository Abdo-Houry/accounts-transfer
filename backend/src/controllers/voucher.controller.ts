import type { Request, Response } from 'express';
import { AppDataSource } from '../config/data-source';
import { requireContext } from '../middleware';
import { VoucherService } from '../services/voucher.service';
import { ApiResponse } from '../utils/api-response';
import { money } from '../utils/money';

export const VoucherController = {
  async list(req: Request, res: Response): Promise<Response> {
    return ApiResponse.paginated(res, await VoucherService.list(req.query));
  },

  async detail(req: Request, res: Response): Promise<Response> {
    const voucher = await VoucherService.findByIdOrThrow(AppDataSource.manager, req.params.id);
    return ApiResponse.ok(res, voucher, 'common.fetched');
  },

  async createReceipt(req: Request, res: Response): Promise<Response> {
    const voucher = await VoucherService.createReceipt(requireContext(req), req.body);
    return ApiResponse.created(res, voucher, 'voucher.receiptCreated', {
      no: voucher.voucherNo,
      amount: money(voucher.amount).toTrimmed(),
      currency: voucher.currency?.code ?? '',
    });
  },

  async createPayment(req: Request, res: Response): Promise<Response> {
    const voucher = await VoucherService.createPayment(requireContext(req), req.body);
    return ApiResponse.created(res, voucher, 'voucher.paymentCreated', {
      no: voucher.voucherNo,
      amount: money(voucher.amount).toTrimmed(),
      currency: voucher.currency?.code ?? '',
    });
  },

  async void(req: Request, res: Response): Promise<Response> {
    const voucher = await VoucherService.void(requireContext(req), req.params.id, req.body.reason);
    return ApiResponse.ok(res, voucher, 'voucher.voided', { no: voucher.voucherNo });
  },
};
