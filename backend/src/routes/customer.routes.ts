import { Router } from 'express';
import { CustomerController } from '../controllers';
import { PERMISSIONS } from '../config/permissions';
import { asyncHandler, requirePermission, validate } from '../middleware';
import { customerValidation, idParam, paginationQuery } from '../validations';

const router = Router();

router.get(
  '/',
  requirePermission(PERMISSIONS.CUSTOMER_READ),
  validate(customerValidation.listCustomersSchema),
  asyncHandler(CustomerController.list),
);

router.post(
  '/',
  requirePermission(PERMISSIONS.CUSTOMER_CREATE),
  validate(customerValidation.createCustomerSchema),
  asyncHandler(CustomerController.create),
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.CUSTOMER_READ),
  validate({ params: idParam }),
  asyncHandler(CustomerController.detail),
);

/** Transfers, exchanges, vouchers and the net ledger position in one payload. */
router.get(
  '/:id/statement',
  requirePermission(PERMISSIONS.CUSTOMER_READ),
  validate({ params: idParam }),
  asyncHandler(CustomerController.statement),
);

/** The accounting statement: debit, credit and a running balance. */
router.get(
  '/:id/account-statement',
  requirePermission(PERMISSIONS.CUSTOMER_READ),
  validate(customerValidation.customerStatementSchema),
  asyncHandler(CustomerController.accountStatement),
);

router.get(
  '/:id/ledger',
  requirePermission(PERMISSIONS.CUSTOMER_READ),
  validate({ params: idParam, query: paginationQuery }),
  asyncHandler(CustomerController.ledger),
);

router.patch(
  '/:id',
  requirePermission(PERMISSIONS.CUSTOMER_UPDATE),
  validate(customerValidation.updateCustomerSchema),
  asyncHandler(CustomerController.update),
);

router.patch(
  '/:id/status',
  requirePermission(PERMISSIONS.CUSTOMER_UPDATE),
  validate(customerValidation.customerStatusSchema),
  asyncHandler(CustomerController.setStatus),
);

export default router;
