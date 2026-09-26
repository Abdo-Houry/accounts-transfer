import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Native checkbox, styled. The Radix checkbox package is not in the project
 * dependency list, and a native input is fully accessible on its own.
 */
export const Checkbox = forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="checkbox"
    className={cn(
      'size-4 shrink-0 cursor-pointer rounded border-[var(--border-strong)] accent-[#06332e]',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
      className,
    )}
    {...props}
  />
));
Checkbox.displayName = 'Checkbox';
