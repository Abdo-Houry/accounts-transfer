import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { reportsApi, type ReportParams } from '@/api/reports.api';
import {
  Alert,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui';
import { EmptyState, LoadingState, Money, PageHeader, StatusBadge } from '@/components/common';
import { PeriodFilter, periodToParams, type PeriodValue } from '@/components/common/period-filter';
import { usePermissions } from '@/context/auth-context';
import { useI18n } from '@/context/i18n-context';
import { formatAmount, localizedName } from '@/lib/format';
import { PERMISSIONS } from '@/lib/permissions';
import { AccountType, ReportPeriod } from '@/types/enums';
import type { ReportEnvelope } from '@/types/api';

type ReportKey =
  | 'transfers'
  | 'exchanges'
  | 'commissions'
  | 'cashBoxes'
  | 'profitLoss'
  | 'customers'
  | 'employees';

export default function ReportsPage() {
  const { t } = useI18n();
  const { can } = usePermissions();
  const [period, setPeriod] = useState<PeriodValue>({ period: ReportPeriod.MONTH });
  const params = periodToParams(period);

  const financial = can(PERMISSIONS.REPORT_FINANCIAL);
  const operational = can(PERMISSIONS.REPORT_OPERATIONAL);

  const allTabs: Array<{ key: ReportKey; label: string; visible: boolean }> = [
    { key: 'transfers', label: t('report.transfers'), visible: operational },
    { key: 'exchanges', label: t('report.exchanges'), visible: operational },
    { key: 'commissions', label: t('report.commissions'), visible: financial },
    { key: 'cashBoxes', label: t('report.cashBoxes'), visible: financial },
    { key: 'profitLoss', label: t('report.profitLoss'), visible: financial },
    { key: 'customers', label: t('report.customers'), visible: operational },
    { key: 'employees', label: t('report.employees'), visible: operational },
  ];

  // A report the operator cannot open should not even be offered as a tab.
  const tabs = allTabs.filter((tab) => tab.visible);

  if (tabs.length === 0) {
    return <EmptyState title={t('feedback.forbidden')} />;
  }

  return (
    <>
      <PageHeader
        title={t('report.title')}
        subtitle={t('report.subtitle')}
        icon={<FileText className="size-5" />}
        actions={<PeriodFilter value={period} onChange={setPeriod} />}
      />

      <Alert tone="info" className="mb-4">
        {t('report.perCurrencyNote')}
      </Alert>

      <Tabs defaultValue={tabs[0].key}>
        <TabsList className="flex-wrap">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map((tab) => (
          <TabsContent key={tab.key} value={tab.key}>
            <ReportPanel reportKey={tab.key} params={params} />
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}

function ReportPanel({ reportKey, params }: { reportKey: ReportKey; params: ReportParams }) {
  const { t, language } = useI18n();

  // Each report returns a different row shape; the panel renders one branch per
  // report, so the rows are carried as `unknown` and narrowed at the branch.
  const query = useQuery<ReportEnvelope<unknown>>({
    queryKey: ['report', reportKey, params],
    queryFn: () => reportsApi[reportKey](params) as Promise<ReportEnvelope<unknown>>,
  });

  if (query.isLoading) return <LoadingState />;
  if (!query.data || query.data.rows.length === 0) return <Card><EmptyState /></Card>;

  const rows = query.data.rows as never[];

  return (
    <Card>
      <CardContent className="p-0 pb-2">
        <Table>
          {reportKey === 'transfers' ? (
            <>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t('common.currency')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead className="num-col">{t('common.count')}</TableHead>
                  <TableHead className="num-col">{t('common.amount')}</TableHead>
                  <TableHead className="num-col">{t('transfer.commission')}</TableHead>
                  <TableHead className="num-col">{t('transfer.payoutAmount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rows as Array<{
                  currencyCode: string;
                  status: string;
                  count: number;
                  amount: string;
                  commission: string;
                  payoutAmount: string;
                }>).map((row, index) => (
                  <TableRow key={index}>
                    <TableCell className="numeric font-medium">{row.currencyCode}</TableCell>
                    <TableCell>
                      <StatusBadge value={row.status} />
                    </TableCell>
                    <TableCell className="numeric num-col">
                      {formatAmount(row.count, 0, language)}
                    </TableCell>
                    <TableCell className="num-col">
                      <Money value={row.amount} showCode={false} />
                    </TableCell>
                    <TableCell className="num-col">
                      <Money value={row.commission} showCode={false} />
                    </TableCell>
                    <TableCell className="num-col">
                      <Money value={row.payoutAmount} showCode={false} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </>
          ) : reportKey === 'exchanges' ? (
            <>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t('exchange.type')}</TableHead>
                  <TableHead>{t('exchange.fromCurrency')}</TableHead>
                  <TableHead>{t('exchange.toCurrency')}</TableHead>
                  <TableHead className="num-col">{t('common.count')}</TableHead>
                  <TableHead className="num-col">{t('exchange.fromAmount')}</TableHead>
                  <TableHead className="num-col">{t('exchange.toAmount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rows as Array<{
                  type: string;
                  fromCurrency: string;
                  toCurrency: string;
                  count: number;
                  fromAmount: string;
                  toAmount: string;
                }>).map((row, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <StatusBadge value={row.type} />
                    </TableCell>
                    <TableCell className="numeric">{row.fromCurrency}</TableCell>
                    <TableCell className="numeric">{row.toCurrency}</TableCell>
                    <TableCell className="numeric num-col">
                      {formatAmount(row.count, 0, language)}
                    </TableCell>
                    <TableCell className="num-col">
                      <Money value={row.fromAmount} showCode={false} />
                    </TableCell>
                    <TableCell className="num-col">
                      <Money value={row.toAmount} showCode={false} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </>
          ) : reportKey === 'commissions' ? (
            <>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t('common.currency')}</TableHead>
                  <TableHead>{t('ledger.source')}</TableHead>
                  <TableHead className="num-col">{t('common.count')}</TableHead>
                  <TableHead className="num-col">{t('common.amount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rows as Array<{
                  currencyCode: string;
                  source: string;
                  count: number;
                  amount: string;
                }>).map((row, index) => (
                  <TableRow key={index}>
                    <TableCell className="numeric font-medium">{row.currencyCode}</TableCell>
                    <TableCell>{row.source}</TableCell>
                    <TableCell className="numeric num-col">
                      {formatAmount(row.count, 0, language)}
                    </TableCell>
                    <TableCell className="num-col">
                      <Money value={row.amount} showCode={false} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </>
          ) : reportKey === 'cashBoxes' ? (
            <>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t('cashbox.name')}</TableHead>
                  <TableHead>{t('common.currency')}</TableHead>
                  <TableHead className="num-col">{t('report.opening')}</TableHead>
                  <TableHead className="num-col">{t('report.inflow')}</TableHead>
                  <TableHead className="num-col">{t('report.outflow')}</TableHead>
                  <TableHead className="num-col">{t('report.closing')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rows as Array<{
                  cashBoxCode: string;
                  cashBoxNameAr: string;
                  cashBoxNameEn: string;
                  cashBoxNameTr: string;
                  currencyCode: string;
                  openingBalance: string;
                  inflow: string;
                  outflow: string;
                  closingBalance: string;
                }>).map((row, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      {localizedName(
                        {
                          nameAr: row.cashBoxNameAr,
                          nameEn: row.cashBoxNameEn,
                          nameTr: row.cashBoxNameTr,
                        },
                        language,
                      )}
                    </TableCell>
                    <TableCell className="numeric">{row.currencyCode}</TableCell>
                    <TableCell className="num-col">
                      <Money value={row.openingBalance} showCode={false} />
                    </TableCell>
                    <TableCell className="num-col">
                      <Money
                        value={row.inflow}
                        showCode={false}
                        className="text-[var(--color-positive)]"
                      />
                    </TableCell>
                    <TableCell className="num-col">
                      <Money
                        value={row.outflow}
                        showCode={false}
                        className="text-[var(--color-negative)]"
                      />
                    </TableCell>
                    <TableCell className="num-col font-semibold">
                      <Money value={row.closingBalance} showCode={false} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </>
          ) : reportKey === 'profitLoss' ? (
            <>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t('ledger.account')}</TableHead>
                  <TableHead>{t('ledger.type')}</TableHead>
                  <TableHead>{t('common.currency')}</TableHead>
                  <TableHead className="num-col">{t('common.amount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rows as Array<{
                  accountCode: string;
                  accountNameAr: string;
                  accountNameEn: string;
                  accountNameTr: string;
                  type: AccountType;
                  currencyCode: string;
                  amount: string;
                }>).map((row, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <span className="numeric text-xs text-[var(--text-muted)]">
                        {row.accountCode}
                      </span>{' '}
                      {localizedName(
                        {
                          nameAr: row.accountNameAr,
                          nameEn: row.accountNameEn,
                          nameTr: row.accountNameTr,
                        },
                        language,
                      )}
                    </TableCell>
                    <TableCell>
                      {row.type === AccountType.REVENUE ? t('report.revenue') : t('report.expense')}
                    </TableCell>
                    <TableCell className="numeric">{row.currencyCode}</TableCell>
                    <TableCell className="num-col">
                      <Money
                        value={row.amount}
                        showCode={false}
                        className={
                          row.type === AccountType.REVENUE
                            ? 'text-[var(--color-positive)]'
                            : 'text-[var(--color-negative)]'
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </>
          ) : reportKey === 'customers' ? (
            <>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t('customer.no')}</TableHead>
                  <TableHead>{t('customer.name')}</TableHead>
                  <TableHead className="num-col">{t('nav.transfers')}</TableHead>
                  <TableHead className="num-col">{t('customer.exchanges')}</TableHead>
                  <TableHead className="num-col">{t('report.volume')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rows as Array<{
                  customerId: string;
                  customerNo: string;
                  fullName: string;
                  transfers: number;
                  exchanges: number;
                  currencyCode: string | null;
                  volume: string;
                }>).map((row) => (
                  <TableRow key={row.customerId}>
                    <TableCell className="numeric">{row.customerNo}</TableCell>
                    <TableCell>{row.fullName}</TableCell>
                    <TableCell className="numeric num-col">
                      {formatAmount(row.transfers, 0, language)}
                    </TableCell>
                    <TableCell className="numeric num-col">
                      {formatAmount(row.exchanges, 0, language)}
                    </TableCell>
                    <TableCell className="num-col">
                      <Money
                        value={row.volume}
                        currency={
                          row.currencyCode ? { code: row.currencyCode, decimalPlaces: 2 } : undefined
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </>
          ) : (
            <>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t('user.fullName')}</TableHead>
                  <TableHead className="num-col">{t('report.transfersCreated')}</TableHead>
                  <TableHead className="num-col">{t('report.transfersPaid')}</TableHead>
                  <TableHead className="num-col">{t('customer.exchanges')}</TableHead>
                  <TableHead className="num-col">{t('customer.vouchers')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rows as Array<{
                  userId: string;
                  fullName: string;
                  transfersCreated: number;
                  transfersPaid: number;
                  exchanges: number;
                  vouchers: number;
                }>).map((row) => (
                  <TableRow key={row.userId}>
                    <TableCell>{row.fullName}</TableCell>
                    <TableCell className="numeric num-col">
                      {formatAmount(row.transfersCreated, 0, language)}
                    </TableCell>
                    <TableCell className="numeric num-col">
                      {formatAmount(row.transfersPaid, 0, language)}
                    </TableCell>
                    <TableCell className="numeric num-col">
                      {formatAmount(row.exchanges, 0, language)}
                    </TableCell>
                    <TableCell className="numeric num-col">
                      {formatAmount(row.vouchers, 0, language)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </>
          )}
        </Table>
      </CardContent>
    </Card>
  );
}
