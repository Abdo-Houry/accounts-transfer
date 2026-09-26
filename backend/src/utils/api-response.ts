import type { Response } from 'express';
import { Language } from '../types/enums';
import { t, type MessageParams } from './i18n';
import type { Paginated, PaginationMeta } from '../types/common';

export interface SuccessBody<T> {
  success: true;
  message: string;
  data: T;
  meta?: PaginationMeta | Record<string, unknown>;
}

export interface FailureBody {
  success: false;
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

function resolveLanguage(res: Response): Language {
  return (res.req?.language as Language) ?? Language.AR;
}

function build<T>(res: Response, data: T, messageKey: string, params?: MessageParams): SuccessBody<T> {
  return { success: true, message: t(resolveLanguage(res), messageKey, params), data };
}

/** Centralised success writer - every controller responds through here. */
export const ApiResponse = {
  ok<T>(res: Response, data: T, messageKey = 'common.success', params?: MessageParams): Response {
    return res.status(200).json(build(res, data, messageKey, params));
  },

  created<T>(res: Response, data: T, messageKey = 'common.created', params?: MessageParams): Response {
    return res.status(201).json(build(res, data, messageKey, params));
  },

  noContent(res: Response): Response {
    return res.status(204).send();
  },

  paginated<T>(res: Response, page: Paginated<T>, messageKey = 'common.fetched', params?: MessageParams): Response {
    return res.status(200).json({
      success: true as const,
      message: t(resolveLanguage(res), messageKey, params),
      data: page.items,
      meta: page.meta,
    });
  },
};
