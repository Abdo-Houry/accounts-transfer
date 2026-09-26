import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeftRight, Plus } from 'lucide-react';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { Money, PageHeader, PermissionGate, SearchInput, StatusBadge } from '@/components/common';
import { DataTable, Pagination, type Column } from '@/components/common/data-table';
import { CashBoxSelect, CurrencySelect } from '@/components/common/pickers';
import { useTransfers } from '@/features/transfers/use-transfers';
import { useI18n } from '@/context/i18n-context';
import { formatDateTime } from '@/lib/format';
import { PERMISSIONS } from '@/lib/permissions';
import { useDebouncedValue } from '@/features/reference/use-debounced-value';
import { TransferStatus } from '@/types/enums';
import type { Transfer } from '@/types/api';

export default function TransfersPage() {
  const { t, language } = useI18n();
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TransferStatus | 'ALL'>('ALL');
  const [currencyId, setCurrencyId] = useState<string>('');
  const [cashBoxId, setCashBoxId] = useState<string>('');

  const debouncedSearch = useDebouncedValue(search, 350);

  const query = useTransfers({
    page,
    limit,
    q: debouncedSearch || undefined,
    status: status === 'ALL' ? undefined : status,
    currencyId: currencyId || undefined,
    cashBoxId: cashBoxId || undefined,
  });

  const columns: Array<Column<Transfer>> = [
    {
      key: 'transferNo',
      header: t('transfer.no'),
      render: (row) => (
        <Link
          to={`/transfers/${row.id}`}
          className="numeric font-medium text-brand-600 hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          {row.transferNo}
        </Link>
      ),
    },
    {
      key: 'sender',
      header: t('transfer.sender'),
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate">{row.senderName}</p>
          <p className="numeric truncate text-xs text-[var(--text-muted)]">{row.senderPhone}</p>
        </div>
      ),
    },
    {
      key: 'beneficiary',
      header: t('transfer.beneficiary'),
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate">{row.beneficiaryName}</p>
          <p className="truncate text-xs text-[var(--text-muted)]">
            {row.beneficiaryCity}, {row.beneficiaryCountry}
          </p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: t('transfer.amount'),
      numeric: true,
      render: (row) => <Money value={row.amount} currency={row.currency} />,
    },
    {
      key: 'payout',
      header: t('transfer.payoutAmount'),
      numeric: true,
      hideOnMobile: true,
      render: (row) => <Money value={row.payoutAmount} currency={row.payoutCurrency} />,
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
  ];

  return (
    <>
      <PageHeader
        title={t('transfer.title')}
        subtitle={t('transfer.subtitle')}
        icon={<ArrowLeftRight className="size-5" />}
        actions={
          <PermissionGate permission={PERMISSIONS.TRANSFER_CREATE}>
            <Button asChild>
              <Link to="/transfers/send">
                <Plus />
                {t('transfer.new')}
              </Link>
            </Button>
          </PermissionGate>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          className="w-full sm:w-72"
        />

        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value as TransferStatus | 'ALL');
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t('common.status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('common.all')}</SelectItem>
            {Object.values(TransferStatus).map((value) => (
              <SelectItem key={value} value={value}>
                {t(`status.${value}` as never)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <CurrencySelect
          value={currencyId || undefined}
          onChange={(value) => {
            setCurrencyId(value);
            setPage(1);
          }}
          placeholder={t('common.currency')}
          className="w-40"
        />

        <CashBoxSelect
          value={cashBoxId || undefined}
          onChange={(value) => {
            setCashBoxId(value);
            setPage(1);
          }}
          placeholder={t('transfer.cashBox')}
          className="w-48"
        />

        {(search || status !== 'ALL' || currencyId || cashBoxId) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('');
              setStatus('ALL');
              setCurrencyId('');
              setCashBoxId('');
              setPage(1);
            }}
          >
            {t('common.clearFilters')}
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={query.data?.items}
        rowKey={(row) => row.id}
        isLoading={query.isLoading}
        error={query.isError ? t('common.errorTitle') : null}
        onRetry={() => query.refetch()}
        onRowClick={(row) => navigate(`/transfers/${row.id}`)}
        footer={
          <Pagination
            meta={query.data?.meta}
            onPageChange={setPage}
            onLimitChange={(next) => {
              setLimit(next);
              setPage(1);
            }}
          />
        }
      />
    </>
  );
}
