import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { Language } from '../types/enums';
import { isSupportedLanguage } from '../utils/i18n';

/**
 * Stamps every request with a correlation id and resolves the language used to
 * render messages. Runs before everything else so even a 500 is localised.
 *
 * Precedence: `X-Language` -> `?lang=` -> `Accept-Language` -> default.
 *
 * `X-Language` comes first because browsers forbid a script from setting
 * `Accept-Language` on fetch/XHR - the SPA cannot send its chosen language that
 * way, so a custom header is the only header-based option it has.
 * (An authenticated user's stored language is applied later, in `authenticate`,
 * unless the request asked for something explicitly.)
 */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  req.requestId = (req.header('x-request-id') || crypto.randomUUID()).slice(0, 64);
  res.setHeader('x-request-id', req.requestId);

  const explicit = (req.header('x-language') ?? '').toLowerCase();
  if (isSupportedLanguage(explicit)) {
    req.language = explicit;
    res.setHeader('content-language', explicit);
    return next();
  }

  const queryLang = typeof req.query.lang === 'string' ? req.query.lang.toLowerCase() : undefined;
  if (isSupportedLanguage(queryLang)) {
    req.language = queryLang;
    res.setHeader('content-language', queryLang);
    return next();
  }

  const header = req.header('accept-language') ?? '';
  const preferred = header
    .split(',')
    .map((part) => part.split(';')[0].trim().slice(0, 2).toLowerCase())
    .find((code) => isSupportedLanguage(code));

  req.language = (preferred as Language) ?? (env.DEFAULT_LANGUAGE as Language);
  res.setHeader('content-language', req.language);
  next();
}

/** Best-effort client address, honouring a single trusted proxy hop. */
export function clientIp(req: Request): string {
  const forwarded = req.header('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim().slice(0, 45);
  return (req.ip ?? req.socket.remoteAddress ?? '').slice(0, 45);
}
