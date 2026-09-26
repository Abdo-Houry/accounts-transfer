/**
 * The single source of truth for authorization.
 *
 * Routes reference these constants, the seeder writes them into `permissions`,
 * and the frontend receives the caller's resolved codes from `/auth/me` purely
 * to decide what to *render*. Every enforcement happens server-side.
 */

export const PERMISSIONS = {
  // dashboard & reports
  DASHBOARD_VIEW: 'dashboard.view',
  REPORT_OPERATIONAL: 'report.operational',
  REPORT_FINANCIAL: 'report.financial',

  // users, roles
  USER_READ: 'user.read',
  USER_CREATE: 'user.create',
  USER_UPDATE: 'user.update',
  USER_DELETE: 'user.delete',
  ROLE_READ: 'role.read',
  ROLE_CREATE: 'role.create',
  ROLE_UPDATE: 'role.update',
  ROLE_DELETE: 'role.delete',

  // customers
  CUSTOMER_READ: 'customer.read',
  CUSTOMER_CREATE: 'customer.create',
  CUSTOMER_UPDATE: 'customer.update',

  // correspondent offices
  CORRESPONDENT_READ: 'correspondent.read',
  CORRESPONDENT_CREATE: 'correspondent.create',
  CORRESPONDENT_UPDATE: 'correspondent.update',

  // currencies & rates
  CURRENCY_READ: 'currency.read',
  CURRENCY_CREATE: 'currency.create',
  CURRENCY_UPDATE: 'currency.update',
  RATE_UPDATE: 'rate.update',

  // cash boxes
  CASHBOX_READ: 'cashbox.read',
  CASHBOX_CREATE: 'cashbox.create',
  CASHBOX_UPDATE: 'cashbox.update',
  CASHBOX_OPENING: 'cashbox.opening',
  CASHBOX_TRANSFER: 'cashbox.transfer',
  CASHBOX_CLOSE: 'cashbox.close',
  CASHBOX_RECONCILE: 'cashbox.reconcile',

  // transfers
  TRANSFER_READ: 'transfer.read',
  TRANSFER_CREATE: 'transfer.create',
  TRANSFER_UPDATE: 'transfer.update',
  TRANSFER_SEND: 'transfer.send',
  TRANSFER_RECEIVE: 'transfer.receive',
  TRANSFER_CANCEL: 'transfer.cancel',

  // currency exchange
  EXCHANGE_READ: 'exchange.read',
  EXCHANGE_CREATE: 'exchange.create',
  EXCHANGE_REVERSE: 'exchange.reverse',

  // vouchers
  VOUCHER_READ: 'voucher.read',
  VOUCHER_RECEIPT: 'voucher.receipt',
  VOUCHER_PAYMENT: 'voucher.payment',
  VOUCHER_VOID: 'voucher.void',

  // commissions
  COMMISSION_READ: 'commission.read',
  COMMISSION_MANAGE: 'commission.manage',

  // ledger
  LEDGER_READ: 'ledger.read',
  LEDGER_ADJUST: 'ledger.adjust',

  // audit
  AUDIT_READ: 'audit.read',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: PermissionCode[] = Object.values(PERMISSIONS);

/** Module grouping + descriptions, used by the seeder and the roles UI. */
export const PERMISSION_CATALOGUE: ReadonlyArray<{
  code: PermissionCode;
  module: string;
  description: string;
}> = ALL_PERMISSIONS.map((code) => ({
  code,
  module: code.split('.')[0],
  description: code,
}));

export const SYSTEM_ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  EMPLOYEE: 'employee',
} as const;

export type SystemRoleName = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

/**
 * Default role -> permission mapping applied by the seeder. Roles remain fully
 * editable afterwards; this is only the starting point.
 */
export const ROLE_PRESETS: Record<SystemRoleName, PermissionCode[]> = {
  [SYSTEM_ROLES.ADMIN]: ALL_PERMISSIONS,

  [SYSTEM_ROLES.MANAGER]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.REPORT_OPERATIONAL,
    PERMISSIONS.REPORT_FINANCIAL,
    PERMISSIONS.USER_READ,
    PERMISSIONS.ROLE_READ,
    PERMISSIONS.CUSTOMER_READ,
    PERMISSIONS.CUSTOMER_CREATE,
    PERMISSIONS.CUSTOMER_UPDATE,
    PERMISSIONS.CORRESPONDENT_READ,
    PERMISSIONS.CORRESPONDENT_CREATE,
    PERMISSIONS.CORRESPONDENT_UPDATE,
    PERMISSIONS.CURRENCY_READ,
    PERMISSIONS.CURRENCY_UPDATE,
    PERMISSIONS.RATE_UPDATE,
    PERMISSIONS.CASHBOX_READ,
    PERMISSIONS.CASHBOX_CREATE,
    PERMISSIONS.CASHBOX_UPDATE,
    PERMISSIONS.CASHBOX_OPENING,
    PERMISSIONS.CASHBOX_TRANSFER,
    PERMISSIONS.CASHBOX_CLOSE,
    PERMISSIONS.CASHBOX_RECONCILE,
    PERMISSIONS.TRANSFER_READ,
    PERMISSIONS.TRANSFER_CREATE,
    PERMISSIONS.TRANSFER_UPDATE,
    PERMISSIONS.TRANSFER_SEND,
    PERMISSIONS.TRANSFER_RECEIVE,
    PERMISSIONS.TRANSFER_CANCEL,
    PERMISSIONS.EXCHANGE_READ,
    PERMISSIONS.EXCHANGE_CREATE,
    PERMISSIONS.EXCHANGE_REVERSE,
    PERMISSIONS.VOUCHER_READ,
    PERMISSIONS.VOUCHER_RECEIPT,
    PERMISSIONS.VOUCHER_PAYMENT,
    PERMISSIONS.VOUCHER_VOID,
    PERMISSIONS.COMMISSION_READ,
    PERMISSIONS.COMMISSION_MANAGE,
    PERMISSIONS.LEDGER_READ,
    PERMISSIONS.AUDIT_READ,
  ],

  [SYSTEM_ROLES.EMPLOYEE]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.CUSTOMER_READ,
    PERMISSIONS.CUSTOMER_CREATE,
    PERMISSIONS.CUSTOMER_UPDATE,
    PERMISSIONS.CORRESPONDENT_READ,
    PERMISSIONS.CURRENCY_READ,
    PERMISSIONS.CASHBOX_READ,
    PERMISSIONS.TRANSFER_READ,
    PERMISSIONS.TRANSFER_CREATE,
    PERMISSIONS.TRANSFER_SEND,
    PERMISSIONS.TRANSFER_RECEIVE,
    PERMISSIONS.EXCHANGE_READ,
    PERMISSIONS.EXCHANGE_CREATE,
    PERMISSIONS.VOUCHER_READ,
    PERMISSIONS.VOUCHER_RECEIPT,
    PERMISSIONS.VOUCHER_PAYMENT,
    PERMISSIONS.COMMISSION_READ,
  ],
};
