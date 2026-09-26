import { Router } from 'express';
import { ExchangeController } from '../controllers';
import { PERMISSIONS } from '../config/permissions';
import { asyncHandler, requirePermission, validate } from '../middleware';
import { exchangeValidation, idParam } from '../validations';

const router = Router();

router.get(
  '/',
  requirePermission(PERMISSIONS.EXCHANGE_READ),
  validate(exchangeValidation.listExchangesSchema),
  asyncHandler(ExchangeController.list),
);

router.post(
  '/quote',
  requirePermission(PERMISSIONS.EXCHANGE_CREATE),
  validate(exchangeValidation.quoteExchangeSchema),
  asyncHandler(ExchangeController.quote),
);

router.post(
  '/',
  requirePermission(PERMISSIONS.EXCHANGE_CREATE),
  validate(exchangeValidation.createExchangeSchema),
  asyncHandler(ExchangeController.create),
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.EXCHANGE_READ),
  validate({ params: idParam }),
  asyncHandler(ExchangeController.detail),
);

router.post(
  '/:id/reverse',
  requirePermission(PERMISSIONS.EXCHANGE_REVERSE),
  validate(exchangeValidation.reverseExchangeSchema),
  asyncHandler(ExchangeController.reverse),
);

export default router;
