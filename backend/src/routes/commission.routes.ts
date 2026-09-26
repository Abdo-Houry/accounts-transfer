import { Router } from 'express';
import { CommissionController } from '../controllers';
import { PERMISSIONS } from '../config/permissions';
import { asyncHandler, requirePermission, validate } from '../middleware';
import { commissionValidation, idParam } from '../validations';

const router = Router();

router.get(
  '/',
  requirePermission(PERMISSIONS.COMMISSION_READ),
  validate(commissionValidation.listCommissionRulesSchema),
  asyncHandler(CommissionController.list),
);

router.post(
  '/',
  requirePermission(PERMISSIONS.COMMISSION_MANAGE),
  validate(commissionValidation.createCommissionRuleSchema),
  asyncHandler(CommissionController.create),
);

router.patch(
  '/:id',
  requirePermission(PERMISSIONS.COMMISSION_MANAGE),
  validate(commissionValidation.updateCommissionRuleSchema),
  asyncHandler(CommissionController.update),
);

router.delete(
  '/:id',
  requirePermission(PERMISSIONS.COMMISSION_MANAGE),
  validate({ params: idParam }),
  asyncHandler(CommissionController.remove),
);

export default router;
