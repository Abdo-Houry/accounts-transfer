import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, User as UserIcon } from 'lucide-react';
import {
  Button,
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
import { EmptyState, LoadingState, SearchInput } from './index';
import { useCashBoxes, useCurrencies, useCustomerSearch, useCorrespondents } from '@/features/reference/use-reference';
import { useDebouncedValue } from '@/features/reference/use-debounced-value';
import { useI18n } from '@/context/i18n-context';
import { localizedName } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Customer } from '@/types/api';

/** Currency picker driven by the office's own active currency list. */
export function CurrencySelect({
  value,
  onChange,
  disabled,
  invalid,
  includeInactive = false,
  exclude,
  placeholder,
  className,
}: {
  value: string | undefined;
  onChange: (currencyId: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  includeInactive?: boolean;
  exclude?: string;
  placeholder?: string;
  className?: string;
}) {
  const { t, language } = useI18n();
  const { data: currencies } = useCurrencies(includeInactive);

  const options = useMemo(
    () => (currencies ?? []).filter((currency) => currency.id !== exclude),
    [currencies, exclude],
  );

  return (
    <Select value={value ?? ''} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger invalid={invalid} className={className}>
        <SelectValue placeholder={placeholder ?? t('common.selectCurrency')} />
      </SelectTrigger>
      <SelectContent>
        {options.map((currency) => (
          <SelectItem key={currency.id} value={currency.id}>
            <span className="flex items-center gap-2">
              <span className="numeric font-semibold">{currency.code}</span>
              <span className="text-[var(--text-muted)]">
                {localizedName(
                  { nameAr: currency.nameAr, nameEn: currency.nameEn, nameTr: currency.nameTr },
                  language,
                )}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function CashBoxSelect({
  value,
  onChange,
  disabled,
  invalid,
  includeClosed = false,
  placeholder,
  className,
}: {
  value: string | undefined;
  onChange: (cashBoxId: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  includeClosed?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const { t, language } = useI18n();
  const { data: cashBoxes } = useCashBoxes(includeClosed);

  return (
    <Select value={value ?? ''} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger invalid={invalid} className={className}>
        <SelectValue placeholder={placeholder ?? t('common.selectCashBox')} />
      </SelectTrigger>
      <SelectContent>
        {(cashBoxes ?? []).map((box) => (
          <SelectItem key={box.id} value={box.id}>
            {localizedName(box, language)}
            <span className="ms-2 text-xs text-[var(--text-muted)]">{box.code}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Partner-office picker.
 *
 * Always clearable: routing a transfer through a correspondent is the exception
 * rather than the rule, and an operator who picked one by mistake has to be
 * able to fall back to a cash box without reloading the form.
 */
export function CorrespondentSelect({
  value,
  onChange,
  disabled,
  invalid,
  placeholder,
  className,
  allowNone = true,
}: {
  value: string | undefined;
  onChange: (correspondentId: string | undefined) => void;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
  className?: string;
  allowNone?: boolean;
}) {
  const { t, language } = useI18n();
  const { data: correspondents } = useCorrespondents();

  const NONE = '__none__';

  return (
    <Select
      value={value ?? NONE}
      onValueChange={(next) => onChange(next === NONE ? undefined : next)}
      disabled={disabled}
    >
      <SelectTrigger invalid={invalid} className={className}>
        <SelectValue placeholder={placeholder ?? t('common.select')} />
      </SelectTrigger>
      <SelectContent>
        {allowNone ? <SelectItem value={NONE}>{t('common.none')}</SelectItem> : null}
        {(correspondents ?? []).map((one) => (
          <SelectItem key={one.id} value={one.id}>
            {localizedName(one, language)}
            <span className="ms-2 text-xs text-[var(--text-muted)]">{one.code}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Customer picker.
 *
 * Deliberately optional everywhere it appears: a walk-in customer is a normal
 * case at a remittance counter, so the operation must be completable with a
 * plain name and phone instead of forcing a registration first.
 */
export function CustomerPicker({
  value,
  onSelect,
  onClear,
  disabled,
}: {
  value: Customer | null;
  onSelect: (customer: Customer) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  // Debounced so typing narrows the list without a request per keystroke.
  const debouncedTerm = useDebouncedValue(term, 300);
  const { data: results, isLoading } = useCustomerSearch(debouncedTerm);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn('w-full justify-between font-normal', !value && 'text-[var(--text-muted)]')}
      >
        <span className="flex min-w-0 items-center gap-2">
          <UserIcon className="size-4 shrink-0 opacity-70" />
          <span className="truncate">
            {value ? `${value.fullName} · ${value.customerNo}` : t('common.selectCustomer')}
          </span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{t('common.selectCustomer')}</DialogTitle>
          </DialogHeader>

          <SearchInput value={term} onChange={setTerm} />

          <div className="max-h-80 overflow-y-auto">
            {isLoading ? (
              <LoadingState />
            ) : (results ?? []).length === 0 ? (
              <EmptyState />
            ) : (
              <ul className="divide-y divide-[var(--border-subtle)]">
                {(results ?? []).map((customer) => (
                  <li key={customer.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-2 py-3 text-start transition-colors hover:bg-[var(--surface-muted)]"
                      onClick={() => {
                        onSelect(customer);
                        setOpen(false);
                      }}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{customer.fullName}</span>
                        <span className="numeric block text-xs text-[var(--text-muted)]">
                          {customer.phone} · {customer.customerNo}
                        </span>
                      </span>
                      {value?.id === customer.id ? (
                        <Check className="size-4 text-brand-600" />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {value ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                onClear();
                setOpen(false);
              }}
            >
              {t('common.clearFilters')}
            </Button>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
