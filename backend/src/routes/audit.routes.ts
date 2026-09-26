import { Router } from 'express';
import { AuditController } from '../controllers';
import { PERMISSIONS } from '../config/permissions';
import { asyncHandler, requirePermission, validate } from '../middleware';
import { idParam, reportValidation } from '../validations';

const router = Router();

router.get(
  '/',
  requirePermission(PERMISSIONS.AUDIT_READ),
  validate(reportValidation.auditLogSchema),
  asyncHandler(AuditController.list),
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.AUDIT_READ),
  validate({ params: idParam }),
  asyncHandler(AuditController.detail),
);

export default router;
