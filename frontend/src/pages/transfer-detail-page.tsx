import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Ban, ChevronLeft, Printer, Receipt, Send } from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Separator,
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
import { CashBoxSelect } from '@/components/common/pickers';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import {
  useCancelTransfer,
  useReceiveTransfer,
  useSendTransfer,
  useTransfer,
  useTransferHistory,
  useTransferReceipt,
} from '@/features/transfers/use-transfers';
import { useAuth } from '@/context/auth-context';
import { useI18n } from '@/context/i18n-context';
import { formatDateTime, formatRate, localizedName } from '@/lib/format';
import { PERMISSIONS } from '@/lib/permissions';
import { TransferStatus, TRANSFER_TRANSITIONS } from '@/types/enums';

type DialogKind = 'send' | 'receive' | 'cancel' | null;

export default function TransferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, language } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();

  const transfer = useTransfer(id);
  const history = useTransferHistory(id);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [payoutCashBoxId, setPayoutCashBoxId] = useState(user?.defaultCashBoxId ?? '');
  const [refundCommission, setRefundCommission] = useState(true);

  const sendTransfer = useSendTransfer();
  const receiveTransfer = useReceiveTransfer();
  const cancelTransfer = useCancelTransfer();

  if (transfer.isLoading) return <LoadingState />;
  if (transfer.isError || !transfer.data) {
    return <ErrorState message={t('transfer.notFound')} onRetry={() => transfer.refetch()} />;
  }

  const data = transfer.data;
  const allowed = TRANSFER_TRANSITIONS[data.status];

  return (
    <>
      <PageHeader
        title={data.transferNo}
        subtitle={`${data.senderName} → ${data.beneficiaryName}`}
        icon={<Receipt className="size-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2 no-print">
            <Button variant="ghost" onClick={() => navigate('/transfers')}>
              <ChevronLeft />
              {t('common.back')}
            </Button>

            <Button variant="outline" onClick={() => window.print()}>
              <Printer />
              {t('common.print')}
            </Button>

            {allowed.includes(TransferStatus.SENT) ? (
              <PermissionGate permission={PERMISSIONS.TRANSFER_SEND}>
                <Button onClick={() => setDialog('send')}>
                  <Send />
                  {t('transfer.send')}
                </Button>
              </PermissionGate>
            ) : null}

            {allowed.includes(TransferStatus.RECEIVED) ? (
              <PermissionGate permission={PERMISSIONS.TRANSFER_RECEIVE}>
                <Button
                  variant="gold"
                  onClick={() => {
                    setPayoutCashBoxId(user?.defaultCashBoxId ?? data.cashBoxId);
                    setDialog('receive');
                  }}
                >
                  <Receipt />
                  {t('transfer.receive')}
                </Button>
              </PermissionGate>
            ) : null}

            {allowed.includes(TransferStatus.CANCELLED) ? (
              <PermissionGate permission={PERMISSIONS.TRANSFER_CANCEL}>
                <Button variant="danger" onClick={() => setDialog('cancel')}>
                  <Ban />
                  {t('transfer.cancel')}
                </Button>
              </PermissionGate>
            ) : null}
          </div>
        }
      />

      {data.status === TransferStatus.CANCELLED && data.cancelReason ? (
        <Alert tone="error" title={t('transfer.cancelReason')} className="mb-4">
          {data.cancelReason}
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{t('transfer.summary')}</CardTitle>
              <StatusBadge value={data.status} />
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                <Field label={t('transfer.amount')}>
                  <Money value={data.amount} currency={data.currency} />
                </Field>
                <Field label={t('transfer.commission')}>
                  <Money value={data.commissionAmount} currency={data.commissionCurrency} />
                </Field>
                <Field label={t('transfer.commissionBearer')}>
                  {t(`enum.${data.commissionBearer}` as never)}
                </Field>
                <Field label={t('transfer.exchangeRate')}>
                  <span className="numeric">{formatRate(data.exchangeRate, language)}</span>
                </Field>
                <Field label={t('transfer.totalCollected')}>
                  <Money value={data.totalCollected} currency={data.currency} />
                </Field>
                <Field label={t('transfer.payoutAmount')}>
                  <Money
                    value={data.payoutAmount}
                    currency={data.payoutCurrency}
                    className="text-brand-700"
                  />
                </Field>
                <Field label={t('transfer.paymentMethod')}>
                  {t(`enum.${data.paymentMethod}` as never)}
                </Field>
                <Field label={t('transfer.cashBox')}>
                  {data.cashBox ? localizedName(data.cashBox, language) : '-'}
                </Field>
              </dl>
            </CardContent>
          </Card>

          <div className="grid gap-6 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t('transfer.sender')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Field label={t('transfer.senderName')}>{data.senderName}</Field>
                <Field label={t('transfer.senderPhone')}>
                  <span className="numeric">{data.senderPhone}</span>
                </Field>
                {data.senderCustomer ? (
                  <Field label={t('customer.no')}>
                    <span className="numeric">{data.senderCustomer.customerNo}</span>
                  </Field>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('transfer.beneficiary')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Field label={t('transfer.beneficiaryName')}>{data.beneficiaryName}</Field>
                <Field label={t('transfer.beneficiaryPhone')}>
                  <span className="numeric">{data.beneficiaryPhone}</span>
                </Field>
                <Field label={t('transfer.country')}>
                  {data.beneficiaryCity}, {data.beneficiaryCountry}
                </Field>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('transfer.statusHistory')}</CardTitle>
            </CardHeader>
            <CardContent>
              {history.isLoading ? (
                <LoadingState />
              ) : (
                <ol className="relative space-y-4 border-s border-[var(--border-subtle)] ps-5">
                  {(history.data ?? []).map((entry) => (
                    <li key={entry.id} className="relative">
                      <span className="absolute -start-[1.55rem] top-1.5 size-2.5 rounded-full bg-brand-500" />
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge value={entry.toStatus} />
                        <span className="text-sm text-[var(--text-muted)]">
                          {formatDateTime(entry.createdAt, language)}
                        </span>
                        {entry.changedBy ? (
                          <span className="text-sm text-[var(--text-muted)]">
                            · {entry.changedBy.fullName}
                          </span>
                        ) : null}
                      </div>
                      {entry.reason ? (
                        <p className="mt-1 text-sm text-[var(--text-secondary)]">{entry.reason}</p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <ReceiptCard transferId={data.id} />
      </div>

      {/* ------------------------------------------------------- dialogs */}
      <ConfirmDialog
        open={dialog === 'send'}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t('transfer.send')}
        description={t('transfer.confirmSend', { no: data.transferNo })}
        loading={sendTransfer.isPending}
        onConfirm={async () => {
          await sendTransfer.mutateAsync({ id: data.id });
          setDialog(null);
        }}
      />

      <ConfirmDialog
        open={dialog === 'receive'}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t('transfer.receive')}
        description={t('transfer.confirmReceive', {
          amount: `${data.payoutAmount} ${data.payoutCurrency?.code ?? ''}`,
          name: data.beneficiaryName,
        })}
        loading={receiveTransfer.isPending}
        onConfirm={async () => {
          await receiveTransfer.mutateAsync({ id: data.id, payoutCashBoxId });
          setDialog(null);
        }}
      >
        <FormField label={t('transfer.payoutCashBox')} required>
          <CashBoxSelect value={payoutCashBoxId} onChange={setPayoutCashBoxId} />
        </FormField>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'cancel'}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t('transfer.cancel')}
        description={t('transfer.confirmCancel', { no: data.transferNo })}
        tone="danger"
        reasonLabel={t('transfer.cancelReason')}
        loading={cancelTransfer.isPending}
        onConfirm={async (reason) => {
          await cancelTransfer.mutateAsync({
            id: data.id,
            reason: reason ?? '',
            refundCommission,
          });
          setDialog(null);
        }}
      >
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={refundCommission}
            onChange={(event) => setRefundCommission(event.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="block font-medium">{t('transfer.refundCommission')}</span>
            <span className="block text-xs text-[var(--text-muted)]">
              {t('transfer.refundCommissionHint')}
            </span>
          </span>
        </label>
      </ConfirmDialog>
    </>
  );
}

/** Printable slip with the QR the payout desk can scan. */
function ReceiptCard({ transferId }: { transferId: string }) {
  const { t } = useI18n();
  const receipt = useTransferReceipt(transferId);

  return (
    <Card className="lg:sticky lg:top-24 lg:self-start">
      <CardHeader>
        <CardTitle>{t('transfer.receipt')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        {receipt.isLoading ? (
          <LoadingState />
        ) : receipt.data?.qrCode ? (
          <>
            <img
              src={receipt.data.qrCode}
              alt={t('transfer.receipt')}
              className="size-44 rounded-lg border border-[var(--border-subtle)] bg-white p-2"
            />
            <p className="numeric text-lg font-semibold">{receipt.data.transfer.transferNo}</p>
            <Separator />
            <p className="text-center text-xs text-[var(--text-muted)]">
              {t('transfer.lookupHint')}
            </p>
          </>
        ) : (
          <p className="py-6 text-sm text-[var(--text-muted)]">{t('common.noResults')}</p>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-[var(--text-primary)]">{children}</dd>
    </div>
  );
}
