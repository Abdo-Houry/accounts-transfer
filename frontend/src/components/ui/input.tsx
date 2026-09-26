import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'flex h-10 w-full rounded-lg border bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--text-primary)] transition-colors',
        'placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:border-gold-400',
        'disabled:cursor-not-allowed disabled:opacity-60',
        invalid ? 'border-[var(--color-negative)]' : 'border-[var(--border-strong)]',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

/** Amount / rate input: latin digits, tabular figures, always left-to-right. */
export const NumericInput = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <Input
      ref={ref}
      inputMode="decimal"
      autoComplete="off"
      dir="ltr"
      className={cn('numeric text-start text-base font-semibold', className)}
      {...props}
    />
  ),
);
NumericInput.displayName = 'NumericInput';

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(({ className, invalid, ...props }, ref) => (
  <textarea
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(
      'flex min-h-20 w-full rounded-lg border bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--text-primary)]',
      'placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
      invalid ? 'border-[var(--color-negative)]' : 'border-[var(--border-strong)]',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';
