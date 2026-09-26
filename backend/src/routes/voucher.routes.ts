import { Router } from 'express';
import { VoucherController } from '../controllers';
import { PERMISSIONS } from '../config/permissions';
import { asyncHandler, requirePermission, validate } from '../middleware';
import { idParam, voucherValidation } from '../validations';

const router = Router();

router.get(
  '/',
  requirePermission(PERMISSIONS.VOUCHER_READ),
  validate(voucherValidation.listVouchersSchema),
  asyncHandler(VoucherController.list),
);

/** Money in. */
router.post(
  '/receipt',
  requirePermission(PERMISSIONS.VOUCHER_RECEIPT),
  validate(voucherValidation.createVoucherSchema),
  asyncHandler(VoucherController.createReceipt),
);

/** Money out. */
router.post(
  '/payment',
  requirePermission(PERMISSIONS.VOUCHER_PAYMENT),
  validate(voucherValidation.createVoucherSchema),
  asyncHandler(VoucherController.createPayment),
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.VOUCHER_READ),
  validate({ params: idParam }),
  asyncHandler(VoucherController.detail),
);

router.post(
  '/:id/void',
  requirePermission(PERMISSIONS.VOUCHER_VOID),
  validate(voucherValidation.voidVoucherSchema),
  asyncHandler(VoucherController.void),
);

export default router;
