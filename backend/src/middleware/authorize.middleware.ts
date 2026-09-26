import type { NextFunction, Request, Response } from 'express';
import type { PermissionCode } from '../config/permissions';
import { ApiError } from '../utils/api-error';

/**
 * Permission gate. The frontend hides buttons it should not show, but *this* is
 * what actually protects the operation - a hand-crafted request is rejected
 * here regardless of what the UI displayed.
 *
 * `requirePermission(a, b)` demands all of them; use `requireAnyPermission` for
 * an either/or route.
 */
export function requirePermission(...required: PermissionCode[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.context) return next(ApiError.unauthenticated());

    const missing = required.find((permission) => !req.context!.permissions.has(permission));
    if (missing) return next(ApiError.forbidden(missing));

    next();
  };
}

export function requireAnyPermission(...accepted: PermissionCode[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.context) return next(ApiError.unauthenticated());

    const granted = accepted.some((permission) => req.context!.permissions.has(permission));
    if (!granted) return next(ApiError.forbidden(accepted.join(' | ')));

    next();
  };
}
