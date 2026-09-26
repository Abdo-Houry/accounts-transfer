/** Mirrors backend `config/permissions.ts`. Used only to decide what to render. */
export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard.view',
  REPORT_OPERATIONAL: 'report.operational',
  REPORT_FINANCIAL: 'report.financial',

  USER_READ: 'user.read',
  USER_CREATE: 'user.create',
  USER_UPDATE: 'user.update',
  USER_DELETE: 'user.delete',
  ROLE_READ: 'role.read',
  ROLE_CREATE: 'role.create',
  ROLE_UPDATE: 'role.update',
  ROLE_DELETE: 'role.delete',

  CUSTOMER_READ: 'customer.read',
  CUSTOMER_CREATE: 'customer.create',
  CUSTOMER_UPDATE: 'customer.update',
  CORRESPONDENT_READ: 'correspondent.read',
  CORRESPONDENT_CREATE: 'correspondent.create',
  CORRESPONDENT_UPDATE: 'correspondent.update',


  CURRENCY_READ: 'currency.read',
  CURRENCY_CREATE: 'currency.create',
  CURRENCY_UPDATE: 'currency.update',
  RATE_UPDATE: 'rate.update',

  CASHBOX_READ: 'cashbox.read',
  CASHBOX_CREATE: 'cashbox.create',
  CASHBOX_UPDATE: 'cashbox.update',
  CASHBOX_OPENING: 'cashbox.opening',
  CASHBOX_TRANSFER: 'cashbox.transfer',
  CASHBOX_CLOSE: 'cashbox.close',
  CASHBOX_RECONCILE: 'cashbox.reconcile',

  TRANSFER_READ: 'transfer.read',
  TRANSFER_CREATE: 'transfer.create',
  TRANSFER_UPDATE: 'transfer.update',
  TRANSFER_SEND: 'transfer.send',
  TRANSFER_RECEIVE: 'transfer.receive',
  TRANSFER_CANCEL: 'transfer.cancel',

  EXCHANGE_READ: 'exchange.read',
  EXCHANGE_CREATE: 'exchange.create',
  EXCHANGE_REVERSE: 'exchange.reverse',

  VOUCHER_READ: 'voucher.read',
  VOUCHER_RECEIPT: 'voucher.receipt',
  VOUCHER_PAYMENT: 'voucher.payment',
  VOUCHER_VOID: 'voucher.void',

  COMMISSION_READ: 'commission.read',
  COMMISSION_MANAGE: 'commission.manage',

  LEDGER_READ: 'ledger.read',
  LEDGER_ADJUST: 'ledger.adjust',

  AUDIT_READ: 'audit.read',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
