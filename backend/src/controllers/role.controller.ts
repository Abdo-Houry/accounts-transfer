import type { Request, Response } from 'express';
import { requireContext } from '../middleware';
import { RoleService } from '../services/role.service';
import { ApiResponse } from '../utils/api-response';

export const RoleController = {
  async listPermissions(_req: Request, res: Response): Promise<Response> {
    return ApiResponse.ok(res, await RoleService.listPermissions(), 'common.fetched');
  },

  async list(_req: Request, res: Response): Promise<Response> {
    return ApiResponse.ok(res, await RoleService.list(), 'common.fetched');
  },

  async detail(req: Request, res: Response): Promise<Response> {
    return ApiResponse.ok(res, await RoleService.findById(req.params.id), 'common.fetched');
  },

  async create(req: Request, res: Response): Promise<Response> {
    const role = await RoleService.create(requireContext(req), req.body);
    return ApiResponse.created(res, role, 'role.created', { name: role.name });
  },

  async update(req: Request, res: Response): Promise<Response> {
    const role = await RoleService.update(requireContext(req), req.params.id, req.body);
    return ApiResponse.ok(res, role, 'role.updated');
  },

  async setPermissions(req: Request, res: Response): Promise<Response> {
    const role = await RoleService.setPermissions(
      requireContext(req),
      req.params.id,
      req.body.permissionCodes,
    );
    return ApiResponse.ok(res, role, 'role.permissionsUpdated');
  },

  async remove(req: Request, res: Response): Promise<Response> {
    await RoleService.remove(requireContext(req), req.params.id);
    return ApiResponse.ok(res, null, 'role.deleted');
  },
};
