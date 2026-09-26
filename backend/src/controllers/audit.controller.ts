import type { Request, Response } from 'express';
import { AuditService } from '../services/audit.service';
import { ApiError } from '../utils/api-error';
import { ApiResponse } from '../utils/api-response';
import { localiseAuditLog, readerLanguage } from '../utils/describe';

export const AuditController = {
  async list(req: Request, res: Response): Promise<Response> {
    const page = await AuditService.list(req.query);
    const language = readerLanguage(req);
    return ApiResponse.paginated(
      res,
      { ...page, items: page.items.map((item) => localiseAuditLog(language, item)) },
      'audit.fetched',
    );
  },

  async detail(req: Request, res: Response): Promise<Response> {
    const log = await AuditService.findById(req.params.id);
    if (!log) throw ApiError.notFound();
    return ApiResponse.ok(res, localiseAuditLog(readerLanguage(req), log), 'common.fetched');
  },
};
