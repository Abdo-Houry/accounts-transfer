import type { NextFunction, Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { env } from '../config/env';
import { Language } from '../types/enums';
import { ApiError, ErrorCode } from '../utils/api-error';
import type { FailureBody } from '../utils/api-response';
import { t } from '../utils/i18n';
import { logger } from '../utils/logger';

/** 404 for an unknown path - reaches the handler below as a normal ApiError. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound('error.routeNotFound', { path: req.originalUrl }));
}

/**
 * The single place an error becomes an HTTP response.
 *
 * Two rules make the difference for a financial UI:
 *  - the message is rendered from an i18n key in the caller's language, so the
 *    operator reads "the USD box only holds 500" rather than "500 Internal
 *    Server Error";
 *  - anything that is not a deliberate `ApiError` is logged with its stack and
 *    reported generically, so an internal detail never leaks to the client.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const language = (req.language as Language) ?? Language.AR;

  if (error instanceof ApiError) {
    if (error.statusCode >= 500) {
      logger.error('Operational error escalated', {
        requestId: req.requestId,
        code: error.code,
        messageKey: error.messageKey,
        params: error.params,
        path: req.originalUrl,
        user: req.context?.username,
      });
    } else {
      logger.debug('Request rejected', {
        requestId: req.requestId,
        code: error.code,
        messageKey: error.messageKey,
        path: req.originalUrl,
        user: req.context?.username,
      });
    }

    const body: FailureBody = {
      success: false,
      code: error.code,
      message: t(language, error.messageKey, error.params),
      requestId: req.requestId,
    };
    if (error.details) body.details = error.details;

    res.status(error.statusCode).json(body);
    return;
  }

  // Turn the few database failures that are really user errors into clean ones.
  if (error instanceof QueryFailedError) {
    const driver = error as QueryFailedError & { code?: string; detail?: string };

    if (driver.code === '23505') {
      logger.warn('Unique violation', { requestId: req.requestId, detail: driver.detail });
      res.status(409).json({
        success: false,
        code: ErrorCode.CONFLICT,
        message: t(language, 'error.conflict'),
        requestId: req.requestId,
      } satisfies FailureBody);
      return;
    }

    if (driver.code === '55P03' || driver.code === '40P01') {
      // lock_timeout / deadlock: the money did not move, so it is safe to retry.
      logger.warn('Lock contention', { requestId: req.requestId, code: driver.code });
      res.status(409).json({
        success: false,
        code: ErrorCode.CONFLICT,
        message: t(language, 'error.conflict'),
        requestId: req.requestId,
      } satisfies FailureBody);
      return;
    }
  }

  logger.error('Unhandled error', {
    requestId: req.requestId,
    path: req.originalUrl,
    method: req.method,
    user: req.context?.username,
    error,
  });

  const body: FailureBody = {
    success: false,
    code: ErrorCode.INTERNAL_ERROR,
    message: t(language, 'error.internal'),
    requestId: req.requestId,
  };
  if (!env.isProduction && error instanceof Error) {
    body.details = { name: error.name, message: error.message, stack: error.stack };
  }

  res.status(500).json(body);
}
