import { type ReactNode } from 'react';
import { AlertCircle, Inbox, Loader2, Search } from 'lucide-react';
import { Badge, Button, Card, Input, Label } from '@/components/ui';
import { useI18n } from '@/context/i18n-context';
import { usePermissions } from '@/context/auth-context';
import { formatAmount } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { PermissionCode } from '@/lib/permissions';
import type { Currency, Decimal } from '@/types/api';

// ------------------------------------------------------------- page header

export function PageHeader({
  title,
  subtitle,
  actions,
  icon,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        {icon ? (
          <span className="mt-0.5 flex size-10 items-center justify-center rounded-lg bg-brand-700 text-gold-200">
            {icon}
          </span>
        ) : null}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            {title}
          </h1>
          {subtitle ? <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

// ------------------------------------------------------------------ states

export function LoadingState({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-[var(--text-muted)]">
      <Loader2 className="size-6 animate-spin" aria-hidden />
      <p className="text-sm">{label ?? t('common.loading')}</p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--text-muted)]">
        {icon ?? <Inbox className="size-5" aria-hidden />}
      </span>
      <div>
        <p className="font-medium text-[var(--text-primary)]">{title ?? t('common.emptyTitle')}</p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {description ?? t('common.noResultsHint')}
        </p>
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-[var(--color-negative-soft)] text-[var(--color-negative)]">
        <AlertCircle className="size-5" aria-hidden />
      </span>
      <div>
        <p className="font-medium text-[var(--text-primary)]">{t('common.errorTitle')}</p>
        {message ? <p className="mt-1 max-w-md text-sm text-[var(--text-muted)]">{message}</p> : null}
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------- money

/**
 * The single way an amount is rendered.
 *
 * Tabular figures and a fixed left-to-right direction keep a column of money
 * aligned digit for digit even inside an Arabic RTL layout, and `signed` colours
 * an inflow and an outflow differently because on a cash screen that
 * distinction has to survive a glance.
 */
export function Money({
  value,
  currency,
  signed = false,
  className,
  showCode = true,
}: {
  value: Decimal | null | undefined;
  currency?: Pick<Currency, 'code' | 'decimalPlaces'>;
  signed?: boolean;
  className?: string;
  showCode?: boolean;
}) {
  const { language } = useI18n();
  const numeric = Number(value ?? 0);
  const tone = signed
    ? numeric > 0
      ? 'text-[var(--color-positive)]'
      : numeric < 0
        ? 'text-[var(--color-negative)]'
        : ''
    : '';

  return (
    <span className={cn('numeric font-medium', tone, className)}>
      {signed && numeric > 0 ? '+' : ''}
      {formatAmount(value, currency?.decimalPlaces ?? 2, language)}
      {showCode && currency ? <span className="ms-1 text-xs opacity-70">{currency.code}</span> : null}
    </span>
  );
}

// ------------------------------------------------------------------ badges

const STATUS_TONES: Record<string, 'neutral' | 'brand' | 'gold' | 'positive' | 'negative' | 'warning' | 'info'> = {
  PENDING: 'warning',
  SENT: 'info',
  RECEIVED: 'positive',
  CANCELLED: 'negative',
  COMPLETED: 'positive',
  REVERSED: 'negative',
  POSTED: 'positive',
  VOIDED: 'negative',
  active: 'positive',
  suspended: 'negative',
  blocked: 'negative',
  closed: 'neutral',
  SUCCESS: 'positive',
  FAILURE: 'negative',
  DEBIT: 'positive',
  CREDIT: 'negative',
  BUY: 'info',
  SELL: 'gold',
};

export function StatusBadge({ value, className }: { value: string | null | undefined; className?: string }) {
  const { tEnum } = useI18n();
  if (!value) return <span className="text-[var(--text-muted)]">-</span>;
  return (
    <Badge tone={STATUS_TONES[value] ?? 'neutral'} className={className}>
      {tEnum(value)}
    </Badge>
  );
}

// ------------------------------------------------------------------- forms

export function FormField({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-[var(--color-negative)]">{error}</p>
      ) : hint ? (
        <p className="text-xs text-[var(--text-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-muted)]" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder ?? t('common.searchPlaceholder')}
        className="ps-9"
        type="search"
      />
    </div>
  );
}

// ------------------------------------------------------------- permissions

/** Hides UI the user cannot use. The server still enforces the same rule. */
export function PermissionGate({
  permission,
  anyOf,
  children,
  fallback = null,
}: {
  permission?: PermissionCode;
  anyOf?: PermissionCode[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can, canAny } = usePermissions();
  const allowed = permission ? can(permission) : anyOf ? canAny(...anyOf) : true;
  return <>{allowed ? children : fallback}</>;
}

// ---------------------------------------------------------------- stat card

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'brand',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'brand' | 'gold' | 'positive' | 'negative' | 'warning' | 'info';
}) {
  const toneClass: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-700',
    gold: 'bg-gold-100 text-gold-800',
    positive: 'bg-[var(--color-positive-soft)] text-[var(--color-positive)]',
    negative: 'bg-[var(--color-negative-soft)] text-[var(--color-negative)]',
    warning: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
    info: 'bg-[var(--color-info-soft)] text-[var(--color-info)]',
  };

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-[var(--text-muted)]">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            {value}
          </p>
          {hint ? <div className="mt-1 text-xs text-[var(--text-muted)]">{hint}</div> : null}
        </div>
        {icon ? (
          <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', toneClass[tone])}>
            {icon}
          </span>
        ) : null}
      </div>
    </Card>
  );
}
