import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Percent, Plus, Trash2 } from 'lucide-react';
import { commissionsApi, type CommissionRulePayload } from '@/api/admin.api';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
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
} from '@/components/ui';
import { FormField, PageHeader, PermissionGate } from '@/components/common';
import { DataTable, type Column } from '@/components/common/data-table';
import { CurrencySelect } from '@/components/common/pickers';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { useMutationFeedback } from '@/features/reference/use-mutation-feedback';
import { useI18n } from '@/context/i18n-context';
import { formatRate } from '@/lib/format';
import { PERMISSIONS } from '@/lib/permissions';
import { CommissionMethod, CommissionOperation } from '@/types/enums';
import type { CommissionRule } from '@/types/api';

export default function CommissionsPage() {
  const { t, language } = useI18n();
  const feedback = useMutationFeedback([['commission-rules']]);

  const [editing, setEditing] = useState<CommissionRule | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<CommissionRule | null>(null);

  const query = useQuery({
    queryKey: ['commission-rules'],
    queryFn: () => commissionsApi.list(),
  });

  const remove = useMutation({
    mutationFn: (id: string) => commissionsApi.remove(id),
    onSuccess: (result) => {
      feedback.onSuccess(result);
      setDeleting(null);
      void query.refetch();
    },
    onError: feedback.onError,
  });

  const columns: Array<Column<CommissionRule>> = [
    { key: 'name', header: t('commission.name'), render: (row) => row.name },
    {
      key: 'operation',
      header: t('commission.operation'),
      render: (row) => <Badge tone="brand">{t(`enum.${row.operation}` as never)}</Badge>,
    },
    {
      key: 'currency',
      header: t('common.currency'),
      render: (row) =>
        row.currency ? (
          <span className="numeric">{row.currency.code}</span>
        ) : (
          <span className="text-[var(--text-muted)]">{t('commission.anyCurrency')}</span>
        ),
    },
    {
      key: 'method',
      header: t('commission.method'),
      render: (row) => t(`enum.${row.method}` as never),
    },
    {
      key: 'value',
      header: t('common.amount'),
      numeric: true,
      render: (row) => (
        <span className="numeric">
          {row.method === CommissionMethod.PERCENT
            ? `${formatRate(row.percent, language)} %`
            : formatRate(row.fixedAmount, language)}
        </span>
      ),
    },
    {
      key: 'clamp',
      header: `${t('commission.minAmount')} / ${t('commission.maxAmount')}`,
      hideOnMobile: true,
      render: (row) => (
        <span className="numeric text-sm text-[var(--text-muted)]">
          {formatRate(row.minAmount, language)} / {formatRate(row.maxAmount, language)}
        </span>
      ),
    },
    {
      key: 'priority',
      header: t('commission.priority'),
      numeric: true,
      hideOnMobile: true,
      render: (row) => <span className="numeric">{row.priority}</span>,
    },
    {
      key: 'active',
      header: t('commission.active'),
      render: (row) => (
        <Badge tone={row.isActive ? 'positive' : 'neutral'}>
          {row.isActive ? t('common.yes') : t('common.no')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <PermissionGate permission={PERMISSIONS.COMMISSION_MANAGE}>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setEditing(row)}>
              {t('common.edit')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDeleting(row)}>
              <Trash2 />
            </Button>
          </div>
        </PermissionGate>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t('commission.title')}
        subtitle={t('commission.subtitle')}
        icon={<Percent className="size-5" />}
        actions={
          <PermissionGate permission={PERMISSIONS.COMMISSION_MANAGE}>
            <Button onClick={() => setCreating(true)}>
              <Plus />
              {t('commission.new')}
            </Button>
          </PermissionGate>
        }
      />

      <Alert tone="info" className="mb-4">
        {t('commission.hint')}
      </Alert>

      <DataTable
        columns={columns}
        rows={query.data}
        rowKey={(row) => row.id}
        isLoading={query.isLoading}
        error={query.isError ? t('common.errorTitle') : null}
        onRetry={() => query.refetch()}
      />

      <RuleDialog
        // Also re-seeds when switching straight from one rule to another.
        key={editing?.id ?? (creating ? 'new' : 'closed')}
        rule={editing}
        open={creating || editing !== null}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => void query.refetch()}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('common.delete')}
        description={deleting?.name}
        tone="danger"
        loading={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
        }}
      />
    </>
  );
}

function RuleDialog({
  rule,
  open,
  onClose,
  onSaved,
}: {
  rule: CommissionRule | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const feedback = useMutationFeedback([['commission-rules']]);

  const [form, setForm] = useState<CommissionRulePayload>({
    name: '',
    operation: CommissionOperation.TRANSFER,
    currencyId: null,
    method: CommissionMethod.PERCENT,
    fixedAmount: null,
    percent: null,
    minAmount: null,
    maxAmount: null,
    fromAmount: null,
    toAmount: null,
    priority: 0,
    isActive: true,
  });

  // Load the selected rule into the form whenever the dialog opens on one.
  const [loadedId, setLoadedId] = useState<string | null>(null);
  if (open && rule && loadedId !== rule.id) {
    setLoadedId(rule.id);
    setForm({
      name: rule.name,
      operation: rule.operation,
      currencyId: rule.currencyId,
      method: rule.method,
      fixedAmount: rule.fixedAmount,
      percent: rule.percent,
      minAmount: rule.minAmount,
      maxAmount: rule.maxAmount,
      fromAmount: rule.fromAmount,
      toAmount: rule.toAmount,
      priority: rule.priority,
      isActive: rule.isActive,
    });
  }
  if (!open && loadedId !== null) setLoadedId(null);

  const save = useMutation({
    mutationFn: () => (rule ? commissionsApi.update(rule.id, form) : commissionsApi.create(form)),
    onSuccess: (result) => {
      feedback.onSuccess(result);
      onSaved();
      onClose();
    },
    onError: feedback.onError,
  });

  const set = <K extends keyof CommissionRulePayload>(key: K, value: CommissionRulePayload[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{rule ? t('common.edit') : t('commission.new')}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('commission.name')} required className="sm:col-span-2">
            <Input value={form.name} onChange={(event) => set('name', event.target.value)} />
          </FormField>

          <FormField label={t('commission.operation')} required>
            <Select
              value={form.operation}
              onValueChange={(value) => set('operation', value as CommissionOperation)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(CommissionOperation).map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`enum.${value}` as never)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label={t('common.currency')} hint={t('commission.anyCurrency')}>
            <CurrencySelect
              value={form.currencyId ?? undefined}
              onChange={(value) => set('currencyId', value)}
              placeholder={t('commission.anyCurrency')}
            />
          </FormField>

          <FormField label={t('commission.method')} required>
            <Select
              value={form.method}
              onValueChange={(value) => set('method', value as CommissionMethod)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(CommissionMethod).map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`enum.${value}` as never)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label={t('commission.priority')}>
            <Input
              type="number"
              value={form.priority ?? 0}
              onChange={(event) => set('priority', Number(event.target.value))}
            />
          </FormField>

          {form.method !== CommissionMethod.PERCENT ? (
            <FormField label={t('commission.fixedAmount')}>
              <NumericInput
                value={form.fixedAmount ?? ''}
                onChange={(event) => set('fixedAmount', event.target.value || null)}
              />
            </FormField>
          ) : null}

          {form.method !== CommissionMethod.FIXED ? (
            <FormField label={t('commission.percent')}>
              <NumericInput
                value={form.percent ?? ''}
                onChange={(event) => set('percent', event.target.value || null)}
              />
            </FormField>
          ) : null}

          <FormField label={t('commission.minAmount')}>
            <NumericInput
              value={form.minAmount ?? ''}
              onChange={(event) => set('minAmount', event.target.value || null)}
            />
          </FormField>
          <FormField label={t('commission.maxAmount')}>
            <NumericInput
              value={form.maxAmount ?? ''}
              onChange={(event) => set('maxAmount', event.target.value || null)}
            />
          </FormField>

          {form.method === CommissionMethod.TIERED ? (
            <>
              <FormField label={t('commission.fromAmount')}>
                <NumericInput
                  value={form.fromAmount ?? ''}
                  onChange={(event) => set('fromAmount', event.target.value || null)}
                />
              </FormField>
              <FormField label={t('commission.toAmount')}>
                <NumericInput
                  value={form.toAmount ?? ''}
                  onChange={(event) => set('toAmount', event.target.value || null)}
                />
              </FormField>
            </>
          ) : null}

          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <Checkbox
              checked={form.isActive ?? true}
              onChange={(event) => set('isActive', event.target.checked)}
            />
            {t('commission.active')}
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => save.mutate()}
            loading={save.isPending}
            disabled={form.name.trim().length < 2}
          >
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
