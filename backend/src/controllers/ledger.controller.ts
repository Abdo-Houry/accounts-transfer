import type { Request, Response } from 'express';
import { requireContext } from '../middleware';
import { FinancialStatementService } from '../services/financial-statement.service';
import { LedgerQueryService } from '../services/ledger-query.service';
import { ApiResponse } from '../utils/api-response';
import { resolveDateRange } from '../utils/date-range';
import type { ReportPeriod } from '../types/enums';
import { localiseEntry, localiseTransaction, readerLanguage } from '../utils/describe';

export const LedgerController = {
  async transactions(req: Request, res: Response): Promise<Response> {
    const page = await LedgerQueryService.transactions(req.query);
    const language = readerLanguage(req);
    return ApiResponse.paginated(res, {
      ...page,
      items: page.items.map((item) => localiseTransaction(language, item)),
    });
  },

  async transactionDetail(req: Request, res: Response): Promise<Response> {
    const transaction = await LedgerQueryService.transactionDetail(req.params.id);
    return ApiResponse.ok(
      res,
      localiseTransaction(readerLanguage(req), transaction),
      'common.fetched',
    );
  },

  async entries(req: Request, res: Response): Promise<Response> {
    const page = await LedgerQueryService.entries(req.query);
    const language = readerLanguage(req);
    return ApiResponse.paginated(res, {
      ...page,
      items: page.items.map((item) => localiseEntry(language, item)),
    });
  },

  async accounts(_req: Request, res: Response): Promise<Response> {
    return ApiResponse.ok(res, await LedgerQueryService.chartOfAccounts(), 'common.fetched');
  },

  /** The same chart, nested by parent - what the tree view renders. */
  async accountTree(_req: Request, res: Response): Promise<Response> {
    return ApiResponse.ok(res, await FinancialStatementService.accountTree(), 'common.fetched');
  },

  async balanceSheet(req: Request, res: Response): Promise<Response> {
    const { asOf } = req.query as { asOf?: Date };
    return ApiResponse.ok(
      res,
      await FinancialStatementService.balanceSheet(asOf ?? new Date()),
      'report.generated',
    );
  },

  async incomeStatement(req: Request, res: Response): Promise<Response> {
    const query = req.query as { period?: ReportPeriod; from?: Date; to?: Date };
    const range = resolveDateRange(query.period, query.from?.toISOString(), query.to?.toISOString());
    return ApiResponse.ok(
      res,
      await FinancialStatementService.incomeStatement(range.from, range.to),
      'report.generated',
    );
  },

  async trialBalance(req: Request, res: Response): Promise<Response> {
    const { asOf, currencyId } = req.query as { asOf?: Date; currencyId?: string };
    return ApiResponse.ok(
      res,
      await LedgerQueryService.trialBalance(asOf, currencyId),
      'report.generated',
    );
  },

  async adjustment(req: Request, res: Response): Promise<Response> {
    const transaction = await LedgerQueryService.postAdjustment(requireContext(req), req.body);
    return ApiResponse.created(
      res,
      localiseTransaction(readerLanguage(req), transaction),
      'ledger.adjustmentPosted',
      { no: transaction.referenceNo },
    );
  },
};
