import { useI18n } from '@/context/i18n-context';
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { ReportPeriod } from '@/types/enums';
import type { MessageKey } from '@/i18n';

export interface PeriodValue {
  period: ReportPeriod;
  from?: string;
  to?: string;
}

const PERIOD_LABELS: Array<{ value: ReportPeriod; key: MessageKey }> = [
  { value: ReportPeriod.TODAY, key: 'common.today' },
  { value: ReportPeriod.WEEK, key: 'common.week' },
  { value: ReportPeriod.MONTH, key: 'common.month' },
  { value: ReportPeriod.YEAR, key: 'common.year' },
  { value: ReportPeriod.CUSTOM, key: 'common.custom' },
];

/**
 * Period selector shared by the dashboard and every report.
 *
 * Choosing anything other than "custom" clears the explicit bounds, so the
 * server resolves the range itself and the two cannot disagree.
 */
export function PeriodFilter({
  value,
  onChange,
  className,
}: {
  value: PeriodValue;
  onChange: (value: PeriodValue) => void;
  className?: string;
}) {
  const { t } = useI18n();

  return (
    <div className={className ?? 'flex flex-wrap items-end gap-2'}>
      <Select
        value={value.period}
        onValueChange={(next) =>
          onChange(
            next === ReportPeriod.CUSTOM
              ? { ...value, period: ReportPeriod.CUSTOM }
              : { period: next as ReportPeriod },
          )
        }
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder={t('common.period')} />
        </SelectTrigger>
        <SelectContent>
          {PERIOD_LABELS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {t(option.key)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {value.period === ReportPeriod.CUSTOM ? (
        <>
          <Input
            type="date"
            aria-label={t('common.from')}
            value={value.from ?? ''}
            onChange={(event) => onChange({ ...value, from: event.target.value })}
            className="w-40"
          />
          <Input
            type="date"
            aria-label={t('common.to')}
            value={value.to ?? ''}
            onChange={(event) => onChange({ ...value, to: event.target.value })}
            className="w-40"
          />
        </>
      ) : null}
    </div>
  );
}

/** Converts the selector value into the query parameters the API expects. */
export function periodToParams(value: PeriodValue): { period: ReportPeriod; from?: string; to?: string } {
  if (value.period !== ReportPeriod.CUSTOM) return { period: value.period };
  return {
    period: ReportPeriod.CUSTOM,
    from: value.from ? new Date(`${value.from}T00:00:00`).toISOString() : undefined,
    to: value.to ? new Date(`${value.to}T23:59:59`).toISOString() : undefined,
  };
}
