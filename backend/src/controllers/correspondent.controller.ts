import type { Request, Response } from 'express';
import { requireContext } from '../middleware';
import { CorrespondentService } from '../services/correspondent.service';
import { ApiResponse } from '../utils/api-response';
import { describe, readerLanguage } from '../utils/describe';
import type { StatementLine } from '../services/correspondent.service';
import type { Language } from '../types/enums';

/** Statement lines carry a key like any journal row; render before sending. */
function localiseLines(language: Language, lines: StatementLine[]) {
  return lines.map((line) => ({
    ...line,
    description: describe(language, line),
    descriptionKey: undefined,
    descriptionParams: undefined,
  }));
}

export const CorrespondentController = {
  async list(req: Request, res: Response): Promise<Response> {
    return ApiResponse.paginated(
      res,
      await CorrespondentService.list(req.query),
      'correspondent.fetched',
    );
  },

  async detail(req: Request, res: Response): Promise<Response> {
    const [position] = await CorrespondentService.positions(req.params.id);
    return ApiResponse.ok(res, position, 'common.fetched');
  },

  async create(req: Request, res: Response): Promise<Response> {
    const correspondent = await CorrespondentService.create(requireContext(req), req.body);
    return ApiResponse.created(res, correspondent, 'correspondent.created', {
      name: correspondent.nameAr || correspondent.nameEn,
    });
  },

  async update(req: Request, res: Response): Promise<Response> {
    const correspondent = await CorrespondentService.update(
      requireContext(req),
      req.params.id,
      req.body,
    );
    return ApiResponse.ok(res, correspondent, 'correspondent.updated');
  },

  async setStatus(req: Request, res: Response): Promise<Response> {
    const correspondent = await CorrespondentService.setStatus(
      requireContext(req),
      req.params.id,
      req.body.status,
    );
    return ApiResponse.ok(res, correspondent, 'correspondent.statusChanged', {
      status: correspondent.status,
    });
  },

  /** Every partner's standing per currency - the "correspondent position" board. */
  async positions(_req: Request, res: Response): Promise<Response> {
    return ApiResponse.ok(res, await CorrespondentService.positions(), 'common.fetched');
  },

  async statement(req: Request, res: Response): Promise<Response> {
    const { currencyId, from, to } = req.query as {
      currencyId?: string;
      from?: Date;
      to?: Date;
    };
    const lines = await CorrespondentService.statement(req.params.id, { currencyId, from, to });
    return ApiResponse.ok(res, localiseLines(readerLanguage(req), lines), 'common.fetched');
  },
};
