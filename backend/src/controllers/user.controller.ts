import type { Request, Response } from 'express';
import { requireContext } from '../middleware';
import { UserService } from '../services/user.service';
import { ApiResponse } from '../utils/api-response';

export const UserController = {
  async list(req: Request, res: Response): Promise<Response> {
    return ApiResponse.paginated(res, await UserService.list(req.query));
  },

  async detail(req: Request, res: Response): Promise<Response> {
    return ApiResponse.ok(res, await UserService.findById(req.params.id), 'common.fetched');
  },

  async create(req: Request, res: Response): Promise<Response> {
    const user = await UserService.create(requireContext(req), req.body);
    return ApiResponse.created(res, user, 'user.created', { username: user.username });
  },

  async update(req: Request, res: Response): Promise<Response> {
    const user = await UserService.update(requireContext(req), req.params.id, req.body);
    return ApiResponse.ok(res, user, 'user.updated');
  },

  async setStatus(req: Request, res: Response): Promise<Response> {
    const user = await UserService.setStatus(requireContext(req), req.params.id, req.body.status);
    return ApiResponse.ok(res, user, 'user.updated');
  },

  async resetPassword(req: Request, res: Response): Promise<Response> {
    const result = await UserService.resetPassword(
      requireContext(req),
      req.params.id,
      req.body.newPassword,
    );
    return ApiResponse.ok(res, null, 'auth.passwordReset', { username: result.username });
  },
};
