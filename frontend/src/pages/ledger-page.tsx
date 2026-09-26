import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpenCheck, ChevronDown, ChevronRight as ChevronRightIcon, Scale } from 'lucide-react';
import { ledgerApi } from '@/api';
import type { AccountNode } from '@/types/api';
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui';
import { LoadingState, Money, PageHeader, StatusBadge } from '@/components/common';
import { DataTable, Pagination, type Column } from '@/components/common/data-table';
import { useI18n } from '@/context/i18n-context';
import { formatDateTime, localizedName } from '@/lib/format';
import { EntryDirection } from '@/types/enums';
import type { FinancialTransaction, TrialBalanceRow } from '@/types/api';

export default function LedgerPage() {
  const { t, language } = useI18n();
  const [page, setPage] = useState(1);
  const [reference, setReference] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const transactions = useQuery({
    queryKey: ['ledger-transactions', { page, reference }],
    queryFn: () =>
      ledgerApi.transactions({ page, limit: 25, referenceNo: reference || undefined }),
    placeholderData: (previous) => previous,
  });

  const columns: Array<Column<FinancialTransaction>> = [
    {
      key: 'referenceNo',
      header: t('ledger.reference'),
      render: (row) => <span className="numeric font-medium">{row.referenceNo}</span>,
    },
    {
      key: 'type',
      header: t('ledger.type'),
      render: (row) => <Badge tone="brand">{t(`enum.${row.type}` as never)}</Badge>,
    },
    { key: 'description', header: t('ledger.description'), render: (row) => row.description },
    {
      key: 'occurredAt',
      header: t('ledger.occurredAt'),
      hideOnMobile: true,
      render: (row) => (
        <span className="text-sm text-[var(--text-muted)]">
          {formatDateTime(row.occurredAt, language)}
        </span>
      ),
    },
    {
      key: 'createdBy',
      header: t('common.createdBy'),
      hideOnMobile: true,
      render: (row) => row.createdBy?.fullName ?? '-',
    },
    {
      key: 'reversed',
      header: '',
      render: (row) =>
        row.isReversed ? <Badge tone="negative">{t('ledger.reversed')}</Badge> : null,
    },
  ];

  return (
    <>
      <PageHeader
        title={t('ledger.title')}
        subtitle={t('ledger.subtitle')}
        icon={<BookOpenCheck className="size-5" />}
      />

      <Alert tone="info" className="mb-4">
        {t('ledger.immutableNote')}
      </Alert>

      <Tabs defaultValue="journal">
        <TabsList>
          <TabsTrigger value="journal">{t('ledger.transactions')}</TabsTrigger>
          <TabsTrigger value="trial">
            <Scale className="size-4" />
            {t('ledger.trialBalance')}
          </TabsTrigger>
          <TabsTrigger value="accounts">{t('ledger.accounts')}</TabsTrigger>
        </TabsList>

        <TabsContent value="journal">
          <div className="mb-4">
            <Input
              className="numeric w-full sm:w-72"
              dir="ltr"
              placeholder="FTX-2026-000001"
              value={reference}
              onChange={(event) => {
                setReference(event.target.value);
                setPage(1);
              }}
            />
          </div>

          <DataTable
            columns={columns}
            rows={transactions.data?.items}
            rowKey={(row) => row.id}
            isLoading={transactions.isLoading}
            onRowClick={(row) => setSelectedId(row.id)}
            footer={<Pagination meta={transactions.data?.meta} onPageChange={setPage} />}
          />
        </TabsContent>

        <TabsContent value="trial">
          <TrialBalancePanel />
        </TabsContent>

        <TabsContent value="accounts">
          <ChartOfAccountsPanel />
        </TabsContent>
      </Tabs>

      <TransactionDialog id={selectedId} onClose={() => setSelectedId(null)} />
    </>
  );
}

/**
 * Trial balance, grouped by currency.
 *
 * Each currency block must total zero on its own - that is the same invariant
 * the posting engine enforces on every single entry, shown here at the level of
 * the whole book.
 */
function TrialBalancePanel() {
  const { t, language } = useI18n();
  const trial = useQuery({
    queryKey: ['trial-balance'],
    queryFn: () => ledgerApi.trialBalance({}),
  });

  if (trial.isLoading) return <LoadingState />;

  const byCurrency = new Map<string, TrialBalanceRow[]>();
  for (const row of trial.data ?? []) {
    const rows = byCurrency.get(row.currencyCode) ?? [];
    rows.push(row);
    byCurrency.set(row.currencyCode, rows);
  }

  return (
    <div className="space-y-6">
      {[...byCurrency.entries()].map(([currencyCode, rows]) => {
        const totalDebit = rows.reduce((sum, row) => sum + Number(row.debit), 0);
        const totalCredit = rows.reduce((sum, row) => sum + Number(row.credit), 0);
        const balanced = Math.abs(totalDebit - totalCredit) < 1e-6;

        return (
          <Card key={currencyCode}>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="numeric">{currencyCode}</CardTitle>
              <Badge tone={balanced ? 'positive' : 'negative'}>
                {balanced ? t('ledger.balanced') : t('ledger.notBalanced')}
              </Badge>
            </CardHeader>
            <CardContent className="p-0 pb-2">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t('ledger.account')}</TableHead>
                    <TableHead className="num-col">{t('ledger.debit')}</TableHead>
                    <TableHead className="num-col">{t('ledger.credit')}</TableHead>
                    <TableHead className="num-col">{t('common.balance')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={`${row.accountId}-${row.currencyId}`}>
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
                      <TableCell className="num-col">
                        <Money value={row.debit} showCode={false} />
                      </TableCell>
                      <TableCell className="num-col">
                        <Money value={row.credit} showCode={false} />
                      </TableCell>
                      <TableCell className="num-col">
                        <Money value={row.balance} signed showCode={false} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-semibold">{t('common.total')}</TableCell>
                    <TableCell className="num-col">
                      <Money value={String(totalDebit)} showCode={false} />
                    </TableCell>
                    <TableCell className="num-col">
                      <Money value={String(totalCredit)} showCode={false} />
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/**
 * The chart of accounts as a tree.
 *
 * The schema has always carried `parent_id` - `1000-MAIN` under `1000`,
 * `1300-HAMZA` under `1300` - but the screen listed it flat, so a cash box
 * account sat beside its own control account instead of under it. Nesting is
 * what makes the chart readable as a structure rather than a list of codes.
 */
function AccountRow({ node, depth }: { node: AccountNode; depth: number }) {
  const { t, language } = useI18n();
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;

  return (
    <>
      <TableRow className={node.isActive ? undefined : 'opacity-60'}>
        <TableCell>
          {/* Indent with padding rather than nested tables so the columns of
              every row stay on the same grid. */}
          <div
            className="flex items-center gap-2"
            style={{ paddingInlineStart: `${depth * 1.25}rem` }}
          >
            {hasChildren ? (
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                className="rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
                aria-label={expanded ? t('common.collapse') : t('common.expand')}
              >
                {expanded ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronRightIcon className="size-4" />
                )}
              </button>
            ) : (
              <span className="inline-block size-5" />
            )}
            <span className="numeric text-xs text-[var(--text-muted)]">{node.code}</span>
            <span className={depth === 0 ? 'font-semibold' : ''}>
              {localizedName(node, language)}
            </span>
          </div>
        </TableCell>
        <TableCell>{t(`enum.${node.type}` as never)}</TableCell>
        <TableCell>
          <StatusBadge value={node.normalBalance} />
        </TableCell>
      </TableRow>

      {expanded
        ? node.children.map((child) => (
            <AccountRow key={child.id} node={child} depth={depth + 1} />
          ))
        : null}
    </>
  );
}

function ChartOfAccountsPanel() {
  const { t } = useI18n();
  const tree = useQuery({ queryKey: ['account-tree'], queryFn: () => ledgerApi.accountTree() });

  if (tree.isLoading) return <LoadingState />;

  return (
    <Card>
      <CardContent className="p-0 pb-2">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t('ledger.account')}</TableHead>
              <TableHead>{t('ledger.type')}</TableHead>
              <TableHead>{t('ledger.direction')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(tree.data ?? []).map((node) => (
              <AccountRow key={node.id} node={node} depth={0} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function TransactionDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { t, language } = useI18n();
  const detail = useQuery({
    queryKey: ['ledger-transaction', id],
    queryFn: () => ledgerApi.transactionDetail(id as string),
    enabled: Boolean(id),
  });

  return (
    <Dialog open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle className="numeric">{detail.data?.referenceNo ?? '…'}</DialogTitle>
        </DialogHeader>

        {detail.isLoading || !detail.data ? (
          <LoadingState />
        ) : (
          <>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <p>
                <span className="text-[var(--text-muted)]">{t('ledger.type')}: </span>
                {t(`enum.${detail.data.type}` as never)}
              </p>
              <p>
                <span className="text-[var(--text-muted)]">{t('ledger.occurredAt')}: </span>
                {formatDateTime(detail.data.occurredAt, language)}
              </p>
              <p className="sm:col-span-2">
                <span className="text-[var(--text-muted)]">{t('ledger.description')}: </span>
                {detail.data.description}
              </p>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>#</TableHead>
                  <TableHead>{t('ledger.account')}</TableHead>
                  <TableHead>{t('common.currency')}</TableHead>
                  <TableHead className="num-col">{t('ledger.debit')}</TableHead>
                  <TableHead className="num-col">{t('ledger.credit')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(detail.data.entries ?? []).map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="numeric text-[var(--text-muted)]">
                      {entry.lineNo}
                    </TableCell>
                    <TableCell>
                      <span className="numeric text-xs text-[var(--text-muted)]">
                        {entry.account?.code}
                      </span>{' '}
                      {entry.account ? localizedName(entry.account, language) : ''}
                    </TableCell>
                    <TableCell className="numeric">{entry.currency.code}</TableCell>
                    <TableCell className="num-col">
                      {entry.direction === EntryDirection.DEBIT ? (
                        <Money value={entry.amount} showCode={false} />
                      ) : (
                        <span className="text-[var(--text-muted)]">-</span>
                      )}
                    </TableCell>
                    <TableCell className="num-col">
                      {entry.direction === EntryDirection.CREDIT ? (
                        <Money value={entry.amount} showCode={false} />
                      ) : (
                        <span className="text-[var(--text-muted)]">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
