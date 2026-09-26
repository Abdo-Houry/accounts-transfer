import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, CameraOff, Receipt, Search } from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from '@/components/ui';
import { EmptyState, FormField, Money, PageHeader, StatusBadge } from '@/components/common';
import { CashBoxSelect } from '@/components/common/pickers';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { useLookupTransfer, useReceiveTransfer } from '@/features/transfers/use-transfers';
import { useAuth } from '@/context/auth-context';
import { useI18n } from '@/context/i18n-context';
import { formatDateTime } from '@/lib/format';
import { TransferStatus } from '@/types/enums';
import type { Transfer } from '@/types/api';

/**
 * Payout desk.
 *
 * Search first, then pay: the operator confirms the beneficiary against what
 * the system holds before any money leaves the drawer. Only transfers the
 * server considers payable come back at all, so a cancelled or already-paid one
 * never appears as a candidate.
 */
export default function ReceiveTransferPage() {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const lookup = useLookupTransfer();
  const receive = useReceiveTransfer();

  const [transferNo, setTransferNo] = useState('');
  const [phone, setPhone] = useState('');
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [selected, setSelected] = useState<Transfer | null>(null);
  const [payoutCashBoxId, setPayoutCashBoxId] = useState<string>(user?.defaultCashBoxId ?? '');
  const [receivedByName, setReceivedByName] = useState('');

  const search = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!transferNo && !phone && !beneficiaryName) return;
    lookup.mutate({
      transferNo: transferNo || undefined,
      phone: phone || undefined,
      beneficiaryName: beneficiaryName || undefined,
    });
  };

  const confirmPayout = async () => {
    if (!selected) return;
    await receive.mutateAsync({
      id: selected.id,
      payoutCashBoxId: payoutCashBoxId || null,
      receivedByName: receivedByName || null,
    });
    setSelected(null);
    setReceivedByName('');
    // Refresh the result list so the paid transfer drops out of it.
    search();
  };

  const results = lookup.data ?? [];

  return (
    <>
      <PageHeader
        title={t('transfer.receiveTitle')}
        subtitle={t('transfer.receiveSubtitle')}
        icon={<Receipt className="size-5" />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1 lg:sticky lg:top-24 lg:self-start">
          <CardHeader>
            <CardTitle>{t('common.search')}</CardTitle>
            <p className="text-xs text-[var(--text-muted)]">{t('transfer.lookupHint')}</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={search} className="space-y-4">
              <FormField label={t('transfer.no')}>
                <div className="flex gap-2">
                  <Input
                    dir="ltr"
                    className="numeric"
                    placeholder="TRF-2026-000001"
                    value={transferNo}
                    onChange={(event) => setTransferNo(event.target.value)}
                  />
                  <QrScanButton onScan={(value) => setTransferNo(value)} />
                </div>
              </FormField>

              <FormField label={t('transfer.beneficiaryPhone')}>
                <Input
                  dir="ltr"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </FormField>

              <FormField label={t('transfer.beneficiaryName')}>
                <Input
                  value={beneficiaryName}
                  onChange={(event) => setBeneficiaryName(event.target.value)}
                />
              </FormField>

              <Button type="submit" className="w-full" loading={lookup.isPending}>
                <Search />
                {t('common.search')}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          {lookup.isIdle ? (
            <Card>
              <EmptyState title={t('transfer.receiveTitle')} description={t('transfer.lookupHint')} />
            </Card>
          ) : lookup.isError ? (
            <Card>
              <EmptyState title={t('transfer.lookupEmpty')} description={t('common.noResultsHint')} />
            </Card>
          ) : results.length === 0 ? (
            <Card>
              <EmptyState title={t('transfer.lookupEmpty')} />
            </Card>
          ) : (
            results.map((transfer) => (
              <Card key={transfer.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/transfers/${transfer.id}`}
                        className="numeric font-semibold text-brand-700 hover:underline"
                      >
                        {transfer.transferNo}
                      </Link>
                      <StatusBadge value={transfer.status} />
                    </div>
                    <p className="text-lg font-medium">{transfer.beneficiaryName}</p>
                    <p className="numeric text-sm text-[var(--text-muted)]">
                      {transfer.beneficiaryPhone} · {transfer.beneficiaryCity}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {t('transfer.sender')}: {transfer.senderName} ·{' '}
                      {formatDateTime(transfer.createdAt, language)}
                    </p>
                  </div>

                  <div className="text-end">
                    <p className="text-xs text-[var(--text-muted)]">{t('transfer.payoutAmount')}</p>
                    <Money
                      value={transfer.payoutAmount}
                      currency={transfer.payoutCurrency}
                      className="text-xl text-brand-700"
                    />
                  </div>
                </div>

                {transfer.status === TransferStatus.PENDING ? (
                  <Alert tone="warning" className="mt-4">
                    {t('transfer.notPayableYet')}
                  </Alert>
                ) : (
                  <Button
                    className="mt-4 w-full sm:w-auto"
                    onClick={() => {
                      setSelected(transfer);
                      setPayoutCashBoxId(user?.defaultCashBoxId ?? transfer.cashBoxId);
                    }}
                  >
                    <Receipt />
                    {t('transfer.receive')}
                  </Button>
                )}
              </Card>
            ))
          )}
        </div>
      </div>

      <ConfirmDialog
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
        title={t('transfer.receive')}
        description={
          selected
            ? t('transfer.confirmReceive', {
                amount: `${selected.payoutAmount} ${selected.payoutCurrency?.code ?? ''}`,
                name: selected.beneficiaryName,
              })
            : undefined
        }
        confirmLabel={t('transfer.receive')}
        loading={receive.isPending}
        onConfirm={confirmPayout}
      >
        <div className="space-y-4">
          <FormField label={t('transfer.payoutCashBox')} required>
            <CashBoxSelect value={payoutCashBoxId} onChange={setPayoutCashBoxId} />
          </FormField>
          <FormField label={t('transfer.beneficiaryName')} hint={t('common.optional')}>
            <Input
              value={receivedByName}
              onChange={(event) => setReceivedByName(event.target.value)}
              placeholder={selected?.beneficiaryName}
            />
          </FormField>
        </div>
      </ConfirmDialog>
    </>
  );
}

/**
 * Scans the QR printed on a transfer receipt and fills in the transfer number.
 * Purely a convenience: the same number can always be typed by hand, and the
 * camera is released as soon as the reader closes.
 */
function QrScanButton({ onScan }: { onScan: (value: string) => void }) {
  const { t } = useI18n();
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current ?? undefined,
          (result) => {
            if (!result || cancelled) return;
            try {
              const payload = JSON.parse(result.getText()) as { no?: string };
              onScan(payload.no ?? result.getText());
            } catch {
              // Not our JSON payload - fall back to the raw scanned text.
              onScan(result.getText());
            }
            setActive(false);
          },
        );
        stopRef.current = () => controls.stop();
      } catch {
        if (!cancelled) {
          setError(t('common.errorTitle'));
          setActive(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      stopRef.current?.();
      stopRef.current = null;
    };
  }, [active, onScan, t]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={() => setActive((current) => !current)}
        aria-label={t('transfer.receipt')}
      >
        {active ? <CameraOff /> : <Camera />}
      </Button>

      {active ? (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-brand-900/90 p-6">
          <video ref={videoRef} className="max-h-[60vh] w-full max-w-md rounded-lg" />
          <Button variant="gold" onClick={() => setActive(false)}>
            {t('common.close')}
          </Button>
        </div>
      ) : null}

      {error ? <span className="sr-only">{error}</span> : null}
    </>
  );
}
