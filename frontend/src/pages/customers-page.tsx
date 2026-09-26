import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Users } from 'lucide-react';
import { customersApi } from '@/api';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@/components/ui';
import {
  FormField,
  PageHeader,
  PermissionGate,
  SearchInput,
  StatusBadge,
} from '@/components/common';
import { DataTable, Pagination, type Column } from '@/components/common/data-table';
import { useDebouncedValue } from '@/features/reference/use-debounced-value';
import { useMutationFeedback } from '@/features/reference/use-mutation-feedback';
import { useI18n } from '@/context/i18n-context';
import { formatDate } from '@/lib/format';
import { PERMISSIONS } from '@/lib/permissions';
import { CustomerStatus } from '@/types/enums';
import type { Customer } from '@/types/api';

export default function CustomersPage() {
  const { t, language } = useI18n();
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CustomerStatus | 'ALL'>('ALL');
  const [createOpen, setCreateOpen] = useState(false);

  const debounced = useDebouncedValue(search, 350);

  const query = useQuery({
    queryKey: ['customers', { page, limit, q: debounced, status }],
    queryFn: () =>
      customersApi.list({
        page,
        limit,
        q: debounced || undefined,
        status: status === 'ALL' ? undefined : status,
      }),
    placeholderData: (previous) => previous,
  });

  const columns: Array<Column<Customer>> = [
    {
      key: 'customerNo',
      header: t('customer.no'),
      render: (row) => (
        <Link
          to={`/customers/${row.id}`}
          className="numeric font-medium text-brand-600 hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          {row.customerNo}
        </Link>
      ),
    },
    { key: 'name', header: t('customer.name'), render: (row) => row.fullName },
    {
      key: 'phone',
      header: t('customer.phone'),
      render: (row) => <span className="numeric">{row.phone}</span>,
    },
    {
      key: 'city',
      header: t('customer.city'),
      hideOnMobile: true,
      render: (row) => [row.city, row.country].filter(Boolean).join(', ') || '-',
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
          {formatDate(row.createdAt, language)}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t('customer.title')}
        subtitle={t('customer.subtitle')}
        icon={<Users className="size-5" />}
        actions={
          <PermissionGate permission={PERMISSIONS.CUSTOMER_CREATE}>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus />
              {t('customer.new')}
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
          className="w-full sm:w-80"
        />
        <Select value={status} onValueChange={(value) => setStatus(value as CustomerStatus | 'ALL')}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t('common.status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('common.all')}</SelectItem>
            <SelectItem value={CustomerStatus.ACTIVE}>{t('status.active')}</SelectItem>
            <SelectItem value={CustomerStatus.BLOCKED}>{t('status.blocked')}</SelectItem>
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
        onRowClick={(row) => navigate(`/customers/${row.id}`)}
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

      <CreateCustomerDialog
        key={createOpen ? 'open' : 'closed'}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => void query.refetch()}
      />
    </>
  );
}

function CreateCustomerDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const { t } = useI18n();
  const feedback = useMutationFeedback([['customers']]);
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    altPhone: '',
    nationalId: '',
    country: '',
    city: '',
    address: '',
    notes: '',
  });

  const create = useMutation({
    mutationFn: () =>
      customersApi.create({
        fullName: form.fullName,
        phone: form.phone,
        altPhone: form.altPhone || null,
        nationalId: form.nationalId || null,
        country: form.country || null,
        city: form.city || null,
        address: form.address || null,
        notes: form.notes || null,
      }),
    onSuccess: (result) => {
      feedback.onSuccess(result);
      onOpenChange(false);
      onCreated();
      setForm({
        fullName: '',
        phone: '',
        altPhone: '',
        nationalId: '',
        country: '',
        city: '',
        address: '',
        notes: '',
      });
    },
    onError: feedback.onError,
  });

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{t('customer.new')}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('customer.name')} required className="sm:col-span-2">
            <Input value={form.fullName} onChange={set('fullName')} />
          </FormField>
          <FormField label={t('customer.phone')} required>
            <Input dir="ltr" value={form.phone} onChange={set('phone')} />
          </FormField>
          <FormField label={t('customer.altPhone')}>
            <Input dir="ltr" value={form.altPhone} onChange={set('altPhone')} />
          </FormField>
          <FormField label={t('customer.nationalId')}>
            <Input dir="ltr" value={form.nationalId} onChange={set('nationalId')} />
          </FormField>
          <FormField label={t('customer.country')}>
            <Input value={form.country} onChange={set('country')} />
          </FormField>
          <FormField label={t('customer.city')}>
            <Input value={form.city} onChange={set('city')} />
          </FormField>
          <FormField label={t('customer.address')}>
            <Input value={form.address} onChange={set('address')} />
          </FormField>
          <FormField label={t('common.notes')} className="sm:col-span-2">
            <Textarea rows={2} value={form.notes} onChange={set('notes')} />
          </FormField>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => create.mutate()}
            loading={create.isPending}
            disabled={form.fullName.trim().length < 2 || form.phone.trim().length < 5}
          >
            {t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
