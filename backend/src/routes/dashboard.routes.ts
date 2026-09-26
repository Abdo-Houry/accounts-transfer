import { Router } from 'express';
import { DashboardController } from '../controllers';
import { PERMISSIONS } from '../config/permissions';
import { asyncHandler, requirePermission, validate } from '../middleware';
import { reportValidation } from '../validations';

const router = Router();

router.get(
  '/summary',
  requirePermission(PERMISSIONS.DASHBOARD_VIEW),
  validate(reportValidation.dashboardSchema),
  asyncHandler(DashboardController.summary),
);

router.get(
  '/recent-activity',
  requirePermission(PERMISSIONS.DASHBOARD_VIEW),
  validate(reportValidation.recentActivitySchema),
  asyncHandler(DashboardController.recentActivity),
);

export default router;
