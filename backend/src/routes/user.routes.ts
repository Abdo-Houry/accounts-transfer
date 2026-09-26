import { Router } from 'express';
import { UserController } from '../controllers';
import { PERMISSIONS } from '../config/permissions';
import { asyncHandler, requirePermission, validate } from '../middleware';
import { idParam, userValidation } from '../validations';

const router = Router();

router.get(
  '/',
  requirePermission(PERMISSIONS.USER_READ),
  validate(userValidation.listUsersSchema),
  asyncHandler(UserController.list),
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.USER_READ),
  validate({ params: idParam }),
  asyncHandler(UserController.detail),
);

router.post(
  '/',
  requirePermission(PERMISSIONS.USER_CREATE),
  validate(userValidation.createUserSchema),
  asyncHandler(UserController.create),
);

router.patch(
  '/:id',
  requirePermission(PERMISSIONS.USER_UPDATE),
  validate(userValidation.updateUserSchema),
  asyncHandler(UserController.update),
);

router.patch(
  '/:id/status',
  requirePermission(PERMISSIONS.USER_UPDATE),
  validate(userValidation.userStatusSchema),
  asyncHandler(UserController.setStatus),
);

router.post(
  '/:id/reset-password',
  requirePermission(PERMISSIONS.USER_UPDATE),
  validate(userValidation.resetPasswordSchema),
  asyncHandler(UserController.resetPassword),
);

export default router;
