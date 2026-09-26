import { Router } from 'express';
import { ReportController } from '../controllers';
import { PERMISSIONS } from '../config/permissions';
import { asyncHandler, requirePermission, validate } from '../middleware';
import { reportValidation } from '../validations';

const router = Router();
const withFilters = validate(reportValidation.reportSchema);

router.get(
  '/transfers',
  requirePermission(PERMISSIONS.REPORT_OPERATIONAL),
  withFilters,
  asyncHandler(ReportController.transfers),
);

router.get(
  '/exchanges',
  requirePermission(PERMISSIONS.REPORT_OPERATIONAL),
  withFilters,
  asyncHandler(ReportController.exchanges),
);

router.get(
  '/customers',
  requirePermission(PERMISSIONS.REPORT_OPERATIONAL),
  withFilters,
  asyncHandler(ReportController.customers),
);

router.get(
  '/employees',
  requirePermission(PERMISSIONS.REPORT_OPERATIONAL),
  withFilters,
  asyncHandler(ReportController.employees),
);

router.get(
  '/commissions',
  requirePermission(PERMISSIONS.REPORT_FINANCIAL),
  withFilters,
  asyncHandler(ReportController.commissions),
);

router.get(
  '/cash-boxes',
  requirePermission(PERMISSIONS.REPORT_FINANCIAL),
  withFilters,
  asyncHandler(ReportController.cashBoxes),
);

router.get(
  '/profit-loss',
  requirePermission(PERMISSIONS.REPORT_FINANCIAL),
  withFilters,
  asyncHandler(ReportController.profitLoss),
);

export default router;
