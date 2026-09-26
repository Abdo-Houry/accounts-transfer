import { Router } from 'express';
import { CurrencyController } from '../controllers';
import { PERMISSIONS } from '../config/permissions';
import { asyncHandler, requirePermission, validate } from '../middleware';
import { currencyValidation } from '../validations';

const router = Router();

/** The live board every operation screen prices against. */
router.get(
  '/current',
  requirePermission(PERMISSIONS.CURRENCY_READ),
  asyncHandler(CurrencyController.rateBoard),
);

/** Full history - rates are superseded, never overwritten. */
router.get(
  '/history',
  requirePermission(PERMISSIONS.CURRENCY_READ),
  validate(currencyValidation.rateHistorySchema),
  asyncHandler(CurrencyController.rateHistory),
);

router.post(
  '/',
  requirePermission(PERMISSIONS.RATE_UPDATE),
  validate(currencyValidation.setRateSchema),
  asyncHandler(CurrencyController.setRate),
);

router.post(
  '/bulk',
  requirePermission(PERMISSIONS.RATE_UPDATE),
  validate(currencyValidation.setRatesBulkSchema),
  asyncHandler(CurrencyController.setRatesBulk),
);

export default router;
