import type { QueryClient } from '@tanstack/react-query';

/**
 * Every cached view a money movement can invalidate.
 *
 * A posting never touches one screen in isolation: paying a transfer moves a
 * cash box balance, writes ledger entries, shifts the trial balance, changes a
 * customer statement, lands in the audit trail and moves the dashboard totals.
 * Each mutation used to name its own short list of keys, and those lists had
 * drifted out of step with the keys the screens actually query - the cash box
 * list reads `cash-box-balances`, so invalidating `cash-boxes` left it showing
 * a stale balance until the operator reloaded the page.
 *
 * Listing the prefixes in one place is what keeps that from happening again:
 * a screen is refreshed because it is financial, not because whoever wrote the
 * mutation remembered it.
 */
export const FINANCIAL_QUERY_PREFIXES: readonly string[] = [
  // cash boxes: reference list, balances grid, detail, statement, reconciliation
  'cash-boxes',
  'cash-box-balances',
  'cash-box',
  'cash-box-statement',
  'cash-box-reconcile',
  // the book itself
  'ledger-transactions',
  'ledger-transaction',
  'trial-balance',
  'accounts',
  // operations
  'transfers',
  'exchanges',
  'vouchers',
  // people and paper
  'customers',
  'customer-statement',
  'customer-search',
  // read models
  'dashboard',
  'report',
  'audit-logs',
];

/**
 * Invalidate every financial view.
 *
 * `invalidateQueries` matches on key *prefix*, so one entry covers a screen's
 * whole family of parameterised queries - `['transfers', 'list', {...}]` and
 * `['transfers', 'detail', id]` alike. Active queries refetch immediately, so a
 * screen the operator is looking at updates without a reload.
 */
export function invalidateFinancialQueries(queryClient: QueryClient): void {
  for (const prefix of FINANCIAL_QUERY_PREFIXES) {
    void queryClient.invalidateQueries({ queryKey: [prefix] });
  }
}
