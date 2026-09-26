import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { auditApi } from '@/api/admin.api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { PageHeader, SearchInput, StatusBadge } from '@/components/common';
import { DataTable, Pagination, type Column } from '@/components/common/data-table';
import { PeriodFilter, periodToParams, type PeriodValue } from '@/components/common/period-filter';
import { useDebouncedValue } from '@/features/reference/use-debounced-value';
import { useI18n } from '@/context/i18n-context';
import { formatDateTime } from '@/lib/format';
import { AuditResult, ReportPeriod } from '@/types/enums';
import type { AuditLog } from '@/types/api';

export default function AuditLogPage() {
  const { t, language } = useI18n();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [result, setResult] = useState<AuditResult | 'ALL'>('ALL');
  const [period, setPeriod] = useState<PeriodValue>({ period: ReportPeriod.WEEK });
  const [selected, setSelected] = useState<AuditLog | null>(null);

  const debounced = useDebouncedValue(search, 350);
  const range = periodToParams(period);

  const query = useQuery({
    queryKey: ['audit-logs', { page, q: debounced, result, range }],
    queryFn: () =>
      auditApi.list({
        page,
        limit: 25,
        q: debounced || undefined,
        result: result === 'ALL' ? undefined : result,
        from: range.from,
        to: range.to,
      }),
    placeholderData: (previous) => previous,
  });

  const columns: Array<Column<AuditLog>> = [
    {
      key: 'createdAt',
      header: t('common.dateTime'),
      render: (row) => (
        <span className="text-sm">{formatDateTime(row.createdAt, language)}</span>
      ),
    },
    {
      key: 'username',
      header: t('audit.user'),
      render: (row) => <span className="numeric">{row.username || '-'}</span>,
    },
    {
      key: 'action',
      header: t('audit.action'),
      // The raw identifier stays reachable on hover: it is what an admin greps
      // for, while the label is what makes the row readable.
      render: (row) => (
        <span className="text-sm" title={row.action}>
          {row.actionLabel || row.action}
        </span>
      ),
    },
    {
      key: 'description',
      header: t('ledger.description'),
      render: (row) => <span className="text-sm">{row.description}</span>,
    },
    {
      key: 'entity',
      header: t('audit.entity'),
      hideOnMobile: true,
      render: (row) => (
        <span className="text-sm text-[var(--text-muted)]" title={row.entityType ?? undefined}>
          {row.entityLabel ?? row.entityType ?? '-'}
        </span>
      ),
    },
    {
      key: 'result',
      header: t('audit.result'),
      render: (row) => <StatusBadge value={row.result} />,
    },
    {
      key: 'ip',
      header: t('audit.ip'),
      hideOnMobile: true,
      render: (row) => <span className="numeric text-xs text-[var(--text-muted)]">{row.ipAddress}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title={t('audit.title')}
        subtitle={t('audit.subtitle')}
        icon={<ScrollText className="size-5" />}
        actions={<PeriodFilter value={period} onChange={setPeriod} />}
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
          value={result}
          onValueChange={(value) => {
            setResult(value as AuditResult | 'ALL');
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t('audit.result')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('common.all')}</SelectItem>
            <SelectItem value={AuditResult.SUCCESS}>{t('status.SUCCESS')}</SelectItem>
            <SelectItem value={AuditResult.FAILURE}>{t('status.FAILURE')}</SelectItem>
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
        onRowClick={(row) => setSelected(row)}
        footer={<Pagination meta={query.data?.meta} onPageChange={setPage} />}
      />

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{selected?.actionLabel || selected?.action}</DialogTitle>
          </DialogHeader>

          {selected ? (
            <div className="space-y-4 text-sm">
              <p className="text-[var(--text-secondary)]">{selected.description}</p>

              <div className="grid gap-2 sm:grid-cols-2">
                <p>
                  <span className="text-[var(--text-muted)]">{t('audit.user')}: </span>
                  {selected.username}
                </p>
                <p>
                  <span className="text-[var(--text-muted)]">{t('common.dateTime')}: </span>
                  {formatDateTime(selected.createdAt, language)}
                </p>
                <p>
                  <span className="text-[var(--text-muted)]">{t('audit.ip')}: </span>
                  <span className="numeric">{selected.ipAddress}</span>
                </p>
                <p>
                  <span className="text-[var(--text-muted)]">{t('audit.entity')}: </span>
                  {selected.entityLabel ?? selected.entityType ?? '-'}
                </p>
              </div>

              {/* Payloads are already redacted of secrets by the backend logger. */}
              {selected.beforeData ? (
                <div>
                  <p className="mb-1 font-medium">{t('audit.before')}</p>
                  <pre className="surface-muted max-h-48 overflow-auto rounded-lg p-3 text-xs" dir="ltr">
                    {JSON.stringify(selected.beforeData, null, 2)}
                  </pre>
                </div>
              ) : null}

              {selected.afterData ? (
                <div>
                  <p className="mb-1 font-medium">{t('audit.after')}</p>
                  <pre className="surface-muted max-h-48 overflow-auto rounded-lg p-3 text-xs" dir="ltr">
                    {JSON.stringify(selected.afterData, null, 2)}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
