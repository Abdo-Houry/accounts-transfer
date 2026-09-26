import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowLeftRight,
  Coins,
  Percent,
  Receipt,
  Send,
  Vault,
  Wallet,
} from 'lucide-react';
import { dashboardApi } from '@/api';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Money,
  PageHeader,
  StatCard,
  StatusBadge,
} from '@/components/common';
import { PeriodFilter, periodToParams, type PeriodValue } from '@/components/common/period-filter';
import { useI18n } from '@/context/i18n-context';
import { formatAmount, formatDateTime, localizedName } from '@/lib/format';
import { ReportPeriod } from '@/types/enums';
import type { CurrencyTotal } from '@/types/api';

export default function DashboardPage() {
  const { t, language } = useI18n();
  const [period, setPeriod] = useState<PeriodValue>({ period: ReportPeriod.TODAY });

  const params = periodToParams(period);

  const summary = useQuery({
    queryKey: ['dashboard', 'summary', params],
    queryFn: () => dashboardApi.summary(params),
  });

  const activity = useQuery({
    queryKey: ['dashboard', 'activity'],
    queryFn: () => dashboardApi.recentActivity(8),
  });

  if (summary.isError) {
    return <ErrorState onRetry={() => summary.refetch()} />;
  }

  const data = summary.data;

  return (
    <>
      <PageHeader
        title={t('dashboard.title')}
        subtitle={t('dashboard.subtitle')}
        actions={<PeriodFilter value={period} onChange={setPeriod} />}
      />

      {summary.isLoading || !data ? (
        <LoadingState />
      ) : (
        <div className="space-y-6">
          {/* Headline counters: the four transfer states an operator cares about. */}
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={t('dashboard.totalTransfers')}
              value={formatAmount(data.transfers.total, 0, language)}
              icon={<ArrowLeftRight className="size-4" />}
              tone="brand"
            />
            <StatCard
              label={t('dashboard.pending')}
              value={formatAmount(data.transfers.pending, 0, language)}
              icon={<Send className="size-4" />}
              tone="warning"
            />
            <StatCard
              label={t('dashboard.received')}
              value={formatAmount(data.transfers.received, 0, language)}
              icon={<Receipt className="size-4" />}
              tone="positive"
            />
            <StatCard
              label={t('dashboard.exchanges')}
              value={formatAmount(data.exchanges.total, 0, language)}
              icon={<Coins className="size-4" />}
              tone="gold"
            />
          </section>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Cash boxes: the figure the office checks first every morning. */}
            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Vault className="size-4 text-brand-600" />
                  {t('dashboard.cashBoxBalances')}
                </CardTitle>
                <Link to="/cash-boxes" className="text-sm text-brand-600 hover:underline">
                  {t('common.details')}
                </Link>
              </CardHeader>
              <CardContent className="p-0 pb-2">
                {data.cashBoxBalances.length === 0 ? (
                  <EmptyState description={t('cashbox.noBalances')} />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>{t('cashbox.name')}</TableHead>
                        <TableHead>{t('common.currency')}</TableHead>
                        <TableHead className="num-col">{t('common.balance')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.cashBoxBalances.map((row) => (
                        <TableRow key={`${row.cashBoxId}-${row.currencyId}`}>
                          <TableCell className="font-medium">
                            {localizedName(
                              {
                                nameAr: row.cashBoxNameAr,
                                nameEn: row.cashBoxNameEn,
                                nameTr: row.cashBoxNameTr,
                              },
                              language,
                            )}
                          </TableCell>
                          <TableCell className="numeric text-[var(--text-muted)]">
                            {row.currencyCode}
                          </TableCell>
                          <TableCell className="num-col">
                            <Money value={row.balance} showCode={false} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <div className="space-y-6">
              <CurrencyTotalsCard
                title={t('dashboard.commissions')}
                icon={<Percent className="size-4 text-gold-600" />}
                rows={data.commissions}
              />
              <CurrencyTotalsCard
                title={t('dashboard.receipts')}
                icon={<Wallet className="size-4 text-[var(--color-positive)]" />}
                rows={data.vouchers.receiptsByCurrency}
              />
              <CurrencyTotalsCard
                title={t('dashboard.payments')}
                icon={<Wallet className="size-4 text-[var(--color-negative)]" />}
                rows={data.vouchers.paymentsByCurrency}
              />
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('dashboard.recentActivity')}</CardTitle>
            </CardHeader>
            <CardContent className="p-0 pb-2">
              {activity.isLoading ? (
                <LoadingState />
              ) : (activity.data?.transfers.length ?? 0) === 0 ? (
                <EmptyState description={t('dashboard.noActivity')} />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>{t('transfer.no')}</TableHead>
                      <TableHead>{t('transfer.beneficiary')}</TableHead>
                      <TableHead className="num-col">{t('common.amount')}</TableHead>
                      <TableHead>{t('common.status')}</TableHead>
                      <TableHead className="hidden md:table-cell">{t('common.createdAt')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(activity.data?.transfers ?? []).map((transfer) => (
                      <TableRow key={transfer.id}>
                        <TableCell>
                          <Link
                            to={`/transfers/${transfer.id}`}
                            className="numeric font-medium text-brand-600 hover:underline"
                          >
                            {transfer.transferNo}
                          </Link>
                        </TableCell>
                        <TableCell className="truncate">{transfer.beneficiaryName}</TableCell>
                        <TableCell className="num-col">
                          <Money value={transfer.amount} currency={transfer.currency} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge value={transfer.status} />
                        </TableCell>
                        <TableCell className="hidden text-[var(--text-muted)] md:table-cell">
                          {formatDateTime(transfer.createdAt, language)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

/**
 * Totals are listed per currency rather than summed.
 *
 * A multi-currency book has no single meaningful grand total, and showing one
 * would invite an operator to trust a number that does not mean anything.
 */
function CurrencyTotalsCard({
  title,
  icon,
  rows,
}: {
  title: string;
  icon: React.ReactNode;
  rows: CurrencyTotal[];
}) {
  const { t } = useI18n();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-2 text-sm text-[var(--text-muted)]">{t('dashboard.noActivity')}</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.currencyId} className="flex items-center justify-between gap-3">
                <span className="numeric text-sm text-[var(--text-muted)]">{row.currencyCode}</span>
                <Money value={row.amount} showCode={false} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
