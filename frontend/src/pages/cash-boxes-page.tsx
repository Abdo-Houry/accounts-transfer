import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRightLeft, Plus, Vault } from 'lucide-react';
import { cashBoxesApi } from '@/api';
import {
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
  Separator,
} from '@/components/ui';
import {
  EmptyState,
  FormField,
  LoadingState,
  Money,
  PageHeader,
  PermissionGate,
  StatusBadge,
} from '@/components/common';
import { CashBoxSelect, CurrencySelect } from '@/components/common/pickers';
import { useCashBoxes } from '@/features/reference/use-reference';
import { useMutationFeedback } from '@/features/reference/use-mutation-feedback';
import { useI18n } from '@/context/i18n-context';
import { localizedName } from '@/lib/format';
import { PERMISSIONS } from '@/lib/permissions';

export default function CashBoxesPage() {
  const { t, language } = useI18n();
  const boxes = useCashBoxes(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const balances = useQuery({
    queryKey: ['cash-box-balances', 'all'],
    queryFn: async () => {
      const list = await cashBoxesApi.list(false);
      const entries = await Promise.all(
        list.map(async (box) => [box.id, await cashBoxesApi.balances(box.id)] as const),
      );
      return Object.fromEntries(entries);
    },
  });

  return (
    <>
      <PageHeader
        title={t('cashbox.title')}
        subtitle={t('cashbox.subtitle')}
        icon={<Vault className="size-5" />}
        actions={
          <>
            <PermissionGate permission={PERMISSIONS.CASHBOX_TRANSFER}>
              <Button variant="outline" onClick={() => setTransferOpen(true)}>
                <ArrowRightLeft />
                {t('cashbox.transfer')}
              </Button>
            </PermissionGate>
            <PermissionGate permission={PERMISSIONS.CASHBOX_CREATE}>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus />
                {t('cashbox.new')}
              </Button>
            </PermissionGate>
          </>
        }
      />

      {boxes.isLoading ? (
        <LoadingState />
      ) : (boxes.data ?? []).length === 0 ? (
        <Card>
          <EmptyState title={t('cashbox.title')} />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(boxes.data ?? []).map((box) => {
            const rows = balances.data?.[box.id] ?? [];
            return (
              <Card key={box.id} className="flex flex-col">
                <CardHeader className="flex-row items-start justify-between">
                  <div className="min-w-0">
                    <CardTitle className="truncate">{localizedName(box, language)}</CardTitle>
                    <p className="numeric text-xs text-[var(--text-muted)]">
                      {box.code}
                      {box.branch ? ` · ${box.branch}` : ''}
                    </p>
                  </div>
                  <StatusBadge value={box.status} />
                </CardHeader>

                <CardContent className="flex-1">
                  {rows.length === 0 ? (
                    <p className="py-4 text-sm text-[var(--text-muted)]">{t('cashbox.noBalances')}</p>
                  ) : (
                    <ul className="space-y-2">
                      {rows.map((balance) => (
                        <li key={balance.id} className="flex items-center justify-between gap-3">
                          <span className="numeric text-sm text-[var(--text-muted)]">
                            {balance.currency.code}
                          </span>
                          <Money
                            value={balance.balance}
                            currency={balance.currency}
                            showCode={false}
                            className={
                              Number(balance.balance) < 0 ? 'text-[var(--color-negative)]' : ''
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>

                <Separator />
                <div className="p-4">
                  <Button variant="ghost" size="sm" asChild className="w-full">
                    <Link to={`/cash-boxes/${box.id}`}>{t('cashbox.statement')}</Link>
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Keyed on open state: each dialog remounts with empty fields. */}
      <CreateCashBoxDialog
        key={createOpen ? 'create-open' : 'create-closed'}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
      <TransferDialog
        key={transferOpen ? 'transfer-open' : 'transfer-closed'}
        open={transferOpen}
        onOpenChange={setTransferOpen}
      />
    </>
  );
}

function CreateCashBoxDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const feedback = useMutationFeedback([['cash-boxes']]);
  const [form, setForm] = useState({
    code: '',
    nameAr: '',
    nameEn: '',
    nameTr: '',
    branch: '',
  });

  const create = useMutation({
    mutationFn: () =>
      cashBoxesApi.create({
        code: form.code,
        nameAr: form.nameAr,
        nameEn: form.nameEn,
        nameTr: form.nameTr,
        branch: form.branch || undefined,
      }),
    onSuccess: (result) => {
      feedback.onSuccess(result);
      onOpenChange(false);
      setForm({ code: '', nameAr: '', nameEn: '', nameTr: '', branch: '' });
    },
    onError: feedback.onError,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('cashbox.new')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <FormField label={t('cashbox.code')} required>
            <Input
              dir="ltr"
              value={form.code}
              onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
              placeholder="MAIN"
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="العربية" required>
              <Input value={form.nameAr} onChange={(event) => setForm({ ...form, nameAr: event.target.value })} />
            </FormField>
            <FormField label="English" required>
              <Input value={form.nameEn} onChange={(event) => setForm({ ...form, nameEn: event.target.value })} />
            </FormField>
            <FormField label="Türkçe" required>
              <Input value={form.nameTr} onChange={(event) => setForm({ ...form, nameTr: event.target.value })} />
            </FormField>
          </div>
          <FormField label={t('cashbox.branch')}>
            <Input value={form.branch} onChange={(event) => setForm({ ...form, branch: event.target.value })} />
          </FormField>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => create.mutate()} loading={create.isPending}>
            {t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Moves cash between two boxes in one currency - a single balanced entry. */
function TransferDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const feedback = useMutationFeedback([['cash-boxes'], ['cash-box-balances']]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [currencyId, setCurrencyId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const transfer = useMutation({
    mutationFn: () =>
      cashBoxesApi.transfer({
        fromCashBoxId: from,
        toCashBoxId: to,
        currencyId,
        amount,
        note: note || undefined,
      }),
    onSuccess: (result) => {
      feedback.onSuccess(result);
      onOpenChange(false);
      setAmount('');
      setNote('');
    },
    onError: feedback.onError,
  });

  const valid = from && to && from !== to && currencyId && Number(amount) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('cashbox.transfer')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <FormField label={t('cashbox.transferFrom')} required>
            <CashBoxSelect value={from || undefined} onChange={setFrom} />
          </FormField>
          <FormField
            label={t('cashbox.transferTo')}
            required
            error={from && to && from === to ? t('cashbox.sameBox') : undefined}
          >
            <CashBoxSelect value={to || undefined} onChange={setTo} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('common.currency')} required>
              <CurrencySelect value={currencyId || undefined} onChange={setCurrencyId} />
            </FormField>
            <FormField label={t('common.amount')} required>
              <NumericInput value={amount} onChange={(event) => setAmount(event.target.value)} />
            </FormField>
          </div>
          <FormField label={t('common.notes')}>
            <Input value={note} onChange={(event) => setNote(event.target.value)} />
          </FormField>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => transfer.mutate()} loading={transfer.isPending} disabled={!valid}>
            {t('common.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
