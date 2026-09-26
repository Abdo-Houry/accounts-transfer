import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, FileSpreadsheet, TriangleAlert } from 'lucide-react';
import { ledgerApi } from '@/api';
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui';
import { EmptyState, LoadingState, PageHeader } from '@/components/common';
import { PeriodFilter, periodToParams, type PeriodValue } from '@/components/common/period-filter';
import { useI18n } from '@/context/i18n-context';
import { formatAmount, formatDate, localizedName } from '@/lib/format';
import { ReportPeriod } from '@/types/enums';
import type { StatementSection } from '@/types/api';

/**
 * The two statements an office files, one column per currency.
 *
 * Not consolidated into a single base-currency figure on purpose: this ledger
 * balances every entry within its own currency and never invents a synthetic
 * base amount, so converting SYP, USD, EUR and TRY into one column would mean
 * picking a rate - and the answer would change every time the board moved.
 */
export default function FinancialStatementsPage() {
  const { t } = useI18n();

  return (
    <>
      <PageHeader
        title={t('statement.title')}
        subtitle={t('statement.subtitle')}
        icon={<FileSpreadsheet className="size-5" />}
      />

      <Tabs defaultValue="balance-sheet">
        <TabsList>
          <TabsTrigger value="balance-sheet">{t('statement.balanceSheet')}</TabsTrigger>
          <TabsTrigger value="income">{t('statement.incomeStatement')}</TabsTrigger>
        </TabsList>

        <TabsContent value="balance-sheet">
          <BalanceSheetPanel />
        </TabsContent>
        <TabsContent value="income">
          <IncomeStatementPanel />
        </TabsContent>
      </Tabs>
    </>
  );
}

/** A section with one row per account and a total line, columns per currency. */
function SectionRows({
  section,
  currencies,
  label,
}: {
  section: StatementSection;
  currencies: string[];
  label: string;
}) {
  const { t, language } = useI18n();
  if (section.rows.length === 0) return null;

  return (
    <>
      <TableRow className="hover:bg-transparent">
        <TableCell
          colSpan={currencies.length + 1}
          className="surface-muted text-xs font-semibold uppercase tracking-wide"
        >
          {label}
        </TableCell>
      </TableRow>

      {section.rows.map((row) => (
        <TableRow key={row.accountCode}>
          <TableCell>
            <span className="numeric text-xs text-[var(--text-muted)]">{row.accountCode}</span>{' '}
            {localizedName(
              { nameAr: row.accountNameAr, nameEn: row.accountNameEn, nameTr: row.accountNameTr },
              language,
            )}
          </TableCell>
          {currencies.map((code) => (
            <TableCell key={code} className="num-col">
              <span className="numeric">{formatAmount(row.amounts[code] ?? '0', 2, language)}</span>
            </TableCell>
          ))}
        </TableRow>
      ))}

      <TableRow className="font-semibold">
        <TableCell>{t('common.total')}</TableCell>
        {currencies.map((code) => (
          <TableCell key={code} className="num-col">
            <span className="numeric">{formatAmount(section.totals[code] ?? '0', 2, language)}</span>
          </TableCell>
        ))}
      </TableRow>
    </>
  );
}

function BalanceSheetPanel() {
  const { t, language } = useI18n();
  const query = useQuery({
    queryKey: ['balance-sheet'],
    queryFn: () => ledgerApi.balanceSheet(),
  });

  if (query.isLoading) return <LoadingState />;
  const sheet = query.data;
  if (!sheet || sheet.currencies.length === 0) return <EmptyState />;

  const cols = sheet.currencies;
  const allBalanced = cols.every((code) => sheet.balanced[code]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('statement.balanceSheet')}
          <span className="ms-2 text-sm font-normal text-[var(--text-muted)]">
            {t('statement.asOf')} {formatDate(sheet.asOf, language)}
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t('ledger.account')}</TableHead>
              {cols.map((code) => (
                <TableHead key={code} className="num-col numeric">
                  {code}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>

          <TableBody>
            <SectionRows section={sheet.assets} currencies={cols} label={t('statement.assets')} />
            <SectionRows
              section={sheet.liabilities}
              currencies={cols}
              label={t('statement.liabilities')}
            />
            <SectionRows section={sheet.equity} currencies={cols} label={t('statement.equity')} />

            <TableRow>
              <TableCell className="text-[var(--text-secondary)]">
                {t('statement.retainedResult')}
              </TableCell>
              {cols.map((code) => (
                <TableCell key={code} className="num-col">
                  <span className="numeric">
                    {formatAmount(sheet.retainedResult[code] ?? '0', 2, language)}
                  </span>
                </TableCell>
              ))}
            </TableRow>

            <TableRow className="border-t-2 border-[var(--border-strong)] font-semibold">
              <TableCell>{t('statement.totalAssets')}</TableCell>
              {cols.map((code) => (
                <TableCell key={code} className="num-col">
                  <span className="numeric">
                    {formatAmount(sheet.totalAssets[code] ?? '0', 2, language)}
                  </span>
                </TableCell>
              ))}
            </TableRow>
            <TableRow className="font-semibold">
              <TableCell>{t('statement.totalLiabilitiesAndEquity')}</TableCell>
              {cols.map((code) => (
                <TableCell key={code} className="num-col">
                  <span className="numeric">
                    {formatAmount(sheet.totalLiabilitiesAndEquity[code] ?? '0', 2, language)}
                  </span>
                </TableCell>
              ))}
            </TableRow>
          </TableBody>
        </Table>

        {/*
          The sheet states plainly whether it balances rather than leaving the
          reader to add the columns up. A NO here means the books are broken,
          which is worth shouting about.
        */}
        <div
          className={
            'flex items-center gap-2 border-t border-[var(--border-subtle)] px-4 py-3 text-sm ' +
            (allBalanced ? 'text-[var(--color-positive)]' : 'text-[var(--color-negative)]')
          }
        >
          {allBalanced ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <TriangleAlert className="size-4" />
          )}
          {allBalanced ? t('statement.balanced') : t('statement.notBalanced')}
          <span className="text-[var(--text-muted)]">
            (
            {cols
              .map((code) => `${code}: ${sheet.balanced[code] ? '✓' : '✗'}`)
              .join('  ')}
            )
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function IncomeStatementPanel() {
  const { t, language } = useI18n();
  const [period, setPeriod] = useState<PeriodValue>({ period: ReportPeriod.MONTH });
  const range = periodToParams(period);

  const query = useQuery({
    queryKey: ['income-statement', range],
    queryFn: () => ledgerApi.incomeStatement(range),
  });

  const income = query.data;
  const cols = income?.currencies ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle>{t('statement.incomeStatement')}</CardTitle>
        <PeriodFilter value={period} onChange={setPeriod} />
      </CardHeader>

      <CardContent className="p-0">
        {query.isLoading ? (
          <LoadingState />
        ) : !income || cols.length === 0 ? (
          <EmptyState />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t('ledger.account')}</TableHead>
                {cols.map((code) => (
                  <TableHead key={code} className="num-col numeric">
                    {code}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>

            <TableBody>
              <SectionRows
                section={income.revenue}
                currencies={cols}
                label={t('statement.revenue')}
              />
              <SectionRows
                section={income.expenses}
                currencies={cols}
                label={t('statement.expenses')}
              />

              <TableRow className="border-t-2 border-[var(--border-strong)] font-semibold">
                <TableCell>{t('statement.netResult')}</TableCell>
                {cols.map((code) => {
                  const value = Number(income.netResult[code] ?? 0);
                  return (
                    <TableCell key={code} className="num-col">
                      <span
                        className={
                          'numeric ' +
                          (value > 0
                            ? 'text-[var(--color-positive)]'
                            : value < 0
                              ? 'text-[var(--color-negative)]'
                              : '')
                        }
                      >
                        {formatAmount(income.netResult[code] ?? '0', 2, language)}
                      </span>
                    </TableCell>
                  );
                })}
              </TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
