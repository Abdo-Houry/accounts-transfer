import type { NextFunction, Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { Language, UserStatus } from '../types/enums';
import type { RequestContext } from '../types/common';
import { ApiError } from '../utils/api-error';
import { verifyAccessToken } from '../utils/tokens';
import { clientIp } from './request-context.middleware';

/**
 * Verifies the access token and builds the `RequestContext` every service
 * expects.
 *
 * Permissions are resolved from the database on each request rather than read
 * from the token, and `tokenVersion` is compared so that suspending a user,
 * changing their role or resetting their password takes effect immediately
 * instead of at token expiry.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.header('authorization') ?? '';
    const [scheme, token] = header.split(' ');

    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw ApiError.unauthenticated();
    }

    const payload = verifyAccessToken(token);
    const user = await AuthService.loadUserWithPermissions(payload.sub);

    if (!user) throw ApiError.unauthenticated('auth.tokenInvalid');
    if (user.status !== UserStatus.ACTIVE) throw ApiError.unauthenticated('auth.accountSuspended');
    if (user.tokenVersion !== payload.tv) throw ApiError.unauthenticated('auth.tokenInvalid');

    const context: RequestContext = {
      userId: user.id,
      username: user.username,
      roleName: user.role?.name ?? '',
      permissions: new Set((user.role?.permissions ?? []).map((permission) => permission.code)),
      language: req.language as Language,
      ipAddress: clientIp(req),
      userAgent: (req.header('user-agent') ?? '').slice(0, 255),
      defaultCashBoxId: user.defaultCashBoxId,
    };

    req.context = context;

    // Fall back to the user's saved language only when the request did not ask
    // for one explicitly.
    if (!req.header('x-language') && !req.query.lang && !req.header('accept-language')) {
      req.language = user.language;
    }

    next();
  } catch (error) {
    next(error);
  }
}

/** Narrowing helper for controllers: the context is guaranteed after `authenticate`. */
export function requireContext(req: Request): RequestContext {
  if (!req.context) throw ApiError.unauthenticated();
  return req.context;
}
