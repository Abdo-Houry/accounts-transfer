import { AppDataSource } from '../config/data-source';
import { ACCOUNT_CODES } from '../config/accounts';
import { AccountType } from '../types/enums';
import { money } from '../utils/money';

/**
 * The statements an office actually files: a balance sheet and an income
 * statement, each presented with one column per currency.
 *
 * Per currency, not consolidated, because that is how this ledger works: every
 * journal entry balances within its own currency and no synthetic base-currency
 * amount is ever invented (docs/01-architecture.md). Converting SYP, USD, EUR
 * and TRY into one column would require picking a rate, and the answer would
 * change every time the board moved - which is exactly the ambiguity the
 * multi-currency design was built to avoid.
 */

export interface StatementLineRow {
  accountCode: string;
  accountNameAr: string;
  accountNameEn: string;
  accountNameTr: string;
  /** `currencyCode -> signed amount`, in that account's natural direction. */
  amounts: Record<string, string>;
}

export interface StatementSection {
  /** i18n key for the section heading. */
  key: string;
  rows: StatementLineRow[];
  totals: Record<string, string>;
}

export interface BalanceSheet {
  asOf: string;
  currencies: string[];
  assets: StatementSection;
  liabilities: StatementSection;
  equity: StatementSection;
  /** Revenue less expense for the period up to `asOf`, folded into equity. */
  retainedResult: Record<string, string>;
  totalAssets: Record<string, string>;
  /** Liabilities + equity + retained result - must equal `totalAssets`. */
  totalLiabilitiesAndEquity: Record<string, string>;
  /** Per currency: does the sheet balance? The honest self-check. */
  balanced: Record<string, boolean>;
}

export interface IncomeStatement {
  from: string;
  to: string;
  currencies: string[];
  revenue: StatementSection;
  expenses: StatementSection;
  netResult: Record<string, string>;
}

interface RawRow {
  code: string;
  name_ar: string;
  name_en: string;
  name_tr: string;
  type: AccountType;
  currency_code: string;
  /** Signed in the account's normal direction: positive = normal side. */
  amount: string;
}

/**
 * Balances per account per currency, signed so a positive number always means
 * "the normal side of this account".
 *
 * Child accounts are rolled into their parent (`1000-MAIN` into `1000`,
 * `1300-HAMZA` into `1300`) so the statement reads as a summary; the detail is
 * a click away in the ledger.
 */
async function balances(where: string, params: unknown[], types: AccountType[]): Promise<RawRow[]> {
  return AppDataSource.query(
    `SELECT parent.code,
            parent.name_ar,
            parent.name_en,
            parent.name_tr,
            parent.type,
            c.code AS currency_code,
            COALESCE(SUM(
              CASE WHEN parent.normal_balance = 'CREDIT'
                   THEN CASE WHEN e.direction = 'CREDIT' THEN e.amount ELSE -e.amount END
                   ELSE CASE WHEN e.direction = 'DEBIT'  THEN e.amount ELSE -e.amount END
              END), 0)::text AS amount
       FROM ledger_entries e
       JOIN financial_transactions t ON t.id = e.transaction_id
       JOIN accounts   a      ON a.id = e.account_id
       JOIN accounts   parent ON parent.id = COALESCE(a.parent_id, a.id)
       JOIN currencies c      ON c.id = e.currency_id
      WHERE parent.type::text = ANY($${params.length + 1}::text[])
        ${where}
      GROUP BY parent.code, parent.name_ar, parent.name_en, parent.name_tr, parent.type, c.code
      HAVING COALESCE(SUM(
              CASE WHEN parent.normal_balance = 'CREDIT'
                   THEN CASE WHEN e.direction = 'CREDIT' THEN e.amount ELSE -e.amount END
                   ELSE CASE WHEN e.direction = 'DEBIT'  THEN e.amount ELSE -e.amount END
              END), 0) <> 0
      ORDER BY parent.code, c.code`,
    [...params, types],
  );
}

function toSection(key: string, rows: RawRow[], currencies: string[]): StatementSection {
  const byAccount = new Map<string, StatementLineRow>();
  const totals: Record<string, string> = {};
  for (const code of currencies) totals[code] = '0';

  for (const row of rows) {
    let line = byAccount.get(row.code);
    if (!line) {
      line = {
        accountCode: row.code,
        accountNameAr: row.name_ar,
        accountNameEn: row.name_en,
        accountNameTr: row.name_tr,
        amounts: Object.fromEntries(currencies.map((code) => [code, '0'])),
      };
      byAccount.set(row.code, line);
    }
    line.amounts[row.currency_code] = money(row.amount).toString();
    totals[row.currency_code] = money(totals[row.currency_code] ?? '0')
      .add(money(row.amount))
      .toString();
  }

  return { key, rows: [...byAccount.values()], totals };
}

function sumInto(
  target: Record<string, string>,
  source: Record<string, string>,
  currencies: string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const code of currencies) {
    out[code] = money(target[code] ?? '0')
      .add(money(source[code] ?? '0'))
      .toString();
  }
  return out;
}

export class FinancialStatementService {
  /**
   * Position at a point in time.
   *
   * The result for the period is folded into equity rather than left dangling,
   * which is what makes assets equal liabilities plus equity - and `balanced`
   * reports, per currency, whether it actually did.
   */
  static async balanceSheet(asOf: Date = new Date()): Promise<BalanceSheet> {
    const positionRows = await balances('AND t.occurred_at <= $1', [asOf], [
      AccountType.ASSET,
      AccountType.LIABILITY,
      AccountType.EQUITY,
    ]);
    const resultRows = await balances('AND t.occurred_at <= $1', [asOf], [
      AccountType.REVENUE,
      AccountType.EXPENSE,
    ]);

    const currencies = [
      ...new Set([...positionRows, ...resultRows].map((row) => row.currency_code)),
    ].sort();

    const assets = toSection(
      'statement.assets',
      positionRows.filter((row) => row.type === AccountType.ASSET),
      currencies,
    );
    const liabilities = toSection(
      'statement.liabilities',
      positionRows.filter((row) => row.type === AccountType.LIABILITY),
      currencies,
    );
    const equity = toSection(
      'statement.equity',
      positionRows.filter((row) => row.type === AccountType.EQUITY),
      currencies,
    );

    // Revenue is credit-normal and expense debit-normal, so both arrive
    // positive on their own side; the result is revenue minus expense.
    const retainedResult: Record<string, string> = {};
    for (const code of currencies) {
      const revenue = resultRows
        .filter((row) => row.type === AccountType.REVENUE && row.currency_code === code)
        .reduce((sum, row) => sum.add(money(row.amount)), money('0'));
      const expense = resultRows
        .filter((row) => row.type === AccountType.EXPENSE && row.currency_code === code)
        .reduce((sum, row) => sum.add(money(row.amount)), money('0'));
      retainedResult[code] = revenue.sub(expense).toString();
    }

    const totalAssets = sumInto(assets.totals, {}, currencies);
    const totalLiabilitiesAndEquity = sumInto(
      sumInto(liabilities.totals, equity.totals, currencies),
      retainedResult,
      currencies,
    );

    const balanced: Record<string, boolean> = {};
    for (const code of currencies) {
      balanced[code] = money(totalAssets[code]).eq(money(totalLiabilitiesAndEquity[code]));
    }

    return {
      asOf: asOf.toISOString(),
      currencies,
      assets,
      liabilities,
      equity,
      retainedResult,
      totalAssets,
      totalLiabilitiesAndEquity,
      balanced,
    };
  }

  /** Revenue and expense over a period, with the net result per currency. */
  static async incomeStatement(from: Date, to: Date): Promise<IncomeStatement> {
    const rows = await balances(
      'AND t.occurred_at >= $1 AND t.occurred_at <= $2',
      [from, to],
      [AccountType.REVENUE, AccountType.EXPENSE],
    );
    const currencies = [...new Set(rows.map((row) => row.currency_code))].sort();

    const revenue = toSection(
      'statement.revenue',
      rows.filter((row) => row.type === AccountType.REVENUE),
      currencies,
    );
    const expenses = toSection(
      'statement.expenses',
      rows.filter((row) => row.type === AccountType.EXPENSE),
      currencies,
    );

    const netResult: Record<string, string> = {};
    for (const code of currencies) {
      netResult[code] = money(revenue.totals[code] ?? '0')
        .sub(money(expenses.totals[code] ?? '0'))
        .toString();
    }

    return { from: from.toISOString(), to: to.toISOString(), currencies, revenue, expenses, netResult };
  }

  /**
   * The chart of accounts as a tree.
   *
   * Built from `parent_id`, which the schema has always carried - the screen
   * was simply listing it flat, so `1000-MAIN` sat beside `1000` instead of
   * under it.
   */
  static async accountTree(): Promise<AccountNode[]> {
    const rows: Array<{
      id: string;
      code: string;
      name_ar: string;
      name_en: string;
      name_tr: string;
      type: AccountType;
      normal_balance: string;
      parent_id: string | null;
      is_active: boolean;
    }> = await AppDataSource.query(
      `SELECT id, code, name_ar, name_en, name_tr, type, normal_balance, parent_id, is_active
         FROM accounts
        ORDER BY code`,
    );

    const nodes = new Map<string, AccountNode>();
    for (const row of rows) {
      nodes.set(row.id, {
        id: row.id,
        code: row.code,
        nameAr: row.name_ar,
        nameEn: row.name_en,
        nameTr: row.name_tr,
        type: row.type,
        normalBalance: row.normal_balance,
        isActive: row.is_active,
        children: [],
      });
    }

    const roots: AccountNode[] = [];
    for (const row of rows) {
      const node = nodes.get(row.id)!;
      const parent = row.parent_id ? nodes.get(row.parent_id) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }
}

export interface AccountNode {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  nameTr: string;
  type: AccountType;
  normalBalance: string;
  isActive: boolean;
  children: AccountNode[];
}

/** Re-exported so callers can label the correspondent block without a literal. */
export const CORRESPONDENT_CONTROL_CODE = ACCOUNT_CODES.CORRESPONDENT_CURRENT;
