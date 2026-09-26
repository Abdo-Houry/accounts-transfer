import { useMemo, useState } from 'react';
import { ArrowDownUp, Coins, RotateCcw } from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  NumericInput,
  Separator,
  Textarea,
} from '@/components/ui';
import {
  Money,
  PageHeader,
  PermissionGate,
  StatusBadge,
  FormField,
} from '@/components/common';
import { DataTable, Pagination, type Column } from '@/components/common/data-table';
import { CashBoxSelect, CurrencySelect, CustomerPicker } from '@/components/common/pickers';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import {
  useCreateExchange,
  useExchangeQuote,
  useExchanges,
  useReverseExchange,
} from '@/features/exchange/use-exchange';
import { useCurrencies } from '@/features/reference/use-reference';
import { useAuth } from '@/context/auth-context';
import { useI18n } from '@/context/i18n-context';
import { formatDateTime, formatRate } from '@/lib/format';
import { PERMISSIONS } from '@/lib/permissions';
import { ExchangeStatus } from '@/types/enums';
import type { CurrencyExchange, Customer } from '@/types/api';

export default function ExchangePage() {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const { data: currencies } = useCurrencies();

  const [fromCurrencyId, setFromCurrencyId] = useState<string>('');
  const [toCurrencyId, setToCurrencyId] = useState<string>('');
  const [fromAmount, setFromAmount] = useState('');
  const [rateOverride, setRateOverride] = useState('');
  const [commissionOverride, setCommissionOverride] = useState('');
  const [cashBoxId, setCashBoxId] = useState(user?.defaultCashBoxId ?? '');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');

  const [page, setPage] = useState(1);
  const [reversing, setReversing] = useState<CurrencyExchange | null>(null);

  const createExchange = useCreateExchange();
  const reverseExchange = useReverseExchange();

  const quotePayload = useMemo(() => {
    if (!fromCurrencyId || !toCurrencyId || Number(fromAmount) <= 0) return null;
    return {
      fromCurrencyId,
      toCurrencyId,
      fromAmount,
      rate: rateOverride || null,
      commissionAmount: commissionOverride || null,
    };
  }, [fromCurrencyId, toCurrencyId, fromAmount, rateOverride, commissionOverride]);

  const quote = useExchangeQuote(quotePayload);
  const list = useExchanges({ page, limit: 10 });

  const fromCurrency = currencies?.find((currency) => currency.id === fromCurrencyId);
  const toCurrency = currencies?.find((currency) => currency.id === toCurrencyId);

  const swap = () => {
    setFromCurrencyId(toCurrencyId);
    setToCurrencyId(fromCurrencyId);
    setFromAmount('');
    setRateOverride('');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!quotePayload || !cashBoxId) return;

    await createExchange.mutateAsync({
      ...quotePayload,
      cashBoxId,
      customerId: customer?.id ?? null,
      customerName: customer ? null : customerName || null,
      notes: notes || null,
    });

    // Clear the whole entry, not just the amounts: a counterparty left behind
    // from the previous deal is the one field that must never be reused by
    // accident. The till stays - it is the operator's own box, not an entry.
    setFromCurrencyId('');
    setToCurrencyId('');
    setFromAmount('');
    setRateOverride('');
    setCommissionOverride('');
    setCustomer(null);
    setCustomerName('');
    setNotes('');
  };

  const columns: Array<Column<CurrencyExchange>> = [
    {
      key: 'exchangeNo',
      header: t('exchange.no'),
      render: (row) => <span className="numeric font-medium">{row.exchangeNo}</span>,
    },
    {
      key: 'type',
      header: t('exchange.type'),
      render: (row) => <StatusBadge value={row.type} />,
    },
    {
      key: 'from',
      header: t('exchange.fromAmount'),
      numeric: true,
      render: (row) => <Money value={row.fromAmount} currency={row.fromCurrency} />,
    },
    {
      key: 'to',
      header: t('exchange.toAmount'),
      numeric: true,
      render: (row) => <Money value={row.toAmount} currency={row.toCurrency} />,
    },
    {
      key: 'rate',
      header: t('exchange.rate'),
      numeric: true,
      hideOnMobile: true,
      render: (row) => <span className="numeric">{formatRate(row.rate, language)}</span>,
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
        row.status === ExchangeStatus.COMPLETED ? (
          <PermissionGate permission={PERMISSIONS.EXCHANGE_REVERSE}>
            <Button variant="ghost" size="sm" onClick={() => setReversing(row)}>
              <RotateCcw />
              {t('exchange.reverse')}
            </Button>
          </PermissionGate>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title={t('exchange.title')}
        subtitle={t('exchange.subtitle')}
        icon={<Coins className="size-5" />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <PermissionGate permission={PERMISSIONS.EXCHANGE_CREATE}>
          <Card className="lg:col-span-1 lg:sticky lg:top-24 lg:self-start">
            <CardHeader>
              <CardTitle>{t('exchange.new')}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-4">
                <FormField label={t('exchange.fromCurrency')} required>
                  <CurrencySelect
                    value={fromCurrencyId || undefined}
                    onChange={setFromCurrencyId}
                    exclude={toCurrencyId}
                  />
                </FormField>

                <FormField label={t('exchange.fromAmount')} required>
                  <NumericInput
                    placeholder="0"
                    value={fromAmount}
                    onChange={(event) => setFromAmount(event.target.value)}
                  />
                </FormField>

                <div className="flex justify-center">
                  <Button type="button" variant="subtle" size="icon" onClick={swap} aria-label={t('exchange.swap')}>
                    <ArrowDownUp />
                  </Button>
                </div>

                <FormField label={t('exchange.toCurrency')} required>
                  <CurrencySelect
                    value={toCurrencyId || undefined}
                    onChange={setToCurrencyId}
                    exclude={fromCurrencyId}
                  />
                </FormField>

                <div className="grid grid-cols-2 gap-3">
                  <FormField label={t('exchange.rate')} hint={t('common.optional')}>
                    <NumericInput
                      placeholder={quote.data ? formatRate(quote.data.rate, language) : '0'}
                      value={rateOverride}
                      onChange={(event) => setRateOverride(event.target.value)}
                    />
                  </FormField>
                  <FormField label={t('transfer.commission')} hint={t('common.optional')}>
                    <NumericInput
                      placeholder="0"
                      value={commissionOverride}
                      onChange={(event) => setCommissionOverride(event.target.value)}
                    />
                  </FormField>
                </div>

                <Separator />

                <FormField label={t('transfer.cashBox')} required>
                  <CashBoxSelect value={cashBoxId || undefined} onChange={setCashBoxId} />
                </FormField>

                <FormField label={t('exchange.customer')} hint={t('transfer.walkIn')}>
                  <CustomerPicker
                    value={customer}
                    onSelect={setCustomer}
                    onClear={() => setCustomer(null)}
                  />
                </FormField>

                {!customer ? (
                  <Input
                    placeholder={t('customer.name')}
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                  />
                ) : null}

                <FormField label={t('common.notes')}>
                  <Textarea
                    rows={2}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </FormField>

                {/* The quote is a preview; the server re-prices on submit. */}
                {quote.isError ? (
                  <Alert tone="warning">{t('rate.noRate')}</Alert>
                ) : quote.data ? (
                  <div className="surface-muted rounded-lg p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--text-muted)]">{t('exchange.customerPays')}</span>
                      <Money value={quote.data.fromAmount} currency={fromCurrency} />
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-[var(--text-muted)]">{t('transfer.commission')}</span>
                      <Money value={quote.data.commissionAmount} currency={toCurrency} />
                    </div>
                    <Separator className="my-2" />
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{t('exchange.customerReceives')}</span>
                      <Money
                        value={quote.data.toAmount}
                        currency={toCurrency}
                        className="text-base text-brand-700"
                      />
                    </div>
                    <p className="mt-2 text-xs text-[var(--text-muted)]">
                      {t('exchange.rateUsed', {
                        buy: formatRate(quote.data.buyRateUsed, language),
                        sell: formatRate(quote.data.sellRateUsed, language),
                      })}
                    </p>
                  </div>
                ) : null}

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  loading={createExchange.isPending}
                  disabled={!quote.data || !cashBoxId}
                >
                  {t('exchange.new')}
                </Button>
              </form>
            </CardContent>
          </Card>
        </PermissionGate>

        <div className="lg:col-span-2">
          <DataTable
            columns={columns}
            rows={list.data?.items}
            rowKey={(row) => row.id}
            isLoading={list.isLoading}
            error={list.isError ? t('common.errorTitle') : null}
            onRetry={() => list.refetch()}
            footer={<Pagination meta={list.data?.meta} onPageChange={setPage} />}
          />
        </div>
      </div>

      <ConfirmDialog
        open={reversing !== null}
        onOpenChange={(open) => !open && setReversing(null)}
        title={t('exchange.reverse')}
        description={
          reversing ? t('exchange.confirmReverse', { no: reversing.exchangeNo }) : undefined
        }
        tone="danger"
        reasonLabel={t('exchange.reverseReason')}
        loading={reverseExchange.isPending}
        onConfirm={async (reason) => {
          if (!reversing) return;
          await reverseExchange.mutateAsync({ id: reversing.id, reason: reason ?? '' });
          setReversing(null);
        }}
      />
    </>
  );
}
