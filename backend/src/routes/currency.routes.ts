import { Router } from 'express';
import { CurrencyController } from '../controllers';
import { PERMISSIONS } from '../config/permissions';
import { asyncHandler, requirePermission, validate } from '../middleware';
import { currencyValidation } from '../validations';

const router = Router();

router.get(
  '/',
  requirePermission(PERMISSIONS.CURRENCY_READ),
  validate(currencyValidation.listCurrenciesSchema),
  asyncHandler(CurrencyController.list),
);

router.post(
  '/',
  requirePermission(PERMISSIONS.CURRENCY_CREATE),
  validate(currencyValidation.createCurrencySchema),
  asyncHandler(CurrencyController.create),
);

router.patch(
  '/:id',
  requirePermission(PERMISSIONS.CURRENCY_UPDATE),
  validate(currencyValidation.updateCurrencySchema),
  asyncHandler(CurrencyController.update),
);

export default router;
