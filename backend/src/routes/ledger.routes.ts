import { Router } from 'express';
import { LedgerController } from '../controllers';
import { PERMISSIONS } from '../config/permissions';
import { asyncHandler, requirePermission, validate } from '../middleware';
import { idParam, ledgerValidation } from '../validations';

const router = Router();

router.get(
  '/transactions',
  requirePermission(PERMISSIONS.LEDGER_READ),
  validate(ledgerValidation.listTransactionsSchema),
  asyncHandler(LedgerController.transactions),
);

router.get(
  '/transactions/:id',
  requirePermission(PERMISSIONS.LEDGER_READ),
  validate({ params: idParam }),
  asyncHandler(LedgerController.transactionDetail),
);

router.get(
  '/entries',
  requirePermission(PERMISSIONS.LEDGER_READ),
  validate(ledgerValidation.listEntriesSchema),
  asyncHandler(LedgerController.entries),
);

router.get(
  '/accounts',
  requirePermission(PERMISSIONS.LEDGER_READ),
  asyncHandler(LedgerController.accounts),
);

router.get(
  '/account-tree',
  requirePermission(PERMISSIONS.LEDGER_READ),
  asyncHandler(LedgerController.accountTree),
);

/** The two statements an office files, one column per currency. */
router.get(
  '/balance-sheet',
  requirePermission(PERMISSIONS.REPORT_FINANCIAL),
  validate(ledgerValidation.balanceSheetSchema),
  asyncHandler(LedgerController.balanceSheet),
);

router.get(
  '/income-statement',
  requirePermission(PERMISSIONS.REPORT_FINANCIAL),
  validate(ledgerValidation.incomeStatementSchema),
  asyncHandler(LedgerController.incomeStatement),
);

router.get(
  '/trial-balance',
  requirePermission(PERMISSIONS.REPORT_FINANCIAL),
  validate(ledgerValidation.trialBalanceSchema),
  asyncHandler(LedgerController.trialBalance),
);

/**
 * Manual journal entry. It still goes through the posting engine, so it is
 * subject to the same balance and cash-box guards as an automatic entry.
 */
router.post(
  '/adjustment',
  requirePermission(PERMISSIONS.LEDGER_ADJUST),
  validate(ledgerValidation.adjustmentSchema),
  asyncHandler(LedgerController.adjustment),
);

export default router;
