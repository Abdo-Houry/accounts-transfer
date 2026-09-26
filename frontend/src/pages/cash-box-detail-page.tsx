import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Lock, Scale as ScaleIcon, Vault, Wallet } from 'lucide-react';
import { cashBoxesApi } from '@/api';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  NumericInput,
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
import {
  ErrorState,
  FormField,
  LoadingState,
  Money,
  PageHeader,
  PermissionGate,
  StatusBadge,
} from '@/components/common';
import { DataTable, Pagination, type Column } from '@/components/common/data-table';
import { CurrencySelect } from '@/components/common/pickers';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { useMutationFeedback } from '@/features/reference/use-mutation-feedback';
import { useI18n } from '@/context/i18n-context';
import { formatDateTime, localizedName } from '@/lib/format';
import { PERMISSIONS } from '@/lib/permissions';
import { EntryDirection } from '@/types/enums';
import type { LedgerEntry } from '@/types/api';

export default function CashBoxDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, language } = useI18n();
  const [page, setPage] = useState(1);
  const [openingOpen, setOpeningOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  const box = useQuery({
    queryKey: ['cash-box', id],
    queryFn: () => cashBoxesApi.detail(id as string),
    enabled: Boolean(id),
  });

  const statement = useQuery({
    queryKey: ['cash-box-statement', id, page],
    queryFn: () => cashBoxesApi.statement(id as string, { page, limit: 25 }),
    enabled: Boolean(id),
    placeholderData: (previous) => previous,
  });

  const feedback = useMutationFeedback([['cash-box'], ['cash-boxes'], ['cash-box-balances']]);
  const closeBox = useMutation({
    mutationFn: () => cashBoxesApi.close(id as string),
    onSuccess: (result) => {
      feedback.onSuccess(result);
      setCloseOpen(false);
      void box.refetch();
    },
    onError: feedback.onError,
  });

  if (box.isLoading) return <LoadingState />;
  if (box.isError || !box.data) return <ErrorState onRetry={() => box.refetch()} />;

  const data = box.data;

  const columns: Array<Column<LedgerEntry>> = [
    {
      key: 'date',
      header: t('common.date'),
      render: (row) => (
        <span className="text-sm">
          {formatDateTime(row.transaction?.occurredAt ?? row.createdAt, language)}
        </span>
      ),
    },
    {
      key: 'reference',
      header: t('ledger.reference'),
      render: (row) => (
        <span className="numeric text-sm">{row.transaction?.referenceNo ?? '-'}</span>
      ),
    },
    {
      key: 'description',
      header: t('ledger.description'),
      render: (row) => <span className="text-sm">{row.description}</span>,
    },
    {
      key: 'currency',
      header: t('common.currency'),
      render: (row) => <span className="numeric text-sm">{row.currency.code}</span>,
    },
    {
      key: 'in',
      header: t('cashbox.debit'),
      numeric: true,
      render: (row) =>
        row.direction === EntryDirection.DEBIT ? (
          <Money value={row.amount} currency={row.currency} showCode={false} className="text-[var(--color-positive)]" />
        ) : (
          <span className="text-[var(--text-muted)]">-</span>
        ),
    },
    {
      key: 'out',
      header: t('cashbox.credit'),
      numeric: true,
      render: (row) =>
        row.direction === EntryDirection.CREDIT ? (
          <Money value={row.amount} currency={row.currency} showCode={false} className="text-[var(--color-negative)]" />
        ) : (
          <span className="text-[var(--text-muted)]">-</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title={localizedName(data, language)}
        subtitle={`${data.code}${data.branch ? ` · ${data.branch}` : ''}`}
        icon={<Vault className="size-5" />}
        actions={
          <>
            <StatusBadge value={data.status} />
            <PermissionGate permission={PERMISSIONS.CASHBOX_OPENING}>
              <Button variant="outline" onClick={() => setOpeningOpen(true)}>
                <Wallet />
                {t('cashbox.openingBalance')}
              </Button>
            </PermissionGate>
            <PermissionGate permission={PERMISSIONS.CASHBOX_CLOSE}>
              <Button variant="outline" onClick={() => setCloseOpen(true)}>
                <Lock />
                {t('cashbox.close')}
              </Button>
            </PermissionGate>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(data.balances ?? []).map((balance) => (
          <Card key={balance.id} className="p-4">
            <p className="numeric text-sm text-[var(--text-muted)]">{balance.currency.code}</p>
            <p className="mt-1">
              <Money
                value={balance.balance}
                currency={balance.currency}
                showCode={false}
                className="text-2xl"
              />
            </p>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="statement">
        <TabsList>
          <TabsTrigger value="statement">{t('cashbox.statement')}</TabsTrigger>
          <PermissionGate permission={PERMISSIONS.CASHBOX_RECONCILE}>
            <TabsTrigger value="reconciliation">
              <ScaleIcon className="size-4" />
              {t('cashbox.reconcile')}
            </TabsTrigger>
          </PermissionGate>
        </TabsList>

        <TabsContent value="statement">
          <DataTable
            columns={columns}
            rows={statement.data?.items}
            rowKey={(row) => row.id}
            isLoading={statement.isLoading}
            emptyDescription={t('cashbox.noBalances')}
            footer={<Pagination meta={statement.data?.meta} onPageChange={setPage} />}
          />
        </TabsContent>

        <TabsContent value="reconciliation">
          <ReconciliationPanel cashBoxId={data.id} />
        </TabsContent>
      </Tabs>

      <OpeningBalanceDialog
        // Remounts per open, so the form never reopens holding the last entry.
        key={openingOpen ? 'open' : 'closed'}
        cashBoxId={data.id}
        open={openingOpen}
        onOpenChange={setOpeningOpen}
        onSaved={() => void box.refetch()}
      />

      <ConfirmDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        title={t('cashbox.close')}
        description={t('cashbox.confirmClose', { name: localizedName(data, language) })}
        tone="danger"
        loading={closeBox.isPending}
        onConfirm={() => closeBox.mutate()}
      />
    </>
  );
}

/**
 * Reconciliation.
 *
 * Compares the cached balance against the sum of the ledger for the same box
 * and currency. They must agree - a difference means something wrote a balance
 * without going through the posting engine, which is worth investigating rather
 * than silently correcting.
 */
function ReconciliationPanel({ cashBoxId }: { cashBoxId: string }) {
  const { t } = useI18n();
  const reconcile = useQuery({
    queryKey: ['cash-box-reconcile', cashBoxId],
    queryFn: () => cashBoxesApi.reconcile(cashBoxId),
  });

  if (reconcile.isLoading) return <LoadingState />;
  if (reconcile.isError || !reconcile.data) return <ErrorState onRetry={() => reconcile.refetch()} />;

  const { data, message } = reconcile.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('cashbox.reconcile')}</CardTitle>
        <p className="text-sm text-[var(--text-muted)]">{t('cashbox.reconcileHint')}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert tone={data.balanced ? 'success' : 'error'}>{message}</Alert>

        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t('common.currency')}</TableHead>
              <TableHead className="num-col">{t('cashbox.recordedBalance')}</TableHead>
              <TableHead className="num-col">{t('cashbox.ledgerBalance')}</TableHead>
              <TableHead className="num-col">{t('cashbox.difference')}</TableHead>
              <TableHead>{t('cashbox.matches')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((row) => (
              <TableRow key={row.currencyId}>
                <TableCell className="numeric font-medium">{row.currencyCode}</TableCell>
                <TableCell className="num-col">
                  <Money value={row.recordedBalance} showCode={false} />
                </TableCell>
                <TableCell className="num-col">
                  <Money value={row.ledgerBalance} showCode={false} />
                </TableCell>
                <TableCell className="num-col">
                  <Money value={row.difference} signed showCode={false} />
                </TableCell>
                <TableCell>
                  {row.matches ? (
                    <CheckCircle2 className="size-4 text-[var(--color-positive)]" />
                  ) : (
                    <span className="text-[var(--color-negative)]">✕</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function OpeningBalanceDialog({
  cashBoxId,
  open,
  onOpenChange,
  onSaved,
}: {
  cashBoxId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const feedback = useMutationFeedback([['cash-box'], ['cash-boxes']]);
  const [currencyId, setCurrencyId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const save = useMutation({
    mutationFn: () =>
      cashBoxesApi.openingBalance(cashBoxId, { currencyId, amount, note: note || undefined }),
    onSuccess: (result) => {
      feedback.onSuccess(result);
      onOpenChange(false);
      setAmount('');
      onSaved();
    },
    onError: feedback.onError,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{t('cashbox.openingBalance')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <FormField label={t('common.currency')} required>
            <CurrencySelect value={currencyId || undefined} onChange={setCurrencyId} />
          </FormField>
          <FormField label={t('common.amount')} required>
            <NumericInput value={amount} onChange={(event) => setAmount(event.target.value)} />
          </FormField>
          <FormField label={t('common.notes')}>
            <Input value={note} onChange={(event) => setNote(event.target.value)} />
          </FormField>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => save.mutate()}
            loading={save.isPending}
            disabled={!currencyId || Number(amount) <= 0}
          >
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
