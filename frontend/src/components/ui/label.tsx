import { forwardRef } from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/utils';

export const Label = forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & { required?: boolean }
>(({ className, required, children, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      'text-sm font-medium text-[var(--text-secondary)] peer-disabled:opacity-60',
      className,
    )}
    {...props}
  >
    {children}
    {required ? <span className="text-[var(--color-negative)] ms-1">*</span> : null}
  </LabelPrimitive.Root>
));
Label.displayName = 'Label';
