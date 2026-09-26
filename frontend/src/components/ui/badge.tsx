import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-[var(--surface-muted)] text-[var(--text-secondary)]',
        brand: 'bg-brand-100 text-brand-700',
        gold: 'bg-gold-100 text-gold-800',
        positive: 'bg-[var(--color-positive-soft)] text-[var(--color-positive)]',
        negative: 'bg-[var(--color-negative-soft)] text-[var(--color-negative)]',
        warning: 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
        info: 'bg-[var(--color-info-soft)] text-[var(--color-info)]',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { badgeVariants };
