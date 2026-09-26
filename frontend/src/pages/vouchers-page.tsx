import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Ban, Minus, Plus, Wallet } from 'lucide-react';
import { vouchersApi } from '@/api';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  NumericInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@/components/ui';
import {
  FormField,
  Money,
  PageHeader,
  PermissionGate,
  SearchInput,
  StatusBadge,
} from '@/components/common';
import { DataTable, Pagination, type Column } from '@/components/common/data-table';
import {
  CashBoxSelect,
  CorrespondentSelect,
  CurrencySelect,
  CustomerPicker,
} from '@/components/common/pickers';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { useDebouncedValue } from '@/features/reference/use-debounced-value';
import { useMutationFeedback } from '@/features/reference/use-mutation-feedback';
import { useAuth } from '@/context/auth-context';
import { useI18n } from '@/context/i18n-context';
import { formatDateTime } from '@/lib/format';
import { PERMISSIONS } from '@/lib/permissions';
import { VoucherCategory, VoucherStatus, VoucherType } from '@/types/enums';
import type { Customer, Voucher } from '@/types/api';

export default function VouchersPage() {
  const { t, language } = useI18n();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<VoucherType | 'ALL'>('ALL');
  const [dialogType, setDialogType] = useState<VoucherType | null>(null);
  const [voiding, setVoiding] = useState<Voucher | null>(null);

  const debounced = useDebouncedValue(search, 350);
  const feedback = useMutationFeedback([['vouchers'], ['cash-boxes'], ['dashboard']]);

  const query = useQuery({
    queryKey: ['vouchers', { page, q: debounced, type }],
    queryFn: () =>
      vouchersApi.list({
        page,
        limit: 25,
        q: debounced || undefined,
        type: type === 'ALL' ? undefined : type,
      }),
    placeholderData: (previous) => previous,
  });

  const voidVoucher = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => vouchersApi.void(id, reason),
    onSuccess: (result) => {
      feedback.onSuccess(result);
      setVoiding(null);
      void query.refetch();
    },
    onError: feedback.onError,
  });

  const columns: Array<Column<Voucher>> = [
    {
      key: 'voucherNo',
      header: t('voucher.no'),
      render: (row) => <span className="numeric font-medium">{row.voucherNo}</span>,
    },
    {
      key: 'type',
      header: t('voucher.type'),
      render: (row) => (
        <StatusBadge value={row.type === VoucherType.RECEIPT ? 'DEBIT' : 'CREDIT'} />
      ),
    },
    {
      key: 'amount',
      header: t('common.amount'),
      numeric: true,
      render: (row) => (
        <Money
          value={row.amount}
          currency={row.currency}
          className={
            row.type === VoucherType.RECEIPT
              ? 'text-[var(--color-positive)]'
              : 'text-[var(--color-negative)]'
          }
        />
      ),
    },
    {
      key: 'category',
      header: t('voucher.category'),
      hideOnMobile: true,
      render: (row) => t(`enum.${row.category}` as never),
    },
    { key: 'reason', header: t('common.reason'), render: (row) => row.reason },
    {
      key: 'counterparty',
      header: t('voucher.counterparty'),
      hideOnMobile: true,
      render: (row) => row.customer?.fullName ?? row.counterpartyName ?? '-',
    },
    {
      key: 'status',
      header: t('common.status'),
      render: (row) => <StatusBadge value={row.status} />,
    },
    {
      key: 'createdAt',
      header: t('common.createdAt'),
      hideOnMobile: true,
      render: (row) => (
        <span className="text-sm text-[var(--text-muted)]">
          {formatDateTime(row.createdAt, language)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row) =>
        row.status === VoucherStatus.POSTED ? (
          <PermissionGate permission={PERMISSIONS.VOUCHER_VOID}>
            <Button variant="ghost" size="sm" onClick={() => setVoiding(row)}>
              <Ban />
            </Button>
          </PermissionGate>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title={t('voucher.title')}
        subtitle={t('voucher.subtitle')}
        icon={<Wallet className="size-5" />}
        actions={
          <>
            <PermissionGate permission={PERMISSIONS.VOUCHER_RECEIPT}>
              <Button onClick={() => setDialogType(VoucherType.RECEIPT)}>
                <Plus />
                {t('voucher.newReceipt')}
              </Button>
            </PermissionGate>
            <PermissionGate permission={PERMISSIONS.VOUCHER_PAYMENT}>
              <Button variant="outline" onClick={() => setDialogType(VoucherType.PAYMENT)}>
                <Minus />
                {t('voucher.newPayment')}
              </Button>
            </PermissionGate>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          className="w-full sm:w-80"
        />
        <Select
          value={type}
          onValueChange={(value) => {
            setType(value as VoucherType | 'ALL');
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder={t('voucher.type')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('common.all')}</SelectItem>
            <SelectItem value={VoucherType.RECEIPT}>{t('voucher.receipts')}</SelectItem>
            <SelectItem value={VoucherType.PAYMENT}>{t('voucher.payments')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={query.data?.items}
        rowKey={(row) => row.id}
        isLoading={query.isLoading}
        error={query.isError ? t('common.errorTitle') : null}
        onRetry={() => query.refetch()}
        footer={<Pagination meta={query.data?.meta} onPageChange={setPage} />}
      />

      <VoucherDialog
        key={dialogType ?? 'closed'}
        type={dialogType}
        onClose={() => setDialogType(null)}
        onSaved={() => void query.refetch()}
      />

      <ConfirmDialog
        open={voiding !== null}
        onOpenChange={(open) => !open && setVoiding(null)}
        title={t('voucher.void')}
        description={voiding ? t('voucher.confirmVoid', { no: voiding.voucherNo }) : undefined}
        tone="danger"
        reasonLabel={t('voucher.voidReason')}
        loading={voidVoucher.isPending}
        onConfirm={async (reason) => {
          if (!voiding) return;
          await voidVoucher.mutateAsync({ id: voiding.id, reason: reason ?? '' });
        }}
      />
    </>
  );
}

/**
 * One dialog serves both voucher kinds: they differ only in direction and in
 * which account the non-cash side hits, which the server decides from the
 * category.
 */
function VoucherDialog({
  type,
  onClose,
  onSaved,
}: {
  type: VoucherType | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const feedback = useMutationFeedback([['vouchers'], ['cash-boxes'], ['dashboard']]);

  const [amount, setAmount] = useState('');
  const [currencyId, setCurrencyId] = useState('');
  const [cashBoxId, setCashBoxId] = useState(user?.defaultCashBoxId ?? '');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [correspondentId, setCorrespondentId] = useState<string | undefined>(undefined);
  const [counterpartyName, setCounterpartyName] = useState('');
  const [category, setCategory] = useState<VoucherCategory>(VoucherCategory.OTHER);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const create = useMutation({
    mutationFn: () => {
      const payload = {
        amount,
        currencyId,
        cashBoxId,
        customerId: customer?.id ?? null,
        correspondentId: correspondentId ?? null,
        counterpartyName: counterpartyName || null,
        category,
        reason,
        notes: notes || null,
      };
      return type === VoucherType.RECEIPT
        ? vouchersApi.createReceipt(payload)
        : vouchersApi.createPayment(payload);
    },
    onSuccess: (result) => {
      feedback.onSuccess(result);
      onSaved();
      onClose();
      setAmount('');
      setReason('');
      setNotes('');
    },
    onError: feedback.onError,
  });

  const needsCorrespondent = category === VoucherCategory.CORRESPONDENT_SETTLEMENT;
  const valid =
    Number(amount) > 0 &&
    currencyId &&
    cashBoxId &&
    reason.trim().length >= 3 &&
    (!needsCorrespondent || Boolean(correspondentId));

  return (
    <Dialog open={type !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            {type === VoucherType.RECEIPT ? t('voucher.newReceipt') : t('voucher.newPayment')}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('common.amount')} required>
            <NumericInput value={amount} onChange={(event) => setAmount(event.target.value)} />
          </FormField>
          <FormField label={t('common.currency')} required>
            <CurrencySelect value={currencyId || undefined} onChange={setCurrencyId} />
          </FormField>
          <FormField label={t('transfer.cashBox')} required>
            <CashBoxSelect value={cashBoxId || undefined} onChange={setCashBoxId} />
          </FormField>
          <FormField label={t('voucher.category')}>
            <Select value={category} onValueChange={(value) => setCategory(value as VoucherCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(VoucherCategory).map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`enum.${value}` as never)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {/*
            A settlement moves a partner's current account rather than booking
            income or expense, so the category decides whether this is asked
            for at all - and the server refuses the category without it.
          */}
          {category === VoucherCategory.CORRESPONDENT_SETTLEMENT ? (
            <FormField
              label={t('correspondent.settlement')}
              required
              className="sm:col-span-2"
            >
              <CorrespondentSelect
                value={correspondentId}
                onChange={setCorrespondentId}
                allowNone={false}
              />
            </FormField>
          ) : null}

          <FormField label={t('exchange.customer')} className="sm:col-span-2">
            <CustomerPicker
              value={customer}
              onSelect={setCustomer}
              onClear={() => setCustomer(null)}
            />
          </FormField>

          {!customer ? (
            <FormField label={t('voucher.counterparty')} className="sm:col-span-2">
              <Input
                value={counterpartyName}
                onChange={(event) => setCounterpartyName(event.target.value)}
              />
            </FormField>
          ) : null}

          <FormField label={t('common.reason')} required className="sm:col-span-2">
            <Input value={reason} onChange={(event) => setReason(event.target.value)} />
          </FormField>
          <FormField label={t('common.notes')} className="sm:col-span-2">
            <Textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </FormField>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!valid}>
            {t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
