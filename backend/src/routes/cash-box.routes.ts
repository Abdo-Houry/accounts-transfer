import { Router } from 'express';
import { CashBoxController } from '../controllers';
import { PERMISSIONS } from '../config/permissions';
import { asyncHandler, requirePermission, validate } from '../middleware';
import { cashBoxValidation, idParam } from '../validations';

const router = Router();

router.get('/', requirePermission(PERMISSIONS.CASHBOX_READ), asyncHandler(CashBoxController.list));

/** Box-to-box movement is declared before `/:id` so it is not swallowed by it. */
router.post(
  '/transfer',
  requirePermission(PERMISSIONS.CASHBOX_TRANSFER),
  validate(cashBoxValidation.cashBoxTransferSchema),
  asyncHandler(CashBoxController.transfer),
);

router.post(
  '/',
  requirePermission(PERMISSIONS.CASHBOX_CREATE),
  validate(cashBoxValidation.createCashBoxSchema),
  asyncHandler(CashBoxController.create),
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.CASHBOX_READ),
  validate({ params: idParam }),
  asyncHandler(CashBoxController.detail),
);

router.get(
  '/:id/balances',
  requirePermission(PERMISSIONS.CASHBOX_READ),
  validate({ params: idParam }),
  asyncHandler(CashBoxController.balances),
);

router.get(
  '/:id/statement',
  requirePermission(PERMISSIONS.CASHBOX_READ),
  validate(cashBoxValidation.statementSchema),
  asyncHandler(CashBoxController.statement),
);

/** Proves the cached balance still equals the ledger (invariant I2). */
router.get(
  '/:id/reconciliation',
  requirePermission(PERMISSIONS.CASHBOX_RECONCILE),
  validate({ params: idParam }),
  asyncHandler(CashBoxController.reconcile),
);

router.patch(
  '/:id',
  requirePermission(PERMISSIONS.CASHBOX_UPDATE),
  validate(cashBoxValidation.updateCashBoxSchema),
  asyncHandler(CashBoxController.update),
);

router.post(
  '/:id/opening-balance',
  requirePermission(PERMISSIONS.CASHBOX_OPENING),
  validate(cashBoxValidation.openingBalanceSchema),
  asyncHandler(CashBoxController.openingBalance),
);

router.post(
  '/:id/close',
  requirePermission(PERMISSIONS.CASHBOX_CLOSE),
  validate({ params: idParam }),
  asyncHandler(CashBoxController.close),
);

export default router;
