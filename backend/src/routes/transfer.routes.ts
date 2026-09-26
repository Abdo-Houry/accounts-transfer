import { Router } from 'express';
import { TransferController } from '../controllers';
import { PERMISSIONS } from '../config/permissions';
import { asyncHandler, requirePermission, validate } from '../middleware';
import { idParam, transferValidation } from '../validations';

const router = Router();

router.get(
  '/',
  requirePermission(PERMISSIONS.TRANSFER_READ),
  validate(transferValidation.listTransfersSchema),
  asyncHandler(TransferController.list),
);

/**
 * Payout-desk search. Placed before `/:id` so `lookup` is not read as an id,
 * and gated on `transfer.receive` because it is the first step of paying out.
 */
router.get(
  '/lookup',
  requirePermission(PERMISSIONS.TRANSFER_RECEIVE),
  validate(transferValidation.lookupTransferSchema),
  asyncHandler(TransferController.lookup),
);

/** Dry run: prices the deal and writes nothing. */
router.post(
  '/quote',
  requirePermission(PERMISSIONS.TRANSFER_CREATE),
  validate(transferValidation.quoteTransferSchema),
  asyncHandler(TransferController.quote),
);

router.post(
  '/',
  requirePermission(PERMISSIONS.TRANSFER_CREATE),
  validate(transferValidation.createTransferSchema),
  asyncHandler(TransferController.create),
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.TRANSFER_READ),
  validate({ params: idParam }),
  asyncHandler(TransferController.detail),
);

router.get(
  '/:id/history',
  requirePermission(PERMISSIONS.TRANSFER_READ),
  validate({ params: idParam }),
  asyncHandler(TransferController.history),
);

router.get(
  '/:id/receipt',
  requirePermission(PERMISSIONS.TRANSFER_READ),
  validate({ params: idParam }),
  asyncHandler(TransferController.receipt),
);

router.patch(
  '/:id',
  requirePermission(PERMISSIONS.TRANSFER_UPDATE),
  validate(transferValidation.updateTransferSchema),
  asyncHandler(TransferController.update),
);

router.post(
  '/:id/send',
  requirePermission(PERMISSIONS.TRANSFER_SEND),
  validate(transferValidation.sendTransferSchema),
  asyncHandler(TransferController.send),
);

router.post(
  '/:id/receive',
  requirePermission(PERMISSIONS.TRANSFER_RECEIVE),
  validate(transferValidation.receiveTransferSchema),
  asyncHandler(TransferController.receive),
);

router.post(
  '/:id/cancel',
  requirePermission(PERMISSIONS.TRANSFER_CANCEL),
  validate(transferValidation.cancelTransferSchema),
  asyncHandler(TransferController.cancel),
);

export default router;
