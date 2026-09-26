import { useEffect, useMemo, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Send } from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  NumericInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Textarea,
} from '@/components/ui';
import { FormField, Money, PageHeader } from '@/components/common';
import {
  CashBoxSelect,
  CorrespondentSelect,
  CurrencySelect,
  CustomerPicker,
} from '@/components/common/pickers';
import { useCreateTransfer, useTransferQuote } from '@/features/transfers/use-transfers';
import { useCurrencies } from '@/features/reference/use-reference';
import { useAuth } from '@/context/auth-context';
import { useI18n } from '@/context/i18n-context';
import { formatRate } from '@/lib/format';
import { CommissionBearer, PaymentMethod } from '@/types/enums';
import type { Customer } from '@/types/api';

const schema = z.object({
  senderName: z.string().trim().min(2),
  senderPhone: z.string().trim().min(5),
  beneficiaryName: z.string().trim().min(2),
  beneficiaryPhone: z.string().trim().min(5),
  beneficiaryCountry: z.string().trim().min(2),
  beneficiaryCity: z.string().trim().min(1),
  currencyId: z.string().uuid(),
  amount: z.string().refine((value) => Number(value) > 0),
  commissionAmount: z.string().optional(),
  commissionBearer: z.nativeEnum(CommissionBearer),
  payoutCurrencyId: z.string().uuid().optional(),
  paymentMethod: z.nativeEnum(PaymentMethod),
  // Optional in the schema and checked in the refinement below: a deal funded
  // by a partner office never touches one of this office's boxes.
  cashBoxId: z.string().uuid().optional().or(z.literal('')),
  senderCorrespondentId: z.string().uuid().optional().or(z.literal('')),
  payoutCorrespondentId: z.string().uuid().optional().or(z.literal('')),
  notes: z.string().optional(),
});

type SendTransferForm = z.infer<typeof schema>;

export default function SendTransferPage() {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const createTransfer = useCreateTransfer();
  const { data: currencies } = useCurrencies();

  const [senderCustomer, setSenderCustomer] = useState<Customer | null>(null);
  const [beneficiaryCustomer, setBeneficiaryCustomer] = useState<Customer | null>(null);
  /** Empty means "let the commission rules decide" - the server fills it in. */
  const [overrideCommission, setOverrideCommission] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<SendTransferForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      senderName: '',
      senderPhone: '',
      beneficiaryName: '',
      beneficiaryPhone: '',
      beneficiaryCountry: '',
      beneficiaryCity: '',
      amount: '',
      commissionAmount: '',
      commissionBearer: CommissionBearer.SENDER,
      paymentMethod: PaymentMethod.CASH,
      cashBoxId: user?.defaultCashBoxId ?? '',
      senderCorrespondentId: '',
      payoutCorrespondentId: '',
    },
  });

  const values = watch();

  // Preselect the operator's own cash box once the reference data has loaded.
  useEffect(() => {
    if (!values.cashBoxId && user?.defaultCashBoxId) {
      setValue('cashBoxId', user.defaultCashBoxId);
    }
  }, [user?.defaultCashBoxId, values.cashBoxId, setValue]);

  const quotePayload = useMemo(() => {
    if (!values.currencyId || !values.amount || Number(values.amount) <= 0) return null;
    return {
      currencyId: values.currencyId,
      amount: values.amount,
      commissionAmount: overrideCommission ? (values.commissionAmount || '0') : null,
      commissionBearer: values.commissionBearer,
      payoutCurrencyId: values.payoutCurrencyId || null,
    };
  }, [
    values.currencyId,
    values.amount,
    values.commissionAmount,
    values.commissionBearer,
    values.payoutCurrencyId,
    overrideCommission,
  ]);

  const quote = useTransferQuote(quotePayload);

  const payInCurrency = currencies?.find((currency) => currency.id === values.currencyId);
  const payoutCurrency =
    currencies?.find((currency) => currency.id === values.payoutCurrencyId) ?? payInCurrency;

  const onSubmit = handleSubmit(async (form) => {
    const result = await createTransfer.mutateAsync({
      senderCustomerId: senderCustomer?.id ?? null,
      senderName: form.senderName,
      senderPhone: form.senderPhone,
      beneficiaryCustomerId: beneficiaryCustomer?.id ?? null,
      beneficiaryName: form.beneficiaryName,
      beneficiaryPhone: form.beneficiaryPhone,
      beneficiaryCountry: form.beneficiaryCountry,
      beneficiaryCity: form.beneficiaryCity,
      currencyId: form.currencyId,
      amount: form.amount,
      commissionAmount: overrideCommission ? form.commissionAmount || '0' : null,
      commissionBearer: form.commissionBearer,
      payoutCurrencyId: form.payoutCurrencyId || null,
      paymentMethod: form.paymentMethod,
      // Exactly one funding channel reaches the server.
      cashBoxId: form.senderCorrespondentId ? null : form.cashBoxId || null,
      senderCorrespondentId: form.senderCorrespondentId || null,
      payoutCorrespondentId: form.payoutCorrespondentId || null,
      notes: form.notes || null,
    });

    navigate(`/transfers/${result.data.id}`);
  });

  return (
    <>
      <PageHeader
        title={t('transfer.sendTitle')}
        subtitle={t('transfer.sendSubtitle')}
        icon={<Send className="size-5" />}
      />

      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-3" noValidate>
        <div className="space-y-6 lg:col-span-2">
          {/* ------------------------------------------------------- parties */}
          <Card>
            <CardHeader>
              <CardTitle>{t('transfer.sender')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField label={t('transfer.existingCustomer')} hint={t('transfer.walkIn')}>
                <CustomerPicker
                  value={senderCustomer}
                  onSelect={(customer) => {
                    setSenderCustomer(customer);
                    setValue('senderName', customer.fullName, { shouldValidate: true });
                    setValue('senderPhone', customer.phone, { shouldValidate: true });
                  }}
                  onClear={() => setSenderCustomer(null)}
                />
              </FormField>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  label={t('transfer.senderName')}
                  required
                  error={errors.senderName && t('validation.required')}
                >
                  <Input invalid={Boolean(errors.senderName)} {...register('senderName')} />
                </FormField>
                <FormField
                  label={t('transfer.senderPhone')}
                  required
                  error={errors.senderPhone && t('validation.invalidPhone')}
                >
                  <Input dir="ltr" invalid={Boolean(errors.senderPhone)} {...register('senderPhone')} />
                </FormField>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('transfer.beneficiary')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField label={t('transfer.existingCustomer')} hint={t('transfer.walkIn')}>
                <CustomerPicker
                  value={beneficiaryCustomer}
                  onSelect={(customer) => {
                    setBeneficiaryCustomer(customer);
                    setValue('beneficiaryName', customer.fullName, { shouldValidate: true });
                    setValue('beneficiaryPhone', customer.phone, { shouldValidate: true });
                    if (customer.country) setValue('beneficiaryCountry', customer.country);
                    if (customer.city) setValue('beneficiaryCity', customer.city);
                  }}
                  onClear={() => setBeneficiaryCustomer(null)}
                />
              </FormField>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  label={t('transfer.beneficiaryName')}
                  required
                  error={errors.beneficiaryName && t('validation.required')}
                >
                  <Input
                    invalid={Boolean(errors.beneficiaryName)}
                    {...register('beneficiaryName')}
                  />
                </FormField>
                <FormField
                  label={t('transfer.beneficiaryPhone')}
                  required
                  error={errors.beneficiaryPhone && t('validation.invalidPhone')}
                >
                  <Input
                    dir="ltr"
                    invalid={Boolean(errors.beneficiaryPhone)}
                    {...register('beneficiaryPhone')}
                  />
                </FormField>
                <FormField
                  label={t('transfer.country')}
                  required
                  error={errors.beneficiaryCountry && t('validation.required')}
                >
                  <Input
                    invalid={Boolean(errors.beneficiaryCountry)}
                    {...register('beneficiaryCountry')}
                  />
                </FormField>
                <FormField
                  label={t('transfer.city')}
                  required
                  error={errors.beneficiaryCity && t('validation.required')}
                >
                  <Input
                    invalid={Boolean(errors.beneficiaryCity)}
                    {...register('beneficiaryCity')}
                  />
                </FormField>
              </div>
            </CardContent>
          </Card>

          {/* -------------------------------------------------------- money */}
          <Card>
            <CardHeader>
              <CardTitle>{t('common.amount')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  label={t('common.currency')}
                  required
                  error={errors.currencyId && t('validation.selectOption')}
                >
                  <Controller
                    control={control}
                    name="currencyId"
                    render={({ field }) => (
                      <CurrencySelect
                        value={field.value}
                        onChange={field.onChange}
                        invalid={Boolean(errors.currencyId)}
                      />
                    )}
                  />
                </FormField>

                <FormField
                  label={t('transfer.amount')}
                  required
                  error={errors.amount && t('validation.amountPositive')}
                >
                  <NumericInput
                    placeholder="0"
                    invalid={Boolean(errors.amount)}
                    {...register('amount')}
                  />
                </FormField>

                <FormField
                  label={t('transfer.payoutCurrency')}
                  hint={t('transfer.crossCurrencyNote', {
                    from: payInCurrency?.code ?? '-',
                    to: payoutCurrency?.code ?? '-',
                  })}
                >
                  <Controller
                    control={control}
                    name="payoutCurrencyId"
                    render={({ field }) => (
                      <CurrencySelect
                        value={field.value}
                        onChange={field.onChange}
                        placeholder={payInCurrency?.code ?? t('common.selectCurrency')}
                      />
                    )}
                  />
                </FormField>

                <FormField label={t('transfer.commissionBearer')}>
                  <Controller
                    control={control}
                    name="commissionBearer"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={CommissionBearer.SENDER}>
                            {t('enum.SENDER')}
                          </SelectItem>
                          <SelectItem value={CommissionBearer.BENEFICIARY}>
                            {t('enum.BENEFICIARY')}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </FormField>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="override-commission"
                  type="checkbox"
                  className="size-4 accent-[#06332e]"
                  checked={overrideCommission}
                  onChange={(event) => setOverrideCommission(event.target.checked)}
                />
                <label htmlFor="override-commission" className="text-sm text-[var(--text-secondary)]">
                  {t('transfer.commission')}
                </label>
              </div>

              {overrideCommission ? (
                <FormField label={t('transfer.commission')}>
                  <NumericInput placeholder="0" {...register('commissionAmount')} />
                </FormField>
              ) : null}

              <Separator />

              <div className="grid gap-4 sm:grid-cols-2">
{/*
                  Funding: this office's counter, or a partner that already
                  collected the money abroad. Picking a correspondent disables
                  the box, because both would mean booking the money twice.
                */}
                <FormField
                  label={t('transfer.cashBox')}
                  required={!values.senderCorrespondentId}
                  error={errors.cashBoxId && t('validation.selectOption')}
                >
                  <Controller
                    control={control}
                    name="cashBoxId"
                    render={({ field }) => (
                      <CashBoxSelect
                        value={field.value}
                        onChange={field.onChange}
                        disabled={Boolean(values.senderCorrespondentId)}
                        invalid={Boolean(errors.cashBoxId)}
                      />
                    )}
                  />
                </FormField>

                <FormField
                  label={t('correspondent.fundedBy')}
                  hint={t('correspondent.fundedByHint')}
                >
                  <Controller
                    control={control}
                    name="senderCorrespondentId"
                    render={({ field }) => (
                      <CorrespondentSelect
                        value={field.value || undefined}
                        onChange={(next) => field.onChange(next ?? '')}
                      />
                    )}
                  />
                </FormField>

                <FormField
                  label={t('correspondent.paidThrough')}
                  hint={t('correspondent.paidThroughHint')}
                >
                  <Controller
                    control={control}
                    name="payoutCorrespondentId"
                    render={({ field }) => (
                      <CorrespondentSelect
                        value={field.value || undefined}
                        onChange={(next) => field.onChange(next ?? '')}
                      />
                    )}
                  />
                </FormField>

                <FormField label={t('transfer.paymentMethod')}>
                  <Controller
                    control={control}
                    name="paymentMethod"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.values(PaymentMethod).map((method) => (
                            <SelectItem key={method} value={method}>
                              {t(`enum.${method}` as never)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </FormField>
              </div>

              <FormField label={t('common.notes')}>
                <Textarea rows={2} {...register('notes')} />
              </FormField>
            </CardContent>
          </Card>
        </div>

        {/* --------------------------------------------------------- summary */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>{t('transfer.summary')}</CardTitle>
              <p className="text-xs text-[var(--text-muted)]">{t('transfer.quoteHint')}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {quote.isError ? (
                <Alert tone="warning">{t('rate.noRate')}</Alert>
              ) : !quote.data ? (
                <p className="py-6 text-center text-sm text-[var(--text-muted)]">
                  {t('common.noResults')}
                </p>
              ) : (
                <dl className="space-y-2.5 text-sm">
                  <SummaryRow label={t('transfer.amount')}>
                    <Money value={quote.data.amount} currency={payInCurrency} />
                  </SummaryRow>
                  <SummaryRow label={t('transfer.commission')}>
                    <Money
                      value={quote.data.commissionAmount}
                      currency={{
                        code: quote.data.commissionCurrencyCode,
                        decimalPlaces: payoutCurrency?.decimalPlaces ?? 2,
                      }}
                    />
                  </SummaryRow>
                  {quote.data.isCrossCurrency ? (
                    <SummaryRow label={t('transfer.exchangeRate')}>
                      <span className="numeric font-medium">
                        {formatRate(quote.data.exchangeRate, language)}
                      </span>
                    </SummaryRow>
                  ) : null}

                  <Separator className="my-3" />

                  <SummaryRow label={t('transfer.totalCollected')} emphasis>
                    <Money
                      value={quote.data.totalCollected}
                      currency={payInCurrency}
                      className="text-base"
                    />
                  </SummaryRow>
                  <SummaryRow label={t('transfer.payoutAmount')} emphasis>
                    <Money
                      value={quote.data.payoutAmount}
                      currency={payoutCurrency}
                      className="text-base text-brand-700"
                    />
                  </SummaryRow>

                  {quote.data.commissionRuleName ? (
                    <p className="pt-2 text-xs text-[var(--text-muted)]">
                      {quote.data.commissionRuleName}
                    </p>
                  ) : null}
                </dl>
              )}

              <Button
                type="submit"
                className="w-full"
                size="lg"
                loading={createTransfer.isPending}
                disabled={!quote.data}
              >
                <Send />
                {t('transfer.new')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </form>
    </>
  );
}

function SummaryRow({
  label,
  children,
  emphasis,
}: {
  label: string;
  children: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className={emphasis ? 'font-medium text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}>
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}
