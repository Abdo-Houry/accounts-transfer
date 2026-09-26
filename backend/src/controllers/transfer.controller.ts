import type { Request, Response } from 'express';
import { AppDataSource } from '../config/data-source';
import { requireContext } from '../middleware';
import { TransferService } from '../services/transfer.service';
import { ApiResponse } from '../utils/api-response';
import { money } from '../utils/money';
import { buildQrDataUrl } from '../utils/receipt';

export const TransferController = {
  async list(req: Request, res: Response): Promise<Response> {
    return ApiResponse.paginated(res, await TransferService.list(req.query));
  },

  async detail(req: Request, res: Response): Promise<Response> {
    const transfer = await TransferService.findByIdOrThrow(AppDataSource.manager, req.params.id);
    return ApiResponse.ok(res, transfer, 'common.fetched');
  },

  async lookup(req: Request, res: Response): Promise<Response> {
    return ApiResponse.ok(res, await TransferService.lookup(req.query), 'common.fetched');
  },

  async quote(req: Request, res: Response): Promise<Response> {
    return ApiResponse.ok(res, await TransferService.quote(req.body), 'transfer.quoteReady');
  },

  async create(req: Request, res: Response): Promise<Response> {
    const transfer = await TransferService.create(requireContext(req), req.body);
    return ApiResponse.created(res, transfer, 'transfer.created', {
      no: transfer.transferNo,
      payout: money(transfer.payoutAmount).toTrimmed(),
      currency: transfer.payoutCurrency?.code ?? '',
    });
  },

  async update(req: Request, res: Response): Promise<Response> {
    const transfer = await TransferService.update(requireContext(req), req.params.id, req.body);
    return ApiResponse.ok(res, transfer, 'transfer.updated', { no: transfer.transferNo });
  },

  async send(req: Request, res: Response): Promise<Response> {
    const transfer = await TransferService.send(requireContext(req), req.params.id, req.body.reason);
    return ApiResponse.ok(res, transfer, 'transfer.sent', { no: transfer.transferNo });
  },

  async receive(req: Request, res: Response): Promise<Response> {
    const transfer = await TransferService.receive(requireContext(req), req.params.id, req.body);
    return ApiResponse.ok(res, transfer, 'transfer.received', {
      no: transfer.transferNo,
      beneficiary: transfer.beneficiaryName,
      payout: money(transfer.payoutAmount).toTrimmed(),
      currency: transfer.payoutCurrency?.code ?? '',
    });
  },

  async cancel(req: Request, res: Response): Promise<Response> {
    const transfer = await TransferService.cancel(requireContext(req), req.params.id, req.body);
    return ApiResponse.ok(res, transfer, 'transfer.cancelled', { no: transfer.transferNo });
  },

  async history(req: Request, res: Response): Promise<Response> {
    return ApiResponse.ok(res, await TransferService.history(req.params.id), 'common.fetched');
  },

  /** Printable payload plus a QR the payout desk can scan to pull the transfer up. */
  async receipt(req: Request, res: Response): Promise<Response> {
    const transfer = await TransferService.findByIdOrThrow(AppDataSource.manager, req.params.id);

    const qrCode = await buildQrDataUrl({
      no: transfer.transferNo,
      amount: money(transfer.amount).toTrimmed(),
      currency: transfer.currency?.code ?? '',
      payout: money(transfer.payoutAmount).toTrimmed(),
      payoutCurrency: transfer.payoutCurrency?.code ?? '',
      date: transfer.createdAt.toISOString(),
    });

    return ApiResponse.ok(res, { transfer, qrCode }, 'common.fetched');
  },
};
