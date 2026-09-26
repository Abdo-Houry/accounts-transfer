import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from '@/components/layout/app-shell';
import { LoadingState } from '@/components/common';
import { useAuth, usePermissions } from '@/context/auth-context';
import { PERMISSIONS, type PermissionCode } from '@/lib/permissions';

const LoginPage = lazy(() => import('@/pages/login-page'));
const DashboardPage = lazy(() => import('@/pages/dashboard-page'));
const TransfersPage = lazy(() => import('@/pages/transfers-page'));
const SendTransferPage = lazy(() => import('@/pages/send-transfer-page'));
const ReceiveTransferPage = lazy(() => import('@/pages/receive-transfer-page'));
const TransferDetailPage = lazy(() => import('@/pages/transfer-detail-page'));
const ExchangePage = lazy(() => import('@/pages/exchange-page'));
const RatesPage = lazy(() => import('@/pages/rates-page'));
const CashBoxesPage = lazy(() => import('@/pages/cash-boxes-page'));
const CashBoxDetailPage = lazy(() => import('@/pages/cash-box-detail-page'));
const CustomersPage = lazy(() => import('@/pages/customers-page'));
const CustomerDetailPage = lazy(() => import('@/pages/customer-detail-page'));
const CorrespondentsPage = lazy(() => import('@/pages/correspondents-page'));
const FinancialStatementsPage = lazy(() => import('@/pages/financial-statements-page'));
const VouchersPage = lazy(() => import('@/pages/vouchers-page'));
const LedgerPage = lazy(() => import('@/pages/ledger-page'));
const ReportsPage = lazy(() => import('@/pages/reports-page'));
const CommissionsPage = lazy(() => import('@/pages/commissions-page'));
const UsersPage = lazy(() => import('@/pages/users-page'));
const RolesPage = lazy(() => import('@/pages/roles-page'));
const AuditLogPage = lazy(() => import('@/pages/audit-log-page'));
const SettingsPage = lazy(() => import('@/pages/settings-page'));
const NotFoundPage = lazy(() => import('@/pages/not-found-page'));

/**
 * Route guard.
 *
 * This is convenience, not security: it keeps an operator from landing on a
 * screen that would only refuse them. Every endpoint behind these screens
 * checks the same permission again on the server.
 */
function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isInitialising } = useAuth();
  const location = useLocation();

  if (isInitialising) return <FullPageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}

function RequirePermission({
  anyOf,
  children,
}: {
  anyOf: PermissionCode[];
  children: ReactNode;
}) {
  const { canAny } = usePermissions();
  if (anyOf.length > 0 && !canAny(...anyOf)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <LoadingState />
    </div>
  );
}

export function AppRoutes() {
  const { isAuthenticated, isInitialising } = useAuth();

  return (
    <Suspense fallback={<FullPageLoader />}>
      <Routes>
        <Route
          path="/login"
          element={
            isInitialising ? (
              <FullPageLoader />
            ) : isAuthenticated ? (
              <Navigate to="/" replace />
            ) : (
              <LoginPage />
            )
          }
        />

        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage />} />

          <Route
            path="transfers"
            element={
              <RequirePermission anyOf={[PERMISSIONS.TRANSFER_READ]}>
                <TransfersPage />
              </RequirePermission>
            }
          />
          <Route
            path="transfers/send"
            element={
              <RequirePermission anyOf={[PERMISSIONS.TRANSFER_CREATE]}>
                <SendTransferPage />
              </RequirePermission>
            }
          />
          <Route
            path="transfers/receive"
            element={
              <RequirePermission anyOf={[PERMISSIONS.TRANSFER_RECEIVE]}>
                <ReceiveTransferPage />
              </RequirePermission>
            }
          />
          <Route
            path="transfers/:id"
            element={
              <RequirePermission anyOf={[PERMISSIONS.TRANSFER_READ]}>
                <TransferDetailPage />
              </RequirePermission>
            }
          />

          <Route
            path="exchange"
            element={
              <RequirePermission anyOf={[PERMISSIONS.EXCHANGE_READ, PERMISSIONS.EXCHANGE_CREATE]}>
                <ExchangePage />
              </RequirePermission>
            }
          />
          <Route
            path="rates"
            element={
              <RequirePermission anyOf={[PERMISSIONS.CURRENCY_READ]}>
                <RatesPage />
              </RequirePermission>
            }
          />

          <Route
            path="cash-boxes"
            element={
              <RequirePermission anyOf={[PERMISSIONS.CASHBOX_READ]}>
                <CashBoxesPage />
              </RequirePermission>
            }
          />
          <Route
            path="cash-boxes/:id"
            element={
              <RequirePermission anyOf={[PERMISSIONS.CASHBOX_READ]}>
                <CashBoxDetailPage />
              </RequirePermission>
            }
          />

          <Route
            path="customers"
            element={
              <RequirePermission anyOf={[PERMISSIONS.CUSTOMER_READ]}>
                <CustomersPage />
              </RequirePermission>
            }
          />
          <Route
            path="customers/:id"
            element={
              <RequirePermission anyOf={[PERMISSIONS.CUSTOMER_READ]}>
                <CustomerDetailPage />
              </RequirePermission>
            }
          />

          <Route
            path="vouchers"
            element={
              <RequirePermission anyOf={[PERMISSIONS.VOUCHER_READ]}>
                <VouchersPage />
              </RequirePermission>
            }
          />
          <Route
            path="correspondents"
            element={
              <RequirePermission anyOf={[PERMISSIONS.CORRESPONDENT_READ]}>
                <CorrespondentsPage />
              </RequirePermission>
            }
          />
          <Route
            path="financial-statements"
            element={
              <RequirePermission anyOf={[PERMISSIONS.REPORT_FINANCIAL]}>
                <FinancialStatementsPage />
              </RequirePermission>
            }
          />
          <Route
            path="ledger"
            element={
              <RequirePermission anyOf={[PERMISSIONS.LEDGER_READ]}>
                <LedgerPage />
              </RequirePermission>
            }
          />
          <Route
            path="reports"
            element={
              <RequirePermission
                anyOf={[PERMISSIONS.REPORT_OPERATIONAL, PERMISSIONS.REPORT_FINANCIAL]}
              >
                <ReportsPage />
              </RequirePermission>
            }
          />

          <Route
            path="commissions"
            element={
              <RequirePermission anyOf={[PERMISSIONS.COMMISSION_READ]}>
                <CommissionsPage />
              </RequirePermission>
            }
          />
          <Route
            path="users"
            element={
              <RequirePermission anyOf={[PERMISSIONS.USER_READ]}>
                <UsersPage />
              </RequirePermission>
            }
          />
          <Route
            path="roles"
            element={
              <RequirePermission anyOf={[PERMISSIONS.ROLE_READ]}>
                <RolesPage />
              </RequirePermission>
            }
          />
          <Route
            path="audit-logs"
            element={
              <RequirePermission anyOf={[PERMISSIONS.AUDIT_READ]}>
                <AuditLogPage />
              </RequirePermission>
            }
          />

          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
