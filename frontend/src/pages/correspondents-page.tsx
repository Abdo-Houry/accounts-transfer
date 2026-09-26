import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Building2, Plus } from 'lucide-react';
import { correspondentsApi } from '@/api';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/components/ui';
import {
  EmptyState,
  FormField,
  LoadingState,
  PageHeader,
  PermissionGate,
  StatusBadge,
} from '@/components/common';
import { useMutationFeedback } from '@/features/reference/use-mutation-feedback';
import { useI18n } from '@/context/i18n-context';
import { formatAmount, formatDateTime, localizedName } from '@/lib/format';
import { PERMISSIONS } from '@/lib/permissions';
import type { CorrespondentPosition } from '@/types/api';

/**
 * Partner offices and where each one stands.
 *
 * The balance shown is the balance of that office's own `1300-<CODE>` current
 * account, per currency, signed from this office's point of view: positive
 * means they are holding funds for us, negative means we owe them for payouts
 * they have already made.
 */
export default function CorrespondentsPage() {
  const { t, language } = useI18n();
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<CorrespondentPosition | null>(null);

  const positions = useQuery({
    queryKey: ['correspondent-positions'],
    queryFn: () => correspondentsApi.positions(),
  });

  return (
    <>
      <PageHeader
        title={t('correspondent.title')}
        subtitle={t('correspondent.subtitle')}
        icon={<Building2 className="size-5" />}
        actions={
          <PermissionGate permission={PERMISSIONS.CORRESPONDENT_CREATE}>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus />
              {t('correspondent.new')}
            </Button>
          </PermissionGate>
        }
      />

      {positions.isLoading ? (
        <LoadingState />
      ) : (positions.data ?? []).length === 0 ? (
        <EmptyState title={t('correspondent.empty')} description={t('correspondent.emptyHint')} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(positions.data ?? []).map((position) => (
            <Card key={position.correspondent.id}>
              <CardHeader className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {localizedName(position.correspondent, language)}
                    {/* StatusBadge maps the enum through tEnum, which is
                        where every other screen gets its wording from. */}
                    <StatusBadge value={position.correspondent.status} />
                  </CardTitle>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    <span className="numeric">{position.correspondent.code}</span>
                    {position.correspondent.city ? ` · ${position.correspondent.city}` : ''}
                    {position.correspondent.country ? ` · ${position.correspondent.country}` : ''}
                    {' · '}
                    <span className="numeric">{position.correspondent.account?.code}</span>
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setSelected(position)}>
                  {t('correspondent.statement')}
                </Button>
              </CardHeader>

              <CardContent className="p-0">
                {position.rows.length === 0 ? (
                  <p className="px-4 pb-4 text-sm text-[var(--text-muted)]">
                    {t('correspondent.noMovement')}
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>{t('common.currency')}</TableHead>
                        <TableHead className="num-col">{t('ledger.debit')}</TableHead>
                        <TableHead className="num-col">{t('ledger.credit')}</TableHead>
                        <TableHead className="num-col">{t('common.balance')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {position.rows.map((row) => {
                        const balance = Number(row.balance);
                        return (
                          <TableRow key={row.currencyId}>
                            <TableCell>
                              <span className="numeric font-medium">{row.currencyCode}</span>
                            </TableCell>
                            <TableCell className="num-col">
                              <span className="numeric">
                                {formatAmount(row.debit, row.decimalPlaces, language)}
                              </span>
                            </TableCell>
                            <TableCell className="num-col">
                              <span className="numeric">
                                {formatAmount(row.credit, row.decimalPlaces, language)}
                              </span>
                            </TableCell>
                            <TableCell className="num-col">
                              <span
                                className={
                                  'numeric font-semibold ' +
                                  (balance > 0
                                    ? 'text-[var(--color-positive)]'
                                    : balance < 0
                                      ? 'text-[var(--color-negative)]'
                                      : '')
                                }
                                title={
                                  balance >= 0
                                    ? t('correspondent.theyOweUs')
                                    : t('correspondent.weOweThem')
                                }
                              >
                                {formatAmount(row.balance, row.decimalPlaces, language)}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateCorrespondentDialog
        key={createOpen ? 'open' : 'closed'}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      <StatementDialog
        key={selected?.correspondent.id ?? 'no-statement'}
        position={selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
}

function StatementDialog({
  position,
  onClose,
}: {
  position: CorrespondentPosition | null;
  onClose: () => void;
}) {
  const { t, language } = useI18n();
  const query = useQuery({
    queryKey: ['correspondent-statement', position?.correspondent.id],
    queryFn: () => correspondentsApi.statement(position!.correspondent.id),
    enabled: position !== null,
  });

  return (
    <Dialog open={position !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>
            {position ? localizedName(position.correspondent, language) : ''}
          </DialogTitle>
        </DialogHeader>

        {query.isLoading ? (
          <LoadingState />
        ) : (query.data ?? []).length === 0 ? (
          <EmptyState />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t('common.dateTime')}</TableHead>
                <TableHead>{t('ledger.reference')}</TableHead>
                <TableHead>{t('ledger.description')}</TableHead>
                <TableHead>{t('common.currency')}</TableHead>
                <TableHead className="num-col">{t('ledger.debit')}</TableHead>
                <TableHead className="num-col">{t('ledger.credit')}</TableHead>
                <TableHead className="num-col">{t('common.balance')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(query.data ?? []).map((line) => (
                <TableRow key={line.entryId}>
                  <TableCell className="text-sm">
                    {formatDateTime(line.occurredAt, language)}
                  </TableCell>
                  <TableCell>
                    <span className="numeric text-xs">{line.referenceNo}</span>
                  </TableCell>
                  <TableCell className="text-sm">{line.description}</TableCell>
                  <TableCell>
                    <span className="numeric">{line.currencyCode}</span>
                  </TableCell>
                  <TableCell className="num-col">
                    <span className="numeric">
                      {Number(line.debit) === 0
                        ? '-'
                        : formatAmount(line.debit, line.decimalPlaces, language)}
                    </span>
                  </TableCell>
                  <TableCell className="num-col">
                    <span className="numeric">
                      {Number(line.credit) === 0
                        ? '-'
                        : formatAmount(line.credit, line.decimalPlaces, language)}
                    </span>
                  </TableCell>
                  <TableCell className="num-col">
                    <span className="numeric font-medium">
                      {formatAmount(line.balance, line.decimalPlaces, language)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreateCorrespondentDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const feedback = useMutationFeedback([['correspondent-positions'], ['correspondents']]);

  const [code, setCode] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameTr, setNameTr] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [notes, setNotes] = useState('');

  const create = useMutation({
    mutationFn: () =>
      correspondentsApi.create({
        code,
        nameAr,
        nameEn,
        nameTr,
        country: country || null,
        city: city || null,
        phone: phone || null,
        contactPerson: contactPerson || null,
        notes: notes || null,
      }),
    onSuccess: (result) => {
      feedback.onSuccess(result);
      onOpenChange(false);
    },
    onError: feedback.onError,
  });

  const valid = code.trim().length >= 2 && nameAr.trim() && nameEn.trim() && nameTr.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{t('correspondent.new')}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('correspondent.code')} required hint={t('correspondent.codeHint')}>
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="HAMZA"
              className="numeric"
            />
          </FormField>
          <FormField label={t('correspondent.contactPerson')}>
            <Input value={contactPerson} onChange={(event) => setContactPerson(event.target.value)} />
          </FormField>

          <FormField label={t('common.nameAr')} required>
            <Input value={nameAr} onChange={(event) => setNameAr(event.target.value)} />
          </FormField>
          <FormField label={t('common.nameEn')} required>
            <Input value={nameEn} onChange={(event) => setNameEn(event.target.value)} />
          </FormField>
          <FormField label={t('common.nameTr')} required>
            <Input value={nameTr} onChange={(event) => setNameTr(event.target.value)} />
          </FormField>
          <FormField label={t('common.phone')}>
            <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
          </FormField>
          <FormField label={t('common.country')}>
            <Input value={country} onChange={(event) => setCountry(event.target.value)} />
          </FormField>
          <FormField label={t('common.city')}>
            <Input value={city} onChange={(event) => setCity(event.target.value)} />
          </FormField>
          <FormField label={t('common.notes')} className="sm:col-span-2">
            <Textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </FormField>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
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
