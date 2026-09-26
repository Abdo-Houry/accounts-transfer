import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'info' | 'success' | 'warning' | 'error';

const TONE_STYLES: Record<Tone, { wrapper: string; icon: typeof Info }> = {
  info: {
    wrapper: 'bg-[var(--color-info-soft)] text-[var(--color-info)] border-[var(--color-info)]/25',
    icon: Info,
  },
  success: {
    wrapper:
      'bg-[var(--color-positive-soft)] text-[var(--color-positive)] border-[var(--color-positive)]/25',
    icon: CheckCircle2,
  },
  warning: {
    wrapper:
      'bg-[var(--color-warning-soft)] text-[var(--color-warning)] border-[var(--color-warning)]/25',
    icon: AlertTriangle,
  },
  error: {
    wrapper:
      'bg-[var(--color-negative-soft)] text-[var(--color-negative)] border-[var(--color-negative)]/25',
    icon: XCircle,
  },
};

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
  title?: string;
}

export function Alert({ tone = 'info', title, className, children, ...props }: AlertProps) {
  const { wrapper, icon: Icon } = TONE_STYLES[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-lg border p-3.5 text-sm', wrapper, className)}
      {...props}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && 'mt-0.5 opacity-90')}>{children}</div> : null}
      </div>
    </div>
  );
}
