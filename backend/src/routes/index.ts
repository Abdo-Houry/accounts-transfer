import { Router } from 'express';
import { authenticate } from '../middleware';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import roleRoutes from './role.routes';
import currencyRoutes from './currency.routes';
import exchangeRateRoutes from './exchange-rate.routes';
import cashBoxRoutes from './cash-box.routes';
import customerRoutes from './customer.routes';
import correspondentRoutes from './correspondent.routes';
import transferRoutes from './transfer.routes';
import exchangeRoutes from './exchange.routes';
import voucherRoutes from './voucher.routes';
import commissionRoutes from './commission.routes';
import ledgerRoutes from './ledger.routes';
import dashboardRoutes from './dashboard.routes';
import reportRoutes from './report.routes';
import auditRoutes from './audit.routes';
import { RoleController } from '../controllers';
import { PERMISSIONS } from '../config/permissions';
import { asyncHandler, requirePermission } from '../middleware';

const router = Router();

/** Liveness probe - the only unauthenticated endpoint besides `/auth`. */
router.get('/health', (_req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

router.use('/auth', authRoutes);

/**
 * Everything past this line requires a valid access token. Each router then
 * declares its own permission per endpoint - authentication alone grants
 * nothing.
 */
router.use(authenticate);

router.get(
  '/permissions',
  requirePermission(PERMISSIONS.ROLE_READ),
  asyncHandler(RoleController.listPermissions),
);

router.use('/users', userRoutes);
router.use('/roles', roleRoutes);
router.use('/currencies', currencyRoutes);
router.use('/exchange-rates', exchangeRateRoutes);
router.use('/cash-boxes', cashBoxRoutes);
router.use('/customers', customerRoutes);
router.use('/correspondents', correspondentRoutes);
router.use('/transfers', transferRoutes);
router.use('/exchanges', exchangeRoutes);
router.use('/vouchers', voucherRoutes);
router.use('/commission-rules', commissionRoutes);
router.use('/ledger', ledgerRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/reports', reportRoutes);
router.use('/audit-logs', auditRoutes);

export default router;
