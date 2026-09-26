import { Router } from 'express';
import { CorrespondentController } from '../controllers';
import { PERMISSIONS } from '../config/permissions';
import { asyncHandler, requirePermission, validate } from '../middleware';
import { correspondentValidation, idParam } from '../validations';

const router = Router();

router.get(
  '/',
  requirePermission(PERMISSIONS.CORRESPONDENT_READ),
  validate(correspondentValidation.listCorrespondentsSchema),
  asyncHandler(CorrespondentController.list),
);

/** Every partner's balance per currency, in one call - the position board. */
router.get(
  '/positions',
  requirePermission(PERMISSIONS.CORRESPONDENT_READ),
  asyncHandler(CorrespondentController.positions),
);

router.post(
  '/',
  requirePermission(PERMISSIONS.CORRESPONDENT_CREATE),
  validate(correspondentValidation.createCorrespondentSchema),
  asyncHandler(CorrespondentController.create),
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.CORRESPONDENT_READ),
  validate({ params: idParam }),
  asyncHandler(CorrespondentController.detail),
);

/** Debit / credit / running balance on the partner's current account. */
router.get(
  '/:id/statement',
  requirePermission(PERMISSIONS.CORRESPONDENT_READ),
  validate(correspondentValidation.correspondentStatementSchema),
  asyncHandler(CorrespondentController.statement),
);

router.patch(
  '/:id',
  requirePermission(PERMISSIONS.CORRESPONDENT_UPDATE),
  validate(correspondentValidation.updateCorrespondentSchema),
  asyncHandler(CorrespondentController.update),
);

router.patch(
  '/:id/status',
  requirePermission(PERMISSIONS.CORRESPONDENT_UPDATE),
  validate(correspondentValidation.correspondentStatusSchema),
  asyncHandler(CorrespondentController.setStatus),
);

export default router;
