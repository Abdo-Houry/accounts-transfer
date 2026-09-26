import { Router } from 'express';
import { RoleController } from '../controllers';
import { PERMISSIONS } from '../config/permissions';
import { asyncHandler, requirePermission, validate } from '../middleware';
import { idParam, roleValidation } from '../validations';

const router = Router();

router.get('/', requirePermission(PERMISSIONS.ROLE_READ), asyncHandler(RoleController.list));

router.get(
  '/:id',
  requirePermission(PERMISSIONS.ROLE_READ),
  validate({ params: idParam }),
  asyncHandler(RoleController.detail),
);

router.post(
  '/',
  requirePermission(PERMISSIONS.ROLE_CREATE),
  validate(roleValidation.createRoleSchema),
  asyncHandler(RoleController.create),
);

router.patch(
  '/:id',
  requirePermission(PERMISSIONS.ROLE_UPDATE),
  validate(roleValidation.updateRoleSchema),
  asyncHandler(RoleController.update),
);

router.put(
  '/:id/permissions',
  requirePermission(PERMISSIONS.ROLE_UPDATE),
  validate(roleValidation.setRolePermissionsSchema),
  asyncHandler(RoleController.setPermissions),
);

router.delete(
  '/:id',
  requirePermission(PERMISSIONS.ROLE_DELETE),
  validate({ params: idParam }),
  asyncHandler(RoleController.remove),
);

export default router;
