import {
  ArrowLeftRight,
  Building2,
  FileSpreadsheet,
  BookOpenCheck,
  Coins,
  FileText,
  LayoutDashboard,
  Percent,
  Receipt,
  ScrollText,
  Send,
  Settings,
  ShieldCheck,
  TrendingUp,
  Users,
  Vault,
  Wallet,
} from 'lucide-react';
import { PERMISSIONS, type PermissionCode } from '@/lib/permissions';
import type { MessageKey } from '@/i18n';

export interface NavItem {
  to: string;
  labelKey: MessageKey;
  icon: typeof LayoutDashboard;
  /** Item is rendered only when the user holds at least one of these. */
  anyOf: PermissionCode[];
  /** Match the route exactly instead of by prefix (used for index routes). */
  end?: boolean;
}

export interface NavGroup {
  labelKey: MessageKey;
  items: NavItem[];
}

/**
 * Sidebar structure.
 *
 * Grouped the way the office actually works: what a cashier does all day first,
 * accounting second, administration last. Every entry declares the permissions
 * that make it useful, so an employee simply never sees a screen that would
 * refuse them at the server.
 */
export const NAVIGATION: NavGroup[] = [
  {
    labelKey: 'nav.operations',
    items: [
      {
        to: '/',
        labelKey: 'nav.dashboard',
        icon: LayoutDashboard,
        anyOf: [PERMISSIONS.DASHBOARD_VIEW],
        end: true,
      },
      {
        to: '/transfers/send',
        labelKey: 'nav.sendTransfer',
        icon: Send,
        anyOf: [PERMISSIONS.TRANSFER_CREATE],
      },
      {
        to: '/transfers/receive',
        labelKey: 'nav.receiveTransfer',
        icon: Receipt,
        anyOf: [PERMISSIONS.TRANSFER_RECEIVE],
      },
      {
        to: '/transfers',
        labelKey: 'nav.transfers',
        icon: ArrowLeftRight,
        anyOf: [PERMISSIONS.TRANSFER_READ],
        end: true,
      },
      {
        to: '/exchange',
        labelKey: 'nav.exchange',
        icon: Coins,
        anyOf: [PERMISSIONS.EXCHANGE_READ, PERMISSIONS.EXCHANGE_CREATE],
      },
      {
        to: '/rates',
        labelKey: 'nav.rates',
        icon: TrendingUp,
        anyOf: [PERMISSIONS.CURRENCY_READ],
      },
      {
        to: '/customers',
        labelKey: 'nav.customers',
        icon: Users,
        anyOf: [PERMISSIONS.CUSTOMER_READ],
      },
      {
        to: '/correspondents',
        labelKey: 'nav.correspondents',
        icon: Building2,
        anyOf: [PERMISSIONS.CORRESPONDENT_READ],
      },
    ],
  },
  {
    labelKey: 'nav.accounting',
    items: [
      {
        to: '/cash-boxes',
        labelKey: 'nav.cashBoxes',
        icon: Vault,
        anyOf: [PERMISSIONS.CASHBOX_READ],
      },
      {
        to: '/vouchers',
        labelKey: 'nav.vouchers',
        icon: Wallet,
        anyOf: [PERMISSIONS.VOUCHER_READ],
      },
      {
        to: '/ledger',
        labelKey: 'nav.ledger',
        icon: BookOpenCheck,
        anyOf: [PERMISSIONS.LEDGER_READ],
      },
      {
        to: '/financial-statements',
        labelKey: 'nav.financialStatements',
        icon: FileSpreadsheet,
        anyOf: [PERMISSIONS.REPORT_FINANCIAL],
      },
      {
        to: '/reports',
        labelKey: 'nav.reports',
        icon: FileText,
        anyOf: [PERMISSIONS.REPORT_OPERATIONAL, PERMISSIONS.REPORT_FINANCIAL],
      },
    ],
  },
  {
    labelKey: 'nav.administration',
    items: [
      {
        to: '/commissions',
        labelKey: 'nav.commissions',
        icon: Percent,
        anyOf: [PERMISSIONS.COMMISSION_READ],
      },
      {
        to: '/users',
        labelKey: 'nav.users',
        icon: Users,
        anyOf: [PERMISSIONS.USER_READ],
      },
      {
        to: '/roles',
        labelKey: 'nav.roles',
        icon: ShieldCheck,
        anyOf: [PERMISSIONS.ROLE_READ],
      },
      {
        to: '/audit-logs',
        labelKey: 'nav.audit',
        icon: ScrollText,
        anyOf: [PERMISSIONS.AUDIT_READ],
      },
      {
        to: '/settings',
        labelKey: 'nav.settings',
        icon: Settings,
        anyOf: [],
      },
    ],
  },
];
