import type { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { requireContext, clientIp } from '../middleware';
import { AuditService } from '../services/audit.service';
import { ApiResponse } from '../utils/api-response';
import { REFRESH_COOKIE_NAME, refreshCookieOptions } from '../utils/tokens';

function sessionMeta(req: Request) {
  return { ipAddress: clientIp(req), userAgent: req.header('user-agent') ?? '' };
}

export const AuthController = {
  async login(req: Request, res: Response): Promise<Response> {
    const result = await AuthService.login(req.body, sessionMeta(req));

    // The refresh token lives only in an httpOnly cookie: it is never readable
    // by page scripts, so an XSS bug cannot walk away with a long-lived session.
    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, refreshCookieOptions());

    return ApiResponse.ok(
      res,
      { user: result.user, accessToken: result.accessToken, expiresIn: result.expiresIn },
      'auth.loginSuccess',
      { name: result.user.fullName },
    );
  },

  async refresh(req: Request, res: Response): Promise<Response> {
    const token = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    const result = await AuthService.refresh(token ?? '', sessionMeta(req));

    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, refreshCookieOptions());

    return ApiResponse.ok(
      res,
      { user: result.user, accessToken: result.accessToken, expiresIn: result.expiresIn },
      'common.success',
    );
  },

  async logout(req: Request, res: Response): Promise<Response> {
    const context = requireContext(req);
    const token = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;

    await AuthService.logout(token, AuditService.actorFromContext(context));
    res.clearCookie(REFRESH_COOKIE_NAME, { ...refreshCookieOptions(), maxAge: undefined });

    return ApiResponse.ok(res, null, 'auth.logoutSuccess');
  },

  async logoutAll(req: Request, res: Response): Promise<Response> {
    const context = requireContext(req);

    await AuthService.logoutAll(context.userId, AuditService.actorFromContext(context));
    res.clearCookie(REFRESH_COOKIE_NAME, { ...refreshCookieOptions(), maxAge: undefined });

    return ApiResponse.ok(res, null, 'auth.logoutSuccess');
  },

  async me(req: Request, res: Response): Promise<Response> {
    const context = requireContext(req);
    return ApiResponse.ok(res, await AuthService.me(context.userId), 'common.fetched');
  },

  async updateProfile(req: Request, res: Response): Promise<Response> {
    const context = requireContext(req);
    return ApiResponse.ok(
      res,
      await AuthService.updateProfile(context.userId, req.body),
      'common.updated',
    );
  },

  async changePassword(req: Request, res: Response): Promise<Response> {
    const context = requireContext(req);
    const { currentPassword, newPassword } = req.body;

    await AuthService.changePassword(
      context.userId,
      currentPassword,
      newPassword,
      AuditService.actorFromContext(context),
    );
    res.clearCookie(REFRESH_COOKIE_NAME, { ...refreshCookieOptions(), maxAge: undefined });

    return ApiResponse.ok(res, null, 'auth.passwordChanged');
  },
};
