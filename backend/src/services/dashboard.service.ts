import { AppDataSource } from '../config/data-source';
import { ACCOUNT_CODES } from '../config/accounts';
import { CurrencyExchange } from '../entities/currency-exchange.entity';
import { Transfer } from '../entities/transfer.entity';
import { Voucher } from '../entities/voucher.entity';
import { TransferStatus, VoucherType } from '../types/enums';
import type { DateRange } from '../types/common';
import { money } from '../utils/money';
import { CashBoxService } from './cash-box.service';

export interface CurrencyTotal {
  currencyId: string;
  currencyCode: string;
  amount: string;
  count: number;
}

export interface CashBoxBalanceSummary {
  cashBoxId: string;
  cashBoxCode: string;
  cashBoxNameAr: string;
  cashBoxNameEn: string;
  cashBoxNameTr: string;
  currencyCode: string;
  currencyId: string;
  balance: string;
}

export interface DailyPoint {
  date: string;
  transfers: number;
  exchanges: number;
}

export interface DashboardSummary {
  range: { from: string; to: string };
  transfers: {
    total: number;
    pending: number;
    sent: number;
    received: number;
    cancelled: number;
    volumeByCurrency: CurrencyTotal[];
  };
  exchanges: {
    total: number;
    volumeByCurrency: CurrencyTotal[];
  };
  commissions: CurrencyTotal[];
  vouchers: {
    receiptsByCurrency: CurrencyTotal[];
    paymentsByCurrency: CurrencyTotal[];
  };
  cashBoxBalances: CashBoxBalanceSummary[];
  currencyTotals: CurrencyTotal[];
  topCurrencies: CurrencyTotal[];
  trend: DailyPoint[];
}

export interface RecentActivity {
  transfers: Transfer[];
  exchanges: CurrencyExchange[];
  vouchers: Voucher[];
}

export class DashboardService {
  /**
   * Every figure here is aggregated from the operational tables or the ledger -
   * nothing is stored pre-computed, so the dashboard cannot drift away from the
   * books.
   */
  static async summary(range: DateRange): Promise<DashboardSummary> {
    const [
      statusCounts,
      transferVolume,
      exchangeCount,
      exchangeVolume,
      commissions,
      receipts,
      payments,
      balances,
      trend,
    ] = await Promise.all([
      DashboardService.transferStatusCounts(range),
      DashboardService.transferVolumeByCurrency(range),
      DashboardService.exchangeCount(range),
      DashboardService.exchangeVolumeByCurrency(range),
      DashboardService.commissionsByCurrency(range),
      DashboardService.voucherTotals(range, VoucherType.RECEIPT),
      DashboardService.voucherTotals(range, VoucherType.PAYMENT),
      CashBoxService.allBalances(),
      DashboardService.dailyTrend(range),
    ]);

    const total =
      statusCounts.pending + statusCounts.sent + statusCounts.received + statusCounts.cancelled;

    const currencyTotals = DashboardService.mergeTotals([transferVolume, exchangeVolume]);

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      transfers: { total, ...statusCounts, volumeByCurrency: transferVolume },
      exchanges: { total: exchangeCount, volumeByCurrency: exchangeVolume },
      commissions,
      vouchers: { receiptsByCurrency: receipts, paymentsByCurrency: payments },
      cashBoxBalances: balances.map((balance) => ({
        cashBoxId: balance.cashBoxId,
        cashBoxCode: balance.cashBox.code,
        cashBoxNameAr: balance.cashBox.nameAr,
        cashBoxNameEn: balance.cashBox.nameEn,
        cashBoxNameTr: balance.cashBox.nameTr,
        currencyId: balance.currencyId,
        currencyCode: balance.currency.code,
        balance: money(balance.balance).toString(),
      })),
      currencyTotals,
      topCurrencies: [...currencyTotals]
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      trend,
    };
  }

  static async recentActivity(limit = 10): Promise<RecentActivity> {
    const [transfers, exchanges, vouchers] = await Promise.all([
      AppDataSource.getRepository(Transfer).find({
        relations: { currency: true, payoutCurrency: true, createdBy: true, cashBox: true },
        order: { createdAt: 'DESC' },
        take: limit,
      }),
      AppDataSource.getRepository(CurrencyExchange).find({
        relations: { fromCurrency: true, toCurrency: true, createdBy: true },
        order: { createdAt: 'DESC' },
        take: limit,
      }),
      AppDataSource.getRepository(Voucher).find({
        relations: { currency: true, createdBy: true, cashBox: true },
        order: { createdAt: 'DESC' },
        take: limit,
      }),
    ]);

    return { transfers, exchanges, vouchers };
  }

  // ------------------------------------------------------------ aggregates

  private static async transferStatusCounts(range: DateRange): Promise<{
    pending: number;
    sent: number;
    received: number;
    cancelled: number;
  }> {
    const rows: Array<{ status: TransferStatus; count: string }> = await AppDataSource.query(
      `SELECT status, COUNT(*)::text AS count
         FROM transfers
        WHERE created_at BETWEEN $1 AND $2
        GROUP BY status`,
      [range.from, range.to],
    );

    const counts = { pending: 0, sent: 0, received: 0, cancelled: 0 };
    for (const row of rows) {
      const value = Number(row.count);
      if (row.status === TransferStatus.PENDING) counts.pending = value;
      else if (row.status === TransferStatus.SENT) counts.sent = value;
      else if (row.status === TransferStatus.RECEIVED) counts.received = value;
      else if (row.status === TransferStatus.CANCELLED) counts.cancelled = value;
    }
    return counts;
  }

  private static async transferVolumeByCurrency(range: DateRange): Promise<CurrencyTotal[]> {
    return DashboardService.toTotals(
      await AppDataSource.query(
        `SELECT c.id AS currency_id, c.code, COALESCE(SUM(t.amount), 0)::text AS amount, COUNT(*)::text AS count
           FROM transfers t
           JOIN currencies c ON c.id = t.currency_id
          WHERE t.created_at BETWEEN $1 AND $2
            AND t.status <> 'CANCELLED'
          GROUP BY c.id, c.code
          ORDER BY SUM(t.amount) DESC`,
        [range.from, range.to],
      ),
    );
  }

  private static async exchangeCount(range: DateRange): Promise<number> {
    const rows: Array<{ count: string }> = await AppDataSource.query(
      `SELECT COUNT(*)::text AS count
         FROM currency_exchanges
        WHERE created_at BETWEEN $1 AND $2 AND status = 'COMPLETED'`,
      [range.from, range.to],
    );
    return Number(rows[0]?.count ?? 0);
  }

  private static async exchangeVolumeByCurrency(range: DateRange): Promise<CurrencyTotal[]> {
    return DashboardService.toTotals(
      await AppDataSource.query(
        `SELECT c.id AS currency_id, c.code, COALESCE(SUM(e.from_amount), 0)::text AS amount, COUNT(*)::text AS count
           FROM currency_exchanges e
           JOIN currencies c ON c.id = e.from_currency_id
          WHERE e.created_at BETWEEN $1 AND $2 AND e.status = 'COMPLETED'
          GROUP BY c.id, c.code
          ORDER BY SUM(e.from_amount) DESC`,
        [range.from, range.to],
      ),
    );
  }

  /**
   * Commission income straight from the ledger rather than from the operation
   * tables, so a reversed deal automatically nets itself out.
   */
  private static async commissionsByCurrency(range: DateRange): Promise<CurrencyTotal[]> {
    return DashboardService.toTotals(
      await AppDataSource.query(
        `SELECT c.id AS currency_id,
                c.code,
                COALESCE(SUM(CASE WHEN e.direction = 'CREDIT' THEN e.amount ELSE -e.amount END), 0)::text AS amount,
                COUNT(*)::text AS count
           FROM ledger_entries e
           JOIN financial_transactions t ON t.id = e.transaction_id
           JOIN accounts   a ON a.id = e.account_id
           JOIN currencies c ON c.id = e.currency_id
          WHERE a.code = $3
            AND t.occurred_at BETWEEN $1 AND $2
          GROUP BY c.id, c.code
          ORDER BY 3 DESC`,
        [range.from, range.to, ACCOUNT_CODES.COMMISSION_INCOME],
      ),
    );
  }

  private static async voucherTotals(range: DateRange, type: VoucherType): Promise<CurrencyTotal[]> {
    return DashboardService.toTotals(
      await AppDataSource.query(
        `SELECT c.id AS currency_id, c.code, COALESCE(SUM(v.amount), 0)::text AS amount, COUNT(*)::text AS count
           FROM vouchers v
           JOIN currencies c ON c.id = v.currency_id
          WHERE v.created_at BETWEEN $1 AND $2
            AND v.type = $3
            AND v.status = 'POSTED'
          GROUP BY c.id, c.code`,
        [range.from, range.to, type],
      ),
    );
  }

  private static async dailyTrend(range: DateRange): Promise<DailyPoint[]> {
    const rows: Array<{ day: string; transfers: string; exchanges: string }> =
      await AppDataSource.query(
        `WITH days AS (
           SELECT generate_series($1::date, $2::date, interval '1 day')::date AS day
         )
         SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
                COALESCE(t.count, 0)::text AS transfers,
                COALESCE(e.count, 0)::text AS exchanges
           FROM days d
           LEFT JOIN (
             SELECT created_at::date AS day, COUNT(*) AS count
               FROM transfers
              WHERE created_at BETWEEN $1 AND $2
              GROUP BY 1
           ) t ON t.day = d.day
           LEFT JOIN (
             SELECT created_at::date AS day, COUNT(*) AS count
               FROM currency_exchanges
              WHERE created_at BETWEEN $1 AND $2
              GROUP BY 1
           ) e ON e.day = d.day
          ORDER BY d.day`,
        [range.from, range.to],
      );

    return rows.map((row) => ({
      date: row.day,
      transfers: Number(row.transfers),
      exchanges: Number(row.exchanges),
    }));
  }

  // ------------------------------------------------------------- utilities

  private static toTotals(
    rows: Array<{ currency_id: string; code: string; amount: string; count: string }>,
  ): CurrencyTotal[] {
    return rows.map((row) => ({
      currencyId: row.currency_id,
      currencyCode: row.code,
      amount: money(row.amount).toString(),
      count: Number(row.count),
    }));
  }

  private static mergeTotals(groups: CurrencyTotal[][]): CurrencyTotal[] {
    const merged = new Map<string, CurrencyTotal>();
    for (const group of groups) {
      for (const row of group) {
        const existing = merged.get(row.currencyId);
        if (existing) {
          existing.amount = money(existing.amount).add(row.amount).toString();
          existing.count += row.count;
        } else {
          merged.set(row.currencyId, { ...row });
        }
      }
    }
    return [...merged.values()];
  }
}
