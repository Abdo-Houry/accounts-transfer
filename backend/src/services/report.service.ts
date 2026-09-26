import { AppDataSource } from '../config/data-source';
import { ACCOUNT_CODES } from '../config/accounts';
import { AccountType } from '../types/enums';
import type { DateRange } from '../types/common';
import { money } from '../utils/money';

export interface ReportFilters extends DateRange {
  currencyId?: string;
  cashBoxId?: string;
  createdById?: string;
  customerId?: string;
  status?: string;
  type?: string;
}

export interface TransferReportRow {
  currencyCode: string;
  status: string;
  count: number;
  amount: string;
  commission: string;
  payoutAmount: string;
}

export interface ExchangeReportRow {
  type: string;
  fromCurrency: string;
  toCurrency: string;
  count: number;
  fromAmount: string;
  toAmount: string;
  commission: string;
}

export interface CommissionReportRow {
  currencyCode: string;
  source: string;
  count: number;
  amount: string;
}

export interface CashBoxReportRow {
  cashBoxCode: string;
  cashBoxNameAr: string;
  cashBoxNameEn: string;
  cashBoxNameTr: string;
  currencyCode: string;
  openingBalance: string;
  inflow: string;
  outflow: string;
  closingBalance: string;
}

export interface ProfitLossRow {
  accountCode: string;
  accountNameAr: string;
  accountNameEn: string;
  accountNameTr: string;
  type: AccountType;
  currencyCode: string;
  amount: string;
}

export interface EmployeeReportRow {
  userId: string;
  username: string;
  fullName: string;
  transfersCreated: number;
  transfersPaid: number;
  exchanges: number;
  vouchers: number;
}

export interface CustomerReportRow {
  customerId: string;
  customerNo: string;
  fullName: string;
  phone: string;
  transfers: number;
  exchanges: number;
  currencyCode: string | null;
  volume: string;
}

/**
 * Reporting reads. Every figure here is derived from the operational tables or
 * from `ledger_entries`; nothing keeps a running total of its own, so a report
 * can never disagree with the books.
 */
export class ReportService {
  static async transfers(filters: ReportFilters): Promise<TransferReportRow[]> {
    const params: unknown[] = [filters.from, filters.to];
    const conditions = ['t.created_at BETWEEN $1 AND $2'];

    if (filters.currencyId) {
      params.push(filters.currencyId);
      conditions.push(`t.currency_id = $${params.length}`);
    }
    if (filters.cashBoxId) {
      params.push(filters.cashBoxId);
      conditions.push(`(t.cash_box_id = $${params.length} OR t.payout_cash_box_id = $${params.length})`);
    }
    if (filters.createdById) {
      params.push(filters.createdById);
      conditions.push(`t.created_by = $${params.length}`);
    }
    if (filters.status) {
      params.push(filters.status);
      conditions.push(`t.status = $${params.length}`);
    }

    const rows: Array<{
      code: string;
      status: string;
      count: string;
      amount: string;
      commission: string;
      payout_amount: string;
    }> = await AppDataSource.query(
      `SELECT c.code,
              t.status,
              COUNT(*)::text                            AS count,
              COALESCE(SUM(t.amount), 0)::text          AS amount,
              COALESCE(SUM(t.commission_amount), 0)::text AS commission,
              COALESCE(SUM(t.payout_amount), 0)::text   AS payout_amount
         FROM transfers t
         JOIN currencies c ON c.id = t.currency_id
        WHERE ${conditions.join(' AND ')}
        GROUP BY c.code, t.status
        ORDER BY c.code, t.status`,
      params,
    );

    return rows.map((row) => ({
      currencyCode: row.code,
      status: row.status,
      count: Number(row.count),
      amount: money(row.amount).toString(),
      commission: money(row.commission).toString(),
      payoutAmount: money(row.payout_amount).toString(),
    }));
  }

  static async exchanges(filters: ReportFilters): Promise<ExchangeReportRow[]> {
    const params: unknown[] = [filters.from, filters.to];
    const conditions = ["e.created_at BETWEEN $1 AND $2", "e.status = 'COMPLETED'"];

    if (filters.cashBoxId) {
      params.push(filters.cashBoxId);
      conditions.push(`e.cash_box_id = $${params.length}`);
    }
    if (filters.createdById) {
      params.push(filters.createdById);
      conditions.push(`e.created_by = $${params.length}`);
    }
    if (filters.currencyId) {
      params.push(filters.currencyId);
      conditions.push(`(e.from_currency_id = $${params.length} OR e.to_currency_id = $${params.length})`);
    }
    if (filters.type) {
      params.push(filters.type);
      conditions.push(`e.type = $${params.length}`);
    }

    const rows: Array<{
      type: string;
      from_code: string;
      to_code: string;
      count: string;
      from_amount: string;
      to_amount: string;
      commission: string;
    }> = await AppDataSource.query(
      `SELECT e.type,
              fc.code AS from_code,
              tc.code AS to_code,
              COUNT(*)::text                              AS count,
              COALESCE(SUM(e.from_amount), 0)::text       AS from_amount,
              COALESCE(SUM(e.to_amount), 0)::text         AS to_amount,
              COALESCE(SUM(e.commission_amount), 0)::text AS commission
         FROM currency_exchanges e
         JOIN currencies fc ON fc.id = e.from_currency_id
         JOIN currencies tc ON tc.id = e.to_currency_id
        WHERE ${conditions.join(' AND ')}
        GROUP BY e.type, fc.code, tc.code
        ORDER BY e.type, fc.code`,
      params,
    );

    return rows.map((row) => ({
      type: row.type,
      fromCurrency: row.from_code,
      toCurrency: row.to_code,
      count: Number(row.count),
      fromAmount: money(row.from_amount).toString(),
      toAmount: money(row.to_amount).toString(),
      commission: money(row.commission).toString(),
    }));
  }

  /** Commission income by currency and by which kind of deal produced it. */
  static async commissions(filters: ReportFilters): Promise<CommissionReportRow[]> {
    const rows: Array<{ code: string; source: string; count: string; amount: string }> =
      await AppDataSource.query(
        `SELECT c.code,
                t.source_type AS source,
                COUNT(*)::text AS count,
                COALESCE(SUM(CASE WHEN e.direction = 'CREDIT' THEN e.amount ELSE -e.amount END), 0)::text AS amount
           FROM ledger_entries e
           JOIN financial_transactions t ON t.id = e.transaction_id
           JOIN accounts   a ON a.id = e.account_id
           JOIN currencies c ON c.id = e.currency_id
          WHERE a.code = $3
            AND t.occurred_at BETWEEN $1 AND $2
          GROUP BY c.code, t.source_type
          ORDER BY c.code`,
        [filters.from, filters.to, ACCOUNT_CODES.COMMISSION_INCOME],
      );

    return rows.map((row) => ({
      currencyCode: row.code,
      source: row.source,
      count: Number(row.count),
      amount: money(row.amount).toString(),
    }));
  }

  /**
   * Cash box movement for the period: what was in the box before it started,
   * what came in, what went out, and what is left.
   */
  static async cashBoxes(filters: ReportFilters): Promise<CashBoxReportRow[]> {
    const params: unknown[] = [filters.from, filters.to];
    const conditions: string[] = [];

    if (filters.cashBoxId) {
      params.push(filters.cashBoxId);
      conditions.push(`b.id = $${params.length}`);
    }
    if (filters.currencyId) {
      params.push(filters.currencyId);
      conditions.push(`cur.id = $${params.length}`);
    }
    const filterClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows: Array<{
      code: string;
      name_ar: string;
      name_en: string;
      name_tr: string;
      currency_code: string;
      opening: string;
      inflow: string;
      outflow: string;
    }> = await AppDataSource.query(
      `SELECT b.code,
              b.name_ar,
              b.name_en,
              b.name_tr,
              cur.code AS currency_code,
              COALESCE(SUM(CASE WHEN t.occurred_at <  $1
                                THEN CASE WHEN e.direction = 'DEBIT' THEN e.amount ELSE -e.amount END
                                ELSE 0 END), 0)::text AS opening,
              COALESCE(SUM(CASE WHEN t.occurred_at BETWEEN $1 AND $2 AND e.direction = 'DEBIT'
                                THEN e.amount ELSE 0 END), 0)::text AS inflow,
              COALESCE(SUM(CASE WHEN t.occurred_at BETWEEN $1 AND $2 AND e.direction = 'CREDIT'
                                THEN e.amount ELSE 0 END), 0)::text AS outflow
         FROM ledger_entries e
         JOIN financial_transactions t   ON t.id = e.transaction_id
         JOIN cash_boxes  b   ON b.id = e.cash_box_id
         JOIN currencies  cur ON cur.id = e.currency_id
         ${filterClause}
        GROUP BY b.code, b.name_ar, b.name_en, b.name_tr, cur.code
        ORDER BY b.code, cur.code`,
      params,
    );

    return rows.map((row) => {
      const opening = money(row.opening);
      const inflow = money(row.inflow);
      const outflow = money(row.outflow);
      return {
        cashBoxCode: row.code,
        cashBoxNameAr: row.name_ar,
        cashBoxNameEn: row.name_en,
        cashBoxNameTr: row.name_tr,
        currencyCode: row.currency_code,
        openingBalance: opening.toString(),
        inflow: inflow.toString(),
        outflow: outflow.toString(),
        closingBalance: opening.add(inflow).sub(outflow).toString(),
      };
    });
  }

  /**
   * Revenue and expense per currency for the period.
   * Amounts are signed against the account's normal balance, so a positive
   * revenue figure means income actually earned.
   */
  static async profitLoss(filters: ReportFilters): Promise<ProfitLossRow[]> {
    const rows: Array<{
      code: string;
      name_ar: string;
      name_en: string;
      name_tr: string;
      type: AccountType;
      currency_code: string;
      amount: string;
    }> = await AppDataSource.query(
      `SELECT a.code,
              a.name_ar,
              a.name_en,
              a.name_tr,
              a.type,
              c.code AS currency_code,
              COALESCE(SUM(
                CASE WHEN a.normal_balance = 'CREDIT'
                     THEN CASE WHEN e.direction = 'CREDIT' THEN e.amount ELSE -e.amount END
                     ELSE CASE WHEN e.direction = 'DEBIT'  THEN e.amount ELSE -e.amount END
                END), 0)::text AS amount
         FROM ledger_entries e
         JOIN financial_transactions t ON t.id = e.transaction_id
         JOIN accounts   a ON a.id = e.account_id
         JOIN currencies c ON c.id = e.currency_id
        WHERE a.type IN ('REVENUE', 'EXPENSE')
          AND t.occurred_at BETWEEN $1 AND $2
        GROUP BY a.code, a.name_ar, a.name_en, a.name_tr, a.type, c.code
        ORDER BY a.type DESC, a.code, c.code`,
      [filters.from, filters.to],
    );

    return rows.map((row) => ({
      accountCode: row.code,
      accountNameAr: row.name_ar,
      accountNameEn: row.name_en,
      accountNameTr: row.name_tr,
      type: row.type,
      currencyCode: row.currency_code,
      amount: money(row.amount).toString(),
    }));
  }

  static async employees(filters: ReportFilters): Promise<EmployeeReportRow[]> {
    const rows: Array<{
      user_id: string;
      username: string;
      full_name: string;
      transfers_created: string;
      transfers_paid: string;
      exchanges: string;
      vouchers: string;
    }> = await AppDataSource.query(
      `SELECT u.id AS user_id,
              u.username,
              u.full_name,
              (SELECT COUNT(*) FROM transfers t
                WHERE t.created_by = u.id AND t.created_at BETWEEN $1 AND $2)::text AS transfers_created,
              (SELECT COUNT(*) FROM transfers t
                WHERE t.received_by = u.id AND t.received_at BETWEEN $1 AND $2)::text AS transfers_paid,
              (SELECT COUNT(*) FROM currency_exchanges e
                WHERE e.created_by = u.id AND e.created_at BETWEEN $1 AND $2)::text AS exchanges,
              (SELECT COUNT(*) FROM vouchers v
                WHERE v.created_by = u.id AND v.created_at BETWEEN $1 AND $2)::text AS vouchers
         FROM users u
        ORDER BY u.full_name`,
      [filters.from, filters.to],
    );

    return rows
      .map((row) => ({
        userId: row.user_id,
        username: row.username,
        fullName: row.full_name,
        transfersCreated: Number(row.transfers_created),
        transfersPaid: Number(row.transfers_paid),
        exchanges: Number(row.exchanges),
        vouchers: Number(row.vouchers),
      }))
      .filter(
        (row) =>
          row.transfersCreated + row.transfersPaid + row.exchanges + row.vouchers > 0,
      );
  }

  static async customers(filters: ReportFilters): Promise<CustomerReportRow[]> {
    const rows: Array<{
      customer_id: string;
      customer_no: string;
      full_name: string;
      phone: string;
      transfers: string;
      exchanges: string;
      currency_code: string | null;
      volume: string;
    }> = await AppDataSource.query(
      `SELECT cu.id AS customer_id,
              cu.customer_no,
              cu.full_name,
              cu.phone,
              COUNT(t.id)::text AS transfers,
              (SELECT COUNT(*) FROM currency_exchanges e
                WHERE e.customer_id = cu.id AND e.created_at BETWEEN $1 AND $2)::text AS exchanges,
              MAX(c.code) AS currency_code,
              COALESCE(SUM(t.amount), 0)::text AS volume
         FROM customers cu
         LEFT JOIN transfers  t ON t.sender_customer_id = cu.id AND t.created_at BETWEEN $1 AND $2
         LEFT JOIN currencies c ON c.id = t.currency_id
        GROUP BY cu.id, cu.customer_no, cu.full_name, cu.phone
       HAVING COUNT(t.id) > 0
           OR (SELECT COUNT(*) FROM currency_exchanges e
                WHERE e.customer_id = cu.id AND e.created_at BETWEEN $1 AND $2) > 0
        ORDER BY SUM(t.amount) DESC NULLS LAST
        LIMIT 200`,
      [filters.from, filters.to],
    );

    return rows.map((row) => ({
      customerId: row.customer_id,
      customerNo: row.customer_no,
      fullName: row.full_name,
      phone: row.phone,
      transfers: Number(row.transfers),
      exchanges: Number(row.exchanges),
      currencyCode: row.currency_code,
      volume: money(row.volume).toString(),
    }));
  }
}
